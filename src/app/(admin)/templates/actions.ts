"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/admin";
import { normalizeWhitespace } from "@/lib/google-sheets/schema";
import { validateTemplateVariables } from "@/lib/templates/render";
import { normalizeRichTemplate } from "@/lib/templates/rich-text";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { TemplateActionState } from "./action-state";

const templateSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  businessType: z.string().trim().min(2).max(120),
  guideTitle: z.string().trim().min(2).max(160),
  audience: z.string().trim().min(2).max(1000),
  servicesFocus: z.string().trim().min(2).max(1000),
  subjectTemplate: z.string().trim().min(1).max(1000),
  bodyHtml: z.string().trim().min(1).max(100000),
});

export async function saveTemplateAction(
  _previousState: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  await requireAdmin();
  const parsed = templateSchema.safeParse({
    id: formData.get("id") ?? "",
    businessType: formData.get("businessType"),
    guideTitle: formData.get("guideTitle"),
    audience: formData.get("audience"),
    servicesFocus: formData.get("servicesFocus"),
    subjectTemplate: formData.get("subjectTemplate"),
    bodyHtml: formData.get("bodyHtml"),
  });
  if (!parsed.success) return { error: "Complete every template field within supported limits.", success: null };

  let richBody;
  try {
    richBody = normalizeRichTemplate(parsed.data.bodyHtml);
  } catch {
    return { error: "Body template must contain supported text or formatting.", success: null };
  }
  if (richBody.text.length > 50000) return { error: "Body template exceeds supported limits.", success: null };

  const unsupported = [
    ...validateTemplateVariables(parsed.data.subjectTemplate),
    ...validateTemplateVariables(richBody.html),
  ].filter((value, index, values) => values.indexOf(value) === index);
  if (unsupported.length > 0) {
    return { error: `Unsupported variables: ${unsupported.join(", ")}.`, success: null };
  }

  const values = {
    business_type: normalizeWhitespace(parsed.data.businessType),
    guide_title: normalizeWhitespace(parsed.data.guideTitle),
    audience: normalizeWhitespace(parsed.data.audience),
    services_focus: normalizeWhitespace(parsed.data.servicesFocus),
    subject_template: parsed.data.subjectTemplate,
    body_template: richBody.text,
    body_html: richBody.html,
  };
  const supabase = await createSupabaseServerClient();
  const result = parsed.data.id
    ? await supabase.from("templates").update(values).eq("id", parsed.data.id)
    : await supabase.from("templates").insert(values);

  if (result.error) {
    return {
      error: result.error.code === "23505" ? "Business Type already has a template." : "Template could not be saved.",
      success: null,
    };
  }

  revalidatePath("/templates");
  return { error: null, success: parsed.data.id ? "Template updated." : "Template created." };
}
