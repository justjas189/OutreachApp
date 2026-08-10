export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type RuntimeEmailMode = "preview" | "draft" | "live";

export type CampaignRow = {
  id: string;
  name: string;
  city: string;
  status: "DRAFT" | "READY" | "ACTIVE" | "PAUSED" | "COMPLETED" | "FAILED" | "ARCHIVED";
  google_sheet_id: string | null;
  worksheet_name: string | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  scheduled_at: string | null;
  schedule_timezone: string | null;
  paused_at: string | null;
  archived_at: string | null;
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
  invite_creation_key: string | null;
};

export type SenderInviteRow = {
  id: string;
  expires_at: string;
  used_at: string | null;
  created_by: string;
  sender_label: string;
  sender_account_id: string | null;
  created_at: string;
  invalidated_at: string | null;
};

export type TemplateRow = {
  id: string;
  business_type: string;
  guide_title: string;
  audience: string;
  services_focus: string;
  body_template: string;
  body_html: string | null;
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
  body_html: string | null;
  status: "GENERATED" | "APPROVED" | "QUEUED" | "SENT" | "FAILED" | "SUPPRESSED";
  gmail_draft_id: string | null;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
};

export type SuppressionRow = {
  id: string;
  email: string;
  reason: "STOP" | "UNSUBSCRIBED" | "INVALID" | "MANUAL BLOCK";
  source: string;
  created_at: string;
};

export type EmailQueueRow = {
  id: string;
  email_draft_id: string;
  campaign_id: string;
  recipient_id: string;
  sender_account_id: string;
  delivery_mode: "draft" | "live";
  status: "PENDING" | "PROCESSING" | "RETRY" | "COMPLETED" | "FAILED" | "CANCELLED";
  available_at: string;
  attempts: number;
  max_attempts: number;
  claim_token: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  campaign_run_id: string;
  campaign_run_recipient_id: string;
};

export type CampaignRunRow = {
  id: string;
  campaign_id: string;
  run_number: number;
  status: "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
  delivery_mode: RuntimeEmailMode;
  sender_strategy: "single" | "balanced";
  selected_sender_ids: string[];
  batch_size: number;
  run_scope: "all" | "failed";
  retry_of_run_id: string | null;
  scheduled_at: string;
  schedule_timezone: string;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
};

export type CampaignRunRecipientRow = {
  id: string;
  campaign_run_id: string;
  campaign_id: string;
  recipient_id: string;
  email_draft_id: string;
  sender_account_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  body_html: string | null;
  status: "PENDING" | "PROCESSING" | "PREVIEWED" | "DRAFTED" | "SENT" | "FAILED" | "SUPPRESSED" | "CANCELLED";
  last_error_code: string | null;
  last_error_message: string | null;
  completed_at: string | null;
  created_at: string;
};

export type SendLogRow = {
  id: number;
  campaign_id: string;
  recipient_id: string;
  sender_account_id: string | null;
  status: "QUEUED" | "DRAFTED" | "SENT" | "RETRY" | "FAILED" | "SUPPRESSED" | "SKIPPED";
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
  campaign_run_id: string | null;
  email_queue_id: string | null;
};

export type ApplicationSettingsRow = {
  singleton: boolean;
  delivery_mode: RuntimeEmailMode;
  email_batch_size: number;
  updated_by: string | null;
  updated_at: string;
};

export type ApplicationSettingAuditRow = {
  id: number;
  setting_name: "delivery_mode" | "email_batch_size";
  previous_value: string;
  new_value: string;
  changed_by: string;
  changed_at: string;
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
      suppression_list: TableDefinition<
        SuppressionRow,
        Partial<SuppressionRow> & Pick<SuppressionRow, "email" | "reason" | "source">,
        Partial<SuppressionRow>
      >;
      email_queue: TableDefinition<EmailQueueRow, never, never>;
      campaign_runs: TableDefinition<CampaignRunRow, never, never>;
      campaign_run_recipients: TableDefinition<CampaignRunRecipientRow, never, never>;
      send_logs: TableDefinition<
        SendLogRow,
        Partial<SendLogRow> & Pick<SendLogRow, "campaign_id" | "recipient_id" | "status">,
        Partial<SendLogRow>
      >;
      application_settings: TableDefinition<ApplicationSettingsRow, never, never>;
      application_setting_audit: TableDefinition<ApplicationSettingAuditRow, never, never>;
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
      create_or_reinvite_sender: {
        Args: {
          p_sender_label: string;
          p_token_hash: string;
          p_expires_at: string;
          p_request_key: string;
          p_sender_account_id?: string | null;
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
      get_pending_sender_delete_eligibility: {
        Args: { p_sender_account_id: string };
        Returns: Array<{ eligible: boolean; reason: string | null }>;
      };
      delete_expired_pending_sender: {
        Args: { p_sender_account_id: string };
        Returns: boolean;
      };
      assign_campaign_senders: {
        Args: { p_campaign_id: string; p_sender_ids: string[] };
        Returns: number;
      };
      update_campaign_details: {
        Args: { p_campaign_id: string; p_name: string; p_city: string };
        Returns: boolean;
      };
      manage_campaign_lifecycle: {
        Args: { p_campaign_id: string };
        Returns: "DELETED" | "ARCHIVED";
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
          p_body_html: string;
        };
        Returns: string;
      };
      approve_campaign_email_previews: {
        Args: { p_campaign_id: string };
        Returns: number;
      };
      schedule_campaign: {
        Args: { p_campaign_id: string; p_scheduled_at: string; p_schedule_timezone: string };
        Returns: CampaignRow["status"];
      };
      cancel_campaign_schedule: {
        Args: { p_campaign_id: string };
        Returns: boolean;
      };
      pause_campaign: {
        Args: { p_campaign_id: string };
        Returns: boolean;
      };
      resume_campaign: {
        Args: { p_campaign_id: string };
        Returns: CampaignRow["status"];
      };
      apply_campaign_suppressions: {
        Args: { p_campaign_id: string };
        Returns: number;
      };
      add_suppression_entry: {
        Args: { p_email: string; p_reason: SuppressionRow["reason"] };
        Returns: string;
      };
      remove_suppression_entry: {
        Args: { p_suppression_id: string };
        Returns: boolean;
      };
      enqueue_due_campaign_emails: {
        Args: { p_delivery_mode: EmailQueueRow["delivery_mode"] };
        Returns: number;
      };
      claim_email_queue: {
        Args: { p_delivery_mode: EmailQueueRow["delivery_mode"]; p_batch_size: number; p_claim_token: string };
        Returns: Array<{ queue_id: string; delivery_mode: EmailQueueRow["delivery_mode"] }>;
      };
      prepare_claimed_email: {
        Args: { p_queue_id: string; p_claim_token: string };
        Returns: Array<{
          queue_id: string;
          delivery_mode: EmailQueueRow["delivery_mode"];
          recipient_email: string;
          sender_email: string;
          subject: string;
          body: string;
          body_html: string | null;
          encrypted_refresh_token: string;
        }>;
      };
      complete_email_queue_success: {
        Args: {
          p_queue_id: string;
          p_claim_token: string;
          p_provider_message_id: string;
          p_gmail_draft_id?: string | null;
        };
        Returns: boolean;
      };
      complete_email_queue_failure: {
        Args: {
          p_queue_id: string;
          p_claim_token: string;
          p_transient: boolean;
          p_error_code: string;
          p_error_message: string;
        };
        Returns: EmailQueueRow["status"];
      };
      complete_finished_campaigns: {
        Args: Record<string, never>;
        Returns: number;
      };
      set_runtime_email_mode: {
        Args: { p_mode: RuntimeEmailMode };
        Returns: RuntimeEmailMode;
      };
      set_runtime_email_batch_size: {
        Args: { p_batch_size: number; p_live_change_confirmed?: boolean };
        Returns: number;
      };
      get_campaign_readiness: {
        Args: { p_campaign_id: string };
        Returns: Json;
      };
      get_campaign_run_readiness: {
        Args: { p_campaign_id: string; p_recipient_guard_mode?: "allowlist" | "production" };
        Returns: Json;
      };
      create_campaign_run: {
        Args: {
          p_campaign_id: string;
          p_delivery_mode: RuntimeEmailMode;
          p_batch_size: number;
          p_sender_strategy: CampaignRunRow["sender_strategy"];
          p_sender_ids: string[];
          p_run_scope: CampaignRunRow["run_scope"];
          p_scheduled_at: string;
          p_schedule_timezone: string;
          p_recipient_guard_mode?: "allowlist" | "production";
        };
        Returns: string;
      };
    };
    Enums: {
      campaign_status: CampaignRow["status"];
      recipient_status: RecipientRow["status"];
      sender_status: SenderAccountRow["status"];
      draft_status: EmailDraftRow["status"];
      email_queue_status: EmailQueueRow["status"];
      email_delivery_mode: EmailQueueRow["delivery_mode"];
      runtime_email_mode: RuntimeEmailMode;
      campaign_run_status: CampaignRunRow["status"];
      sender_strategy: CampaignRunRow["sender_strategy"];
      campaign_run_scope: CampaignRunRow["run_scope"];
      campaign_run_recipient_status: CampaignRunRecipientRow["status"];
    };
    CompositeTypes: Record<string, never>;
  };
};
