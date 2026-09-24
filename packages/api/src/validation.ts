import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { z } from "zod";
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const v = schema.safeParse(value);
  if (!v.success)
    throw new BadRequestException(
      v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  return v.data;
}
export function uuid(value: string) {
  return parse(z.uuid(), value);
}
export function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error)
    throw new ServiceUnavailableException("Database operation failed.");
  return result.data;
}
export function found<T>(result: { data: T; error: unknown }): NonNullable<T> {
  const value = checked(result);
  if (!value) throw new NotFoundException("Record not found.");
  return value as NonNullable<T>;
}
export const macroSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    category: z.enum([
      "General",
      "Orders",
      "Returns",
      "Account",
      "Billing",
      "Technical",
    ]),
    content: z.string().trim().min(10).max(8000),
    tags: z.array(z.string().trim().min(1).max(30)).max(15),
  })
  .strict();
export const settingsSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    tone: z.enum(["friendly", "professional", "empathetic", "concise"]),
    retention_days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  })
  .strict();
