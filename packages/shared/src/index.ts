import { z } from "zod";
export const draftSchema = z.object({
  threadContent: z.string().trim().min(8).max(16000),
  tone: z
    .enum(["friendly", "professional", "empathetic", "concise"])
    .optional(),
  instruction: z.string().trim().max(1000).default(""),
  macroId: z.string().uuid().optional(),
  channel: z
    .enum(["gmail", "outlook", "zendesk", "intercom", "crisp", "mevrik", "other"])
    .default("other"),
  requestId: z.string().uuid(),
});
export type DraftInput = z.infer<typeof draftSchema>;
export type Macro = {
  id: string;
  name: string;
  category: string;
  content: string;
  tags: string[];
  usage_count?: number;
};
export type Knowledge = {
  id: string;
  name: string;
  content?: string;
  chunks_count: number;
  created_at?: string;
  status: string;
};
export type Draft = {
  id: string;
  generated_draft: string;
  created_at: string;
  source: string;
  channel: string;
  status: string;
  sources?: { id: string; name: string }[];
};
export type Workspace = {
  team: {
    id: string;
    name: string;
    plan: string;
    monthly_draft_limit: number;
    tone: string;
    retention_days: number;
    seat_limit?: number;
  };
  user: { id: string; email: string; role: string; full_name: string };
  platformAdmin?: boolean;
  userQuota?: {limit:number|null;used:number;generationBlocked:boolean};
  usage: number;
  macros: Macro[];
  documents: Knowledge[];
  history: Draft[];
  members: { id: string; email: string; role: string; full_name?: string }[];
};
export { scrubPII, cleanDraft, fallbackDraft, rankSources } from "./privacy";
