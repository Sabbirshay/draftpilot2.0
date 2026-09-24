import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  ValidationPipe,
  Logger,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import helmet from "helmet";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { WorkspaceController } from "./workspace.controller";
import { DraftsController } from "./drafts.controller";
import { BillingController } from "./billing.controller";
import { AdminController } from "./admin.controller";
import { PlatformController } from "./platform.controller";
import { AuthGuard } from "./auth";
import { assertProduction, config } from "./config";
@Catch()
class SafeErrors implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const message =
      exception instanceof HttpException
        ? exception.message
        : "An unexpected server error occurred.";
    response.status(status).json({ statusCode: status, message });
    if (status >= 500) Logger.error({ event: "request.failed", status }, "API");
  }
}
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [
    WorkspaceController,
    DraftsController,
    BillingController,
    PlatformController,
    AdminController,
  ],
  providers: [AuthGuard, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class AppModule {}
async function bootstrap() {
  assertProduction();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ["error", "warn", "log"],
  });
  app.enableShutdownHooks();
  app.use(helmet());
  const allowed = new Set([
    new URL(config.appUrl).origin,
    ...(process.env.EXTENSION_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ]);
  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      callback(null, !origin || allowed.has(origin));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: false,
    maxAge: 600,
  });
  app.useBodyParser("json", { limit: "220kb" });
  app.use((_req: Request, res: Response, next: () => void) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new SafeErrors());
  if (process.env.NODE_ENV !== "production") {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("DraftPilot API")
        .setVersion("1.0.0")
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup("docs", app, document);
  }
  await app.listen(
    Number(process.env.PORT) || 3001,
    process.env.HOST || "127.0.0.1",
  );
  Logger.log(
    "DraftPilot API is listening. Customer message logging is disabled.",
  );
}
bootstrap().catch(() => {
  Logger.error("API startup failed. Check required configuration.");
  process.exit(1);
});
