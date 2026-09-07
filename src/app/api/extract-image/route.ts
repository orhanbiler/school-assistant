import { NextRequest, NextResponse } from "next/server";
import { getAccessConfig } from "@/lib/server/access-config";
import { createRequestAuth } from "@/lib/server/supabase";
import { isSameOriginRequest } from "@/lib/server/authorization";
import { RequestError } from "@/lib/server/request-body";
import { UsageError } from "@/lib/server/usage-limits";
import { readImageForm, transcribeImage } from "@/lib/server/image-transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

function json(data: unknown, status = 200, retryAfter?: number) {
  const headers: Record<string, string> = { "Cache-Control": "no-store, private", Vary: "Cookie" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return NextResponse.json(data, { status, headers });
}

export async function POST(request: NextRequest) {
  if (!getAccessConfig().ready) return json({ error: "Private access is not configured. Photo reading is locked." }, 503);
  const auth = createRequestAuth(request);
  let response;
  try {
    if (!(await auth.hasOwnerSession())) response = json({ error: "Sign in with the owner's approved account to read photos." }, 401);
    else if (!isSameOriginRequest(request)) response = json({ error: "This request is not allowed." }, 403);
    else response = json({ text: await transcribeImage(await readImageForm(request)) });
  } catch (error) {
    response = error instanceof RequestError || error instanceof UsageError
      ? json({ error: error.message }, error.status, error instanceof UsageError ? error.retryAfter : undefined)
      : json({ error: "The photo could not be read. Please try again later." }, 502);
  }
  return auth.applyCookies(response);
}
