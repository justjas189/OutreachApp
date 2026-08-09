import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const config = getSupabaseConfig();

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. proxy.ts handles token refresh writes.
        }
      },
    },
  });
}
