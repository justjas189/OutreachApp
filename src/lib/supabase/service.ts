import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig, getSupabaseServiceRoleKey } from "@/lib/env";
import type { Database } from "@/types/database";

export function createSupabaseServiceClient() {
  const config = getSupabaseConfig();

  return createClient<Database>(config.url, getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
