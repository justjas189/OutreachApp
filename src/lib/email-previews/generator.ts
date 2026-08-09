import { renderEmailTemplates } from "@/lib/templates/render";
import type { CampaignRow, RecipientRow, TemplateRow } from "@/types/database";

export type GeneratedPreview = {
  recipient_id: string;
  sender_account_id: string;
  subject: string;
  body: string;
};

export function normalizeBusinessType(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

export function generateRecipientPreview(
  campaign: Pick<CampaignRow, "city">,
  recipient: Pick<RecipientRow, "id" | "name" | "email" | "link" | "business_type" | "assigned_sender_id">,
  template: Pick<TemplateRow, "guide_title" | "audience" | "services_focus" | "subject_template" | "body_template">,
): GeneratedPreview {
  if (!recipient.assigned_sender_id) throw new Error("Recipient has no assigned sender.");
  const rendered = renderEmailTemplates(template.subject_template, template.body_template, {
    NAME: recipient.name,
    EMAIL: recipient.email,
    LINK: recipient.link,
    BUSINESS_TYPE: recipient.business_type,
    CITY: campaign.city,
    GUIDE_TITLE: template.guide_title,
    AUDIENCE: template.audience,
    SERVICES: template.services_focus,
  });

  return {
    recipient_id: recipient.id,
    sender_account_id: recipient.assigned_sender_id,
    ...rendered,
  };
}
