import AdminConsole from "@/components/admin-console";
import { notFound, redirect } from "next/navigation";
import { adminSession } from "@/lib/admin-session";
export const metadata = { robots: { index: false, follow: false } };
export default async function AdminPage() {
  const session = await adminSession();
  if (!session) notFound();
  if (!session.aal2) redirect("/admin/verify");
  return <AdminConsole demo={false} />;
}
