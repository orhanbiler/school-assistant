import "server-only";
import { MAX_FILES, MAX_MATERIAL_TEXT_BYTES } from "@/lib/request-limits";
import { RequestError } from "@/lib/server/request-body";

export function readExtractedMaterials(raw: string): { filename: string; text: string; sourceUrl?: string }[] {
  let items: unknown;
  try { items = JSON.parse(raw || "[]"); } catch { throw new RequestError("The document text could not be read. Remove the file and add it again."); }
  if (!Array.isArray(items)) throw new RequestError("Invalid document materials.");
  if (items.length > MAX_FILES) throw new RequestError(`Upload at most ${MAX_FILES} files.`, 413);
  return items.map((item: unknown) => {
    if (!item || typeof item !== "object" || !("filename" in item) || !("text" in item) ||
        typeof item.filename !== "string" || !item.filename.trim() || item.filename.length > 255 ||
        typeof item.text !== "string" || !item.text.trim()) throw new RequestError("A document has no readable selected text. Remove it and add it again.");
    if (Buffer.byteLength(item.text, "utf8") > MAX_MATERIAL_TEXT_BYTES) throw new RequestError("A document excerpt is too long. Choose fewer pages or a shorter passage.", 413);
    const sourceUrl = "sourceUrl" in item ? item.sourceUrl : undefined;
    if (sourceUrl !== undefined && (typeof sourceUrl !== "string" || sourceUrl.length > 2000)) throw new RequestError("A document source URL is invalid.");
    return { filename: item.filename, text: item.text.trim(), sourceUrl: typeof sourceUrl === "string" ? sourceUrl.trim() || undefined : undefined };
  });
}
