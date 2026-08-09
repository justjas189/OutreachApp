import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";
import { getRuntimeDeliveryModeState } from "@/lib/settings/delivery-mode";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdmin();
  const deliveryState = await getRuntimeDeliveryModeState();

  return (
    <AdminShell adminEmail={admin.email} emailMode={deliveryState.effectiveMode}>
      {children}
    </AdminShell>
  );
}
