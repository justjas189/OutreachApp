export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CampaignRow = {
  id: string;
  name: string;
  city: string;
  status: "DRAFT" | "READY" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
  google_sheet_id: string | null;
  worksheet_name: string | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type RecipientRow = {
  id: string;
  campaign_id: string;
  name: string;
  email: string;
  link: string;
  business_type: string;
  assigned_sender_id: string | null;
  status: "PENDING" | "GENERATED" | "APPROVED" | "QUEUED" | "SENT" | "FAILED" | "SUPPRESSED";
  created_at: string;
  sent_at: string | null;
  last_error: string | null;
};

export type SenderAccountRow = {
  id: string;
  email: string | null;
  display_name: string;
  status: "PENDING" | "CONNECTED" | "REVOKED";
  google_account_id: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type SenderInviteRow = {
  id: string;
  expires_at: string;
  used_at: string | null;
  created_by: string;
  sender_label: string;
  sender_account_id: string | null;
  created_at: string;
};

export type TemplateRow = {
  id: string;
  business_type: string;
  guide_title: string;
  audience: string;
  services_focus: string;
  body_template: string;
  subject_template: string;
  created_at: string;
  updated_at: string;
};

export type EmailDraftRow = {
  id: string;
  campaign_id: string;
  recipient_id: string;
  sender_account_id: string | null;
  subject: string;
  body: string;
  status: "GENERATED" | "APPROVED" | "QUEUED" | "SENT" | "FAILED";
  gmail_draft_id: string | null;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
};

type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      campaigns: TableDefinition<
        CampaignRow,
        Partial<CampaignRow> & Pick<CampaignRow, "name" | "city" | "created_by">,
        Partial<CampaignRow>
      >;
      recipients: TableDefinition<
        RecipientRow,
        Partial<RecipientRow> &
          Pick<RecipientRow, "campaign_id" | "name" | "email" | "link" | "business_type">,
        Partial<RecipientRow>
      >;
      sender_accounts: TableDefinition<
        SenderAccountRow,
        Partial<SenderAccountRow> & Pick<SenderAccountRow, "display_name">,
        Partial<SenderAccountRow>
      >;
      sender_invites: TableDefinition<
        SenderInviteRow,
        Partial<SenderInviteRow> &
          Pick<SenderInviteRow, "expires_at" | "created_by" | "sender_label">,
        Partial<SenderInviteRow>
      >;
      templates: TableDefinition<
        TemplateRow,
        Partial<TemplateRow> &
          Pick<
            TemplateRow,
            | "business_type"
            | "guide_title"
            | "audience"
            | "services_focus"
            | "body_template"
            | "subject_template"
          >,
        Partial<TemplateRow>
      >;
      email_drafts: TableDefinition<
        EmailDraftRow,
        Partial<EmailDraftRow> &
          Pick<
            EmailDraftRow,
            "campaign_id" | "recipient_id" | "subject" | "body"
          >,
        Partial<EmailDraftRow>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_campaign_with_recipients: {
        Args: {
          p_name: string;
          p_city: string;
          p_google_sheet_id: string;
          p_worksheet_name: string;
          p_recipients: Json;
        };
        Returns: string;
      };
      create_sender_invitation: {
        Args: {
          p_sender_label: string;
          p_token_hash: string;
          p_expires_at: string;
        };
        Returns: Array<{ sender_account_id: string; sender_invite_id: string }>;
      };
      get_sender_invite_for_connection: {
        Args: { p_token_hash: string };
        Returns: Array<{
          sender_invite_id: string;
          sender_account_id: string | null;
          sender_label: string;
          expires_at: string;
          used_at: string | null;
        }>;
      };
      begin_sender_oauth: {
        Args: {
          p_token_hash: string;
          p_state_hash: string;
          p_encrypted_code_verifier: string;
          p_expires_at: string;
        };
        Returns: string;
      };
      consume_sender_oauth_state: {
        Args: { p_state_hash: string };
        Returns: Array<{ sender_invite_id: string; encrypted_code_verifier: string }>;
      };
      complete_sender_connection: {
        Args: {
          p_sender_invite_id: string;
          p_email: string;
          p_google_account_id: string;
          p_encrypted_refresh_token: string;
        };
        Returns: string;
      };
      revoke_sender_connection: {
        Args: { p_sender_account_id: string };
        Returns: boolean;
      };
      assign_campaign_senders: {
        Args: { p_campaign_id: string; p_sender_ids: string[] };
        Returns: number;
      };
      store_generated_email_previews: {
        Args: { p_campaign_id: string; p_drafts: Json };
        Returns: number;
      };
      approve_email_preview: {
        Args: {
          p_email_draft_id: string;
          p_subject: string;
          p_body: string;
        };
        Returns: string;
      };
      approve_campaign_email_previews: {
        Args: { p_campaign_id: string };
        Returns: number;
      };
    };
    Enums: {
      campaign_status: CampaignRow["status"];
      recipient_status: RecipientRow["status"];
      sender_status: SenderAccountRow["status"];
      draft_status: EmailDraftRow["status"];
    };
    CompositeTypes: Record<string, never>;
  };
};
