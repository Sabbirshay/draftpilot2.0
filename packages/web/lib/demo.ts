import type { Workspace } from "@draftpilot/shared";
export const initialWorkspace: Workspace = {
  team: {
    id: "demo",
    name: "Acme Studio",
    plan: "demo",
    monthly_draft_limit: 1000,
    tone: "friendly",
    retention_days: 30,
    seat_limit: 5,
  },
  user: {
    id: "demo-user",
    email: "alex@example.com",
    role: "owner",
    full_name: "Alex Morgan",
  },
  usage: 128,
  macros: [
    {
      id: "f867ef53-e819-4f34-b5aa-586c8d52c754",
      name: "Order status update",
      category: "Orders",
      content:
        "You can find the latest tracking information in your shipping confirmation email. If your tracking has not updated for 3 business days, our team can investigate with the carrier.",
      tags: ["shipping", "tracking", "order"],
      usage_count: 42,
    },
    {
      id: "2b27c150-ed3c-4b8b-915f-4bb15fb3504e",
      name: "A little help with returns",
      category: "Returns",
      content:
        "Unused items in their original packaging can be returned within 30 days of delivery. Contact support to request return instructions. Refunds are processed after the return is received and inspected.",
      tags: ["refund", "return"],
      usage_count: 31,
    },
    {
      id: "2b27c150-ed3c-4b8b-915f-4bb15fb3504f",
      name: "Reset your password",
      category: "Account",
      content:
        "Use the Forgot password link on the sign-in page. We will email a secure reset link. Our support team will never ask for your password.",
      tags: ["login", "password"],
      usage_count: 24,
    },
    {
      id: "2b27c150-ed3c-4b8b-915f-4bb15fb35040",
      name: "Invoice request",
      category: "Billing",
      content:
        "Invoices are available in Settings → Billing. Choose the payment and download your invoice. Let us know if your company details need updating.",
      tags: ["invoice", "billing"],
      usage_count: 18,
    },
  ],
  documents: [
    {
      id: "d1",
      name: "Shipping & delivery guide",
      content:
        "Standard delivery typically takes 3–5 business days after dispatch. Delivery estimates are not guaranteed. Tracking is available in the shipping confirmation email.",
      chunks_count: 1,
      status: "ready",
    },
    {
      id: "d2",
      name: "Returns & refund policy",
      content:
        "Unused items in original packaging may be returned within 30 days. Refunds require inspection of the received return.",
      chunks_count: 1,
      status: "ready",
    },
  ],
  history: [
    {
      id: "h1",
      generated_draft:
        "Hi there,\n\nThanks for reaching out. You can find your tracking information in your shipping confirmation email. If it has not updated for 3 business days, we can investigate with the carrier.\n\nHappy to help,\nCustomer Support Team",
      created_at: "2026-09-14T11:40:00Z",
      source: "sample",
      channel: "gmail",
      status: "reviewed",
    },
    {
      id: "h2",
      generated_draft:
        "Hi there,\n\nYou can download your invoice in Settings → Billing. Let us know if your company details need updating.\n\nCustomer Support Team",
      created_at: "2026-09-14T10:20:00Z",
      source: "sample",
      channel: "outlook",
      status: "draft",
    },
    {
      id: "h3",
      generated_draft:
        "Hi there,\n\nPlease use the Forgot password link on the sign-in page to receive a secure reset link. We will never ask for your password.\n\nCustomer Support Team",
      created_at: "2026-09-14T09:10:00Z",
      source: "sample",
      channel: "zendesk",
      status: "reviewed",
    },
  ],
  members: [
    {
      id: "demo-user",
      full_name: "Alex Morgan",
      email: "alex@example.com",
      role: "owner",
    },
    {
      id: "demo-2",
      full_name: "Jamie Chen",
      email: "jamie@example.com",
      role: "member",
    },
  ],
};
