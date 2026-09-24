import Workspace from "@/components/workspace";
export default function Page() {
  const configured = Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.API_INTERNAL_URL,
  );
  if (
    process.env.NODE_ENV === "production" &&
    !configured &&
    process.env.DRAFTPILOT_DEMO !== "1"
  )
    return (
      <main className="auth-form" style={{ paddingTop: 100 }}>
        <h2>Workspace setup required</h2>
        <p className="muted">
          This deployment is not connected yet. Complete the server
          configuration before opening it to customers.
        </p>
      </main>
    );
  return <Workspace configured={configured} />;
}
