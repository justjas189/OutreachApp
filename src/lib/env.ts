import { z } from "zod";

const supabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const googleServiceAccountSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().min(40),
});

export type EmailMode = "preview" | "draft" | "live";

export function getSupabaseConfig() {
  const parsed = supabaseSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      "Supabase environment is incomplete. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getGoogleServiceAccountConfig() {
  const parsed = googleServiceAccountSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      "Google Sheets service-account environment is incomplete. Configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
    );
  }

  return {
    email: parsed.data.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: parsed.data.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

export function parseEmailMode(value: string | undefined): EmailMode {
  const parsed = z.enum(["preview", "draft", "live"]).safeParse(value);
  return parsed.success ? parsed.data : "preview";
}

export function getEmailMode(): EmailMode {
  return parseEmailMode(process.env.EMAIL_MODE);
}
