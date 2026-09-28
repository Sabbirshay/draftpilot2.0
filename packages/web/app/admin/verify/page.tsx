import { notFound, redirect } from "next/navigation";
import { adminSession } from "@/lib/admin-session";
import AdminVerification from "@/components/admin-verification";
export const metadata = { title: "Verify access | DraftPilot", robots: { index: false, follow: false } };
export default async function VerifyAdmin() {
  const session = await adminSession();
  if (!session) notFound();
  if (session.aal2) redirect("/admin");
  return <AdminVerification />;
}
