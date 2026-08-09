import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { isAdminClaims } from "./claims";

export async function getOptionalAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims || !isAdminClaims(data.claims)) {
    return null;
  }

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : "Admin",
  };
}

export async function requireAdmin() {
  const admin = await getOptionalAdmin();

  if (!admin) {
    redirect("/login");
  }

  return admin;
}
