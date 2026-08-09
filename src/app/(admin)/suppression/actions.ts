"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const suppressionSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  reason: z.enum(["STOP", "UNSUBSCRIBED", "INVALID", "MANUAL BLOCK"]),
});

export async function addSuppressionAction(formData: FormData) {
  await requireAdmin();
  const parsed = suppressionSchema.safeParse({ email: formData.get("email"), reason: formData.get("reason") });
  if (!parsed.success) redirect("/suppression?notice=invalid");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_suppression_entry", {
    p_email: parsed.data.email,
    p_reason: parsed.data.reason,
  });
  revalidatePath("/suppression");
  revalidatePath("/campaigns");
  redirect(error ? "/suppression?notice=error" : "/suppression?notice=added");
}

export async function removeSuppressionAction(formData: FormData) {
  await requireAdmin();
  const suppressionId = z.uuid().safeParse(formData.get("suppressionId"));
  if (!suppressionId.success) redirect("/suppression?notice=invalid");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("remove_suppression_entry", { p_suppression_id: suppressionId.data });
  revalidatePath("/suppression");
  redirect(error || !data ? "/suppression?notice=error" : "/suppression?notice=removed");
}
