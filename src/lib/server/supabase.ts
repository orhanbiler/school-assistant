import "server-only";
import { createServerClient, parseCookieHeader, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { getAccessConfig, isAllowedUser } from "@/lib/server/access-config";

export function createRequestAuth(request: Request) {
  const config = getAccessConfig();
  const jar = new Map(parseCookieHeader(request.headers.get("cookie") || "").map(({ name, value }) => [name, value]));
  const pending = new Map<string, { value: string; options: CookieOptions }>();
  const supabase = createServerClient(config.supabaseUrl, config.publishableKey, {
    cookieOptions: { name: config.cookieName, httpOnly: true, secure: config.secure, sameSite: "lax", path: "/" },
    global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) }) },
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) {
          jar.set(name, value);
          pending.set(name, { value, options: { ...options, maxAge: options.maxAge === 0 ? 0 : 8 * 3600 } });
        }
      },
    },
  });
  return {
    supabase,
    async hasOwnerSession() {
      try {
        const { data, error } = await supabase.auth.getUser();
        return !error && isAllowedUser(data.user);
      } catch { return false; }
    },
    applyCookies(response: NextResponse) {
      for (const [name, { value, options }] of pending) response.cookies.set(name, value, options);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Cookie");
      return response;
    },
    updatedCookieHeader() {
      return Array.from(jar, ([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    },
  };
}
