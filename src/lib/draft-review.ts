import { splitReferenceSection } from "@/lib/writing-prompts";

export interface DraftReviewNote {
  id: string;
  title: string;
  description: string;
  examples: string[];
}

// These are visible text checks, not a detector, source comparison, or grade.
// Leave the draft intact: removing quotation marks would not be paraphrasing.
export function reviewDraft(content: string, paraphraseOnly = false): DraftReviewNote[] {
  const { body } = splitReferenceSection(content);
  const notes: DraftReviewNote[] = [];
  if (paraphraseOnly) {
    const examples = new Set<string>();
    const quoted = /"[^"\n]+"|“[^”\n]+”|(?:^|[\s(])'[^'\n]+'(?=[\s.,;:!?)]|$)|‘[^’\n]+’|^\s{0,3}>[^\n]+/gm;
    for (const match of body.matchAll(quoted)) {
      const passage = match[0].trim();
      examples.add(passage.length > 180 ? `${passage.slice(0, 179)}…` : passage);
      if (examples.size === 3) break;
    }
    if (examples.size) notes.push({
      id: "quotations",
      title: "Check these quoted passages",
      description: "Paraphrases only was selected. These may be source quotations, titles, or terms. Check them against your assignment; copied wording needs a real paraphrase, not just the removal of quotation marks. Showing up to three passages.",
      examples: [...examples],
    });
  }
  if (/\b(?:selected|chosen)\s+(?:community|case|organization|neighbou?rhood)\b/i.test(body)) notes.push({
    id: "case",
    title: "Check that the case is specific",
    description: "The draft refers to a selected or chosen case in general terms. Make sure it identifies your actual setting and connects the analysis to the problem there.",
    examples: [],
  });
  const repeatedOpenings = body.split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim().replace(/^(?:#{1,6}\s+)?(?:\*\*|__)?/, ""))
    .filter((paragraph) => /^(?:(?:one|another|a second|a third|the first|the second|the third)\s+(?:challenge|barrier|issue|concern)\b|(?:first|second|third|finally),)/i.test(paragraph));
  if (repeatedOpenings.length >= 2) notes.push({
    id: "structure",
    title: "Check repeated paragraph openings",
    description: "Several paragraphs start with a numbered or repeated lead-in. If your assignment does not require this structure, try starting with the actual issue and connecting its evidence and response. This is a style suggestion, not an authorship assessment.",
    examples: repeatedOpenings.slice(0, 3).map((passage) => passage.length > 180 ? `${passage.slice(0, 179)}…` : passage),
  });
  return notes;
}
