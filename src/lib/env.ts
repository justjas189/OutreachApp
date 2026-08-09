import { z } from "zod";

const supabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const googleServiceAccountSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().min(40),
});

const serverSupabaseSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

const googleOAuthSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(20),
  GOOGLE_CLIENT_SECRET: z.string().min(10),
  GOOGLE_OAUTH_REDIRECT_URI: z.url(),
});

const appUrlSchema = z.url();

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

export function getSupabaseServiceRoleKey(): string {
  const parsed = serverSupabaseSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error("Server Supabase configuration is incomplete. Configure SUPABASE_SERVICE_ROLE_KEY.");
  }

  return parsed.data.SUPABASE_SERVICE_ROLE_KEY;
}

export function getGoogleOAuthConfig() {
  const parsed = googleOAuthSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      "Google OAuth configuration is incomplete. Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.",
    );
  }

  return {
    clientId: parsed.data.GOOGLE_CLIENT_ID,
    clientSecret: parsed.data.GOOGLE_CLIENT_SECRET,
    redirectUri: parsed.data.GOOGLE_OAUTH_REDIRECT_URI,
  };
}

export function getAppUrl(): string {
  const parsed = appUrlSchema.safeParse(process.env.APP_URL);

  if (!parsed.success) {
    throw new Error("Application URL is incomplete. Configure APP_URL.");
  }

  return parsed.data.replace(/\/$/, "");
}

export function parseEmailMode(value: string | undefined): EmailMode {
  const parsed = z.enum(["preview", "draft", "live"]).safeParse(value);
  return parsed.success ? parsed.data : "preview";
}

export function getEmailMode(): EmailMode {
  return parseEmailMode(process.env.EMAIL_MODE);
}
