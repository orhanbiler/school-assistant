import "server-only";
import { MAX_REQUEST_BYTES, TEXT_FIELD_LIMITS } from "@/lib/request-limits";

export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export async function readGenerationForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new RequestError("Use the writing form to generate content.", 415);
  }
  const bytes = await readLimitedBody(request, MAX_REQUEST_BYTES);
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new RequestError("The submitted form could not be read.");
  }
  const seen = new Set<string>();
  for (const [key, value] of form) {
    if (key === "files") continue;
    if (!Object.hasOwn(TEXT_FIELD_LIMITS, key) || seen.has(key) || typeof value !== "string") {
      throw new RequestError("The submitted form contains invalid fields.");
    }
    seen.add(key);
    if (value.length > TEXT_FIELD_LIMITS[key]) {
      throw new RequestError(`The ${key.replace(/([A-Z])/g, " $1").toLowerCase()} field is too long. Shorten it and try again.`, 413);
    }
  }
  return form;
}

export async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declaredSize = Number(request.headers.get("content-length"));
  if (declaredSize > maxBytes) throw new RequestError("The request is too large. Shorten the text or remove files.", 413);
  if (!request.body) throw new RequestError("The request is empty.");

  // Enforce the actual stream size; Content-Length can be absent or dishonest.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 10_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestError("The request is too large. Shorten the text or remove files.", 413);
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  if (timedOut) throw new RequestError("The upload took too long. Please try again.", 408);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
