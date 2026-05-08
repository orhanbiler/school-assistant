export function countWords(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countCharacters(text: string): number {
  return text?.length ?? 0;
}

export function readingTime(text: string, wordsPerMinute = 230): string {
  const words = countWords(text);
  if (words === 0) return "—";
  const minutes = Math.max(1, Math.round(words / wordsPerMinute));
  return `${minutes} min read`;
}
