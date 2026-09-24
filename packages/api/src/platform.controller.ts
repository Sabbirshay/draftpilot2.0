import {
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Body,
  Param,
  UseGuards,
  ServiceUnavailableException,
  BadRequestException,
} from "@nestjs/common";
import { z } from "zod";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import {
  AuthGuard,
  AuthRequest,
  requirePlatformAdmin,
  audit,
  rate,
  hash,
} from "./auth";
import { serviceDb, configured } from "./config";
import { parse, uuid, checked } from "./validation";
@Controller()
export class PlatformController {
  @Get("health") health() {
    return { status: "ok", version: "1.0.0", configured };
  }
  @Get("ready") async ready() {
    if (!configured)
      throw new ServiceUnavailableException("Database not configured.");
    checked(await serviceDb().from("platform_settings").select("id").limit(1));
    return { status: "ready" };
  }
  @Post("extension/exchange") async exchange(
    @Req() req: Request,
    @Body() raw: unknown,
  ) {
    await rate("exchange:" + req.ip, 10, 300);
    const body = parse(
      z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{32}$/) }).strict(),
      raw,
    );
    const token = "dp_" + randomBytes(32).toString("base64url");
    const { error } = await serviceDb().rpc("redeem_extension", {
      p_code: hash(body.code),
      p_hash: hash(token),
    });
    if (error)
      throw new BadRequestException("Pairing code is invalid or expired.");
    return { token, expiresIn: 7 * 86400 };
  }
  @Post("internal/retention") async retention(@Req() req: Request) {
    const expected = process.env.RETENTION_JOB_SECRET || "";
    const supplied = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const a = Buffer.from(expected),
      b = Buffer.from(supplied);
    if (a.length < 32 || a.length !== b.length || !timingSafeEqual(a, b))
      throw new BadRequestException("Invalid job credential.");
    checked(await serviceDb().rpc("cleanup_retention"));
    return { ok: true };
  }
}
