type AdminUser = {
  email?: string;
  email_confirmed_at?: string;
  app_metadata?: Record<string, unknown>;
  identities?: { provider?: string }[];
};

// Call only after the server has authenticated the access token with Supabase.
export function isGoogleAdministrator(user: AdminUser, claims: { amr?: { method?: string }[] }) {
  return user.email?.toLowerCase() === "mdronykhan4633@gmail.com" &&
    Boolean(user.email_confirmed_at) &&
    user.app_metadata?.platform_admin === true &&
    user.identities?.some(identity => identity.provider === "google") === true &&
    claims.amr?.some(entry => entry.method === "oauth") === true;
}
