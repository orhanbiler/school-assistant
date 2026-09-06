import "server-only";

function trustedOrigin(value: string, allowLocal = false): string {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol === "https:" || (allowLocal && local && url.protocol === "http:")) &&
        !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch { /* Incomplete configuration keeps access closed. */ }
  return "";
}

export function getAccessConfig() {
  const origin = trustedOrigin(process.env.APP_URL || "", true);
  const supabaseUrl = trustedOrigin(process.env.SUPABASE_URL || "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const ownerEmail = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  const ownerId = (process.env.OWNER_USER_ID || "").trim();
  const secure = origin.startsWith("https:");
  return {
    origin, supabaseUrl, publishableKey, ownerEmail, ownerId, secure,
    cookieName: secure ? "__Host-scholar-session" : "scholar-session",
    ready: Boolean(origin && supabaseUrl && publishableKey) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId),
  };
}

export function isOwnerEmail(email: unknown): boolean {
  const { ownerEmail } = getAccessConfig();
  return Boolean(ownerEmail) && typeof email === "string" && email.trim().toLowerCase() === ownerEmail;
}

// Only use with a user verified by Supabase, never the user object inside a cookie.
export function isAllowedUser(user: { id?: string; email?: string; email_confirmed_at?: string; is_anonymous?: boolean } | null): boolean {
  const config = getAccessConfig();
  return config.ready && user?.id === config.ownerId && isOwnerEmail(user.email) &&
    Boolean(user.email_confirmed_at) && user.is_anonymous !== true;
}
