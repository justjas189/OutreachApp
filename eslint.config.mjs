import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "next-env.d.ts",
    "supabase/.branches/**",
    "supabase/.cache/**",
    "supabase/.local/**",
    "supabase/.temp/**",
  ]),
]);
