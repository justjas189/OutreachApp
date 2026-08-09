type ClaimsLike = {
  app_metadata?: unknown;
  user_metadata?: unknown;
};

export function isAdminClaims(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") {
    return false;
  }

  const appMetadata = (claims as ClaimsLike).app_metadata;

  return (
    !!appMetadata &&
    typeof appMetadata === "object" &&
    "role" in appMetadata &&
    (appMetadata as { role?: unknown }).role === "admin"
  );
}
