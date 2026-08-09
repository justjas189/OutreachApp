import { redirect } from "next/navigation";

import { getOptionalAdmin } from "@/lib/auth/admin";

export default async function HomePage() {
  const admin = await getOptionalAdmin();
  redirect(admin ? "/dashboard" : "/login");
}
