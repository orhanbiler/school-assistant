import "server-only";
import { MAX_CITATION_DETAILS_LENGTH, MAX_FILES, MAX_MATERIAL_TEXT_BYTES, MAX_MATERIAL_CONTEXT_LENGTH, MAX_WEEK_NUMBER } from "@/lib/request-limits";
import { RequestError } from "@/lib/server/request-body";
import type { WritingMaterial } from "@/lib/writing-prompts";

export function readSourceMetadata(source: { sourceUrl?: unknown; citationDetails?: unknown; weekNumber?: unknown; materialContext?: unknown }): Pick<WritingMaterial, "sourceUrl" | "citationDetails" | "weekNumber" | "materialContext"> {
  if (source.sourceUrl !== undefined && (typeof source.sourceUrl !== "string" || source.sourceUrl.length > 2000)) throw new RequestError("A document source URL is invalid.");
  if (source.citationDetails !== undefined && typeof source.citationDetails !== "string") throw new RequestError("Citation details must be text.");
  if (typeof source.citationDetails === "string" && source.citationDetails.length > MAX_CITATION_DETAILS_LENGTH) throw new RequestError(`Keep citation details under ${MAX_CITATION_DETAILS_LENGTH.toLocaleString()} characters per source.`, 413);
  if (source.weekNumber !== undefined && (typeof source.weekNumber !== "number" || !Number.isInteger(source.weekNumber) || source.weekNumber < 1 || source.weekNumber > MAX_WEEK_NUMBER)) throw new RequestError(`Choose a week from 1 to ${MAX_WEEK_NUMBER}.`);
  if (source.materialContext !== undefined && typeof source.materialContext !== "string") throw new RequestError("Material context must be text.");
  if (typeof source.materialContext === "string" && source.materialContext.length > MAX_MATERIAL_CONTEXT_LENGTH) throw new RequestError(`Keep material context under ${MAX_MATERIAL_CONTEXT_LENGTH.toLocaleString()} characters.`, 413);
  return {
    sourceUrl: typeof source.sourceUrl === "string" ? source.sourceUrl.trim() || undefined : undefined,
    citationDetails: typeof source.citationDetails === "string" ? source.citationDetails.trim() || undefined : undefined,
    weekNumber: typeof source.weekNumber === "number" ? source.weekNumber : undefined,
    materialContext: typeof source.materialContext === "string" ? source.materialContext.trim() || undefined : undefined,
  };
}

export function readExtractedMaterials(raw: string): WritingMaterial[] {
  let items: unknown;
  try { items = JSON.parse(raw || "[]"); } catch { throw new RequestError("The document text could not be read. Remove the file and add it again."); }
  if (!Array.isArray(items)) throw new RequestError("Invalid document materials.");
  if (items.length > MAX_FILES) throw new RequestError(`Upload at most ${MAX_FILES} files.`, 413);
  return items.map((item: unknown) => {
    if (!item || typeof item !== "object" || !("filename" in item) || !("text" in item) ||
        typeof item.filename !== "string" || !item.filename.trim() || item.filename.length > 255 ||
        typeof item.text !== "string" || !item.text.trim()) throw new RequestError("A document has no readable selected text. Remove it and add it again.");
    if (Buffer.byteLength(item.text, "utf8") > MAX_MATERIAL_TEXT_BYTES) throw new RequestError("A document excerpt is too long. Choose fewer pages or a shorter passage.", 413);
    return { filename: item.filename, text: item.text.trim(), ...readSourceMetadata({
      sourceUrl: "sourceUrl" in item ? item.sourceUrl : undefined,
      citationDetails: "citationDetails" in item ? item.citationDetails : undefined,
      weekNumber: "weekNumber" in item ? item.weekNumber : undefined,
      materialContext: "materialContext" in item ? item.materialContext : undefined,
    }) };
  });
}
