import type { Metadata } from "next";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { TemplateForm } from "./template-form";

export const metadata: Metadata = { title: "Email templates" };

export default async function TemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: templates, error } = await supabase
    .from("templates")
    .select("id,business_type,guide_title,audience,services_focus,subject_template,body_template")
    .order("business_type");
  if (error) throw new Error("Templates could not be loaded.");

  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <p className="mono text-xs font-bold uppercase tracking-[0.18em] text-[#527184]">Deterministic content</p>
        <h1 className="mt-2 text-4xl font-[800] tracking-[-0.045em]">Email templates</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#526873]">One normalized template per Business Type. Generated output is stored for admin review; no Gmail operation occurs.</p>
      </div>
      <section className="panel mt-8 p-6 sm:p-7">
        <h2 className="text-2xl font-[780] tracking-[-0.035em]">Create template</h2>
        <div className="mt-5"><TemplateForm /></div>
      </section>
      <section className="mt-6 space-y-4">
        {templates?.map((template) => (
          <details className="panel p-6" key={template.id}>
            <summary className="cursor-pointer font-extrabold">{template.business_type} <span className="ml-2 text-sm font-normal text-[#607580]">{template.guide_title}</span></summary>
            <div className="mt-6 border-t border-[#d4ddd9] pt-6"><TemplateForm template={template} /></div>
          </details>
        ))}
      </section>
    </div>
  );
}
