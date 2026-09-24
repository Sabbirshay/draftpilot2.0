import AdminConsole from "@/components/admin-console";
export default function AdminPage() {
  const connected = Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.API_INTERNAL_URL,
  );
  return (
    <AdminConsole demo={!connected && process.env.DRAFTPILOT_DEMO === "1"} />
  );
}
