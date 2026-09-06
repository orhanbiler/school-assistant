import "server-only";
import { getAccessConfig } from "@/lib/server/access-config";

export function isSameOriginRequest(request: Request): boolean {
  const { origin } = getAccessConfig();
  return Boolean(origin) && request.headers.get("origin") === origin &&
    request.headers.get("sec-fetch-site") !== "cross-site" &&
    request.headers.get("x-scholar-request") === "1";
}
