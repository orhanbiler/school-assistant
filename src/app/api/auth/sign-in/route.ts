import { NextResponse } from "next/server";
import { getAccessConfig, isAllowedUser } from "@/lib/server/access-config";
import { isSameOriginRequest } from "@/lib/server/authorization";
import { createRequestAuth } from "@/lib/server/supabase";
import { readLimitedBody, RequestError } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!getAccessConfig().ready) return json("Private sign-in is not configured yet.", 503);
  if (!isSameOriginRequest(request)) return json("This request is not allowed.", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json("Invalid sign-in request.", 415);
  try {
    const bytes = await readLimitedBody(request, 4096);
    let input;
    try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json("Invalid sign-in request.", 400); }
    if (!input || typeof input.email !== "string" || typeof input.password !== "string" ||
        input.email.length > 254 || !input.password || input.password.length > 1024) return json("Enter your email and password.", 400);
    const auth = createRequestAuth(request);
    const { data, error } = await auth.supabase.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
    if (error || !isAllowedUser(data.user)) {
      // Discard any session created for an account that isn't the owner.
      if (data.session) await auth.supabase.auth.signOut({ scope: "local" });
      return auth.applyCookies(json(error?.status === 429 ? "Too many attempts. Please try again later." : "Unable to sign in with those details.", error?.status === 429 ? 429 : 401));
    }
    return auth.applyCookies(NextResponse.json({ ok: true }));
  } catch (error) {
    return json(error instanceof RequestError ? error.message : "Sign-in is temporarily unavailable. Please try again.", error instanceof RequestError ? error.status : 503);
  }
}
