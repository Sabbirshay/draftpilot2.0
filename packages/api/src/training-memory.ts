import { z } from "zod";
import { scrubPII } from "@draftpilot/shared";
import { serviceDb } from "./config";
import { checked } from "./validation";
export const trainingSchema = z.object({
  title: z.string().trim().min(3).max(100),
  mistake: z.string().trim().min(8).max(2000),
  correction: z.string().trim().min(8).max(2000),
  lesson: z.string().trim().min(8).max(400),
  status: z.enum(["draft", "active", "paused"]),
  revision: z.number().int().min(1).optional(),
  reason: z.string().trim().min(8).max(300),
  globalApproved: z.boolean(),
}).strict();
export function safeLessonContent(input: z.infer<typeof trainingSchema>) {
  return Object.fromEntries(["title", "mistake", "correction", "lesson"].map(key => [key, scrubPII(input[key as "title"]).text]));
}
export async function globalTrainingMemory() {
  const rows = checked(await serviceDb().from("training_lessons")
    .select("id,lesson,revision").eq("status", "active").order("id").limit(20)) || [];
  return rows.map(row => ({id: row.id as string, revision: row.revision as number, lesson: scrubPII(row.lesson).text.slice(0, 400)}));
}
