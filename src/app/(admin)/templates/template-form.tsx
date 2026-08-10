"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { RichTextEditor } from "@/components/rich-text-editor";
import { plainTextToHtml } from "@/lib/templates/rich-text";
import { TEMPLATE_VARIABLES } from "@/lib/templates/render";
import type { TemplateRow } from "@/types/database";

import { saveTemplateAction } from "./actions";
import { initialTemplateActionState } from "./action-state";

type EditableTemplate = Pick<
  TemplateRow,
  | "id"
  | "business_type"
  | "guide_title"
  | "audience"
  | "services_focus"
  | "subject_template"
  | "body_template"
  | "body_html"
>;

export function TemplateForm({ template }: { template?: EditableTemplate }) {
  const [state, action] = useActionState(saveTemplateAction, initialTemplateActionState);

  return (
    <form action={action} className="space-y-4">
      <input name="id" type="hidden" value={template?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">Business Type<input className="field mt-2" defaultValue={template?.business_type} maxLength={120} name="businessType" required /></label>
        <label className="text-sm font-bold">Guide Title<input className="field mt-2" defaultValue={template?.guide_title} maxLength={160} name="guideTitle" required /></label>
        <label className="text-sm font-bold">Audience<textarea className="field mt-2 min-h-24" defaultValue={template?.audience} maxLength={1000} name="audience" required /></label>
        <label className="text-sm font-bold">Services<textarea className="field mt-2 min-h-24" defaultValue={template?.services_focus} maxLength={1000} name="servicesFocus" required /></label>
      </div>
      <label className="block text-sm font-bold">Subject template<input className="field mono mt-2 text-sm" defaultValue={template?.subject_template} maxLength={1000} name="subjectTemplate" required /></label>
      <RichTextEditor
        initialHtml={template?.body_html ?? plainTextToHtml(template?.body_template ?? "")}
        label="Body template"
        name="bodyHtml"
      />
      <p className="mono text-[0.67rem] leading-5 text-[#607580]">Variables: {TEMPLATE_VARIABLES.map((variable) => `{{${variable}}}`).join(" · ")}</p>
      {state.error ? <p className="text-sm font-bold text-red-800" role="alert">{state.error}</p> : null}
      {state.success ? <p className="text-sm font-bold text-[#1f6e4c]" role="status">{state.success}</p> : null}
      <SubmitButton pendingLabel="Saving…">{template ? "Update template" : "Create template"}</SubmitButton>
    </form>
  );
}
