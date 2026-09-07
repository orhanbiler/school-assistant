import { MAX_FILES, MAX_WEEK_NUMBER } from "@/lib/request-limits";

export interface StoredFile {
  id?: string;
  name: string;
  type: string;
  data: string; // Legacy TXT/HTML only. Original documents/photos are not saved.
  text?: string;
  pages?: string;
  originalSize?: number;
  sourceUrl: string;
  citationDetails?: string;
  weekNumber?: number;
  materialContext?: string;
  included?: boolean;
  extraction?: "photo";
}

export function materialWeek(file: Pick<StoredFile, "weekNumber">): number {
  return Number.isInteger(file.weekNumber) && file.weekNumber! >= 1 && file.weekNumber! <= MAX_WEEK_NUMBER ? file.weekNumber! : 1;
}

export function selectedMaterials(files: StoredFile[]): StoredFile[] {
  // Existing saved materials remain selected, and appear under Week 1.
  return files.filter((file) => file.included !== false);
}

export function appendMaterialInputs(form: FormData, files: StoredFile[]) {
  const selected = selectedMaterials(files);
  if (selected.length > MAX_FILES) throw new Error(`Choose up to ${MAX_FILES} materials for this draft.`);
  const sources = [];
  const extracted = [];
  for (const [index, file] of selected.entries()) {
    const metadata = { sourceUrl: file.sourceUrl, citationDetails: file.citationDetails,
      weekNumber: materialWeek(file), materialContext: file.materialContext };
    if (file.text !== undefined) extracted.push({ filename: file.name, text: file.text, ...metadata });
    else {
      // Unique wire names keep metadata attached when legacy files share a name.
      const filename = `${index}-${file.name.slice(-250)}`;
      const binary = atob(file.data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      form.append("files", new File([bytes], filename, { type: file.type }));
      sources.push({ filename, ...metadata });
    }
  }
  form.append("fileSources", JSON.stringify(sources));
  form.append("extractedMaterials", JSON.stringify(extracted));
}
