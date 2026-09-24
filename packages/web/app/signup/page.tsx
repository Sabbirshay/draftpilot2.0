import Workspace from "@/components/workspace";
export default function Page() {
  const configured = Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.API_INTERNAL_URL,
  );
  return (
    <Workspace configured={configured} initialAuthMode="signup" forceAuth />
  );
}
