import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";
import { getEmailMode } from "@/lib/env";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdmin();

  return (
    <AdminShell adminEmail={admin.email} emailMode={getEmailMode()}>
      {children}
    </AdminShell>
  );
}
