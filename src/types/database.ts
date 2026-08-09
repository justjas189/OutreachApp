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
    };
    Enums: {
      campaign_status: CampaignRow["status"];
      recipient_status: RecipientRow["status"];
    };
    CompositeTypes: Record<string, never>;
  };
};
