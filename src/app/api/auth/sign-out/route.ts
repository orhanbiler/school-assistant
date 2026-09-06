import { NextResponse } from "next/server";
import { getAccessConfig } from "@/lib/server/access-config";
import { isSameOriginRequest } from "@/lib/server/authorization";
import { createRequestAuth } from "@/lib/server/supabase";

export async function POST(request: Request) {
  const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!getAccessConfig().ready) return json("Private access is not configured.", 503);
  if (!isSameOriginRequest(request)) return json("This request is not allowed.", 403);
  const auth = createRequestAuth(request);
  try {
    const { error } = await auth.supabase.auth.signOut({ scope: "local" });
    return auth.applyCookies(error ? json("Sign-out failed. Please try again.", 503) : NextResponse.json({ ok: true }));
  } catch { return json("Sign-out failed. Please try again.", 503); }
}
