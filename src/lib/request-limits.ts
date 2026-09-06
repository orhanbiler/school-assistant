export const MAX_REQUEST_BYTES = 512 * 1024;
export const MAX_FILE_BYTES = 128 * 1024;
export const MAX_FILES = 3;
export const MAX_PROMPT_BYTES = 32_000;
export const MAX_BATCH_POSTS = 10;
export const PROVIDER_TIMEOUT_MS = 60_000;
export const MAX_CITATION_DETAILS_LENGTH = 1000;

export const TEXT_FIELD_LIMITS: Record<string, number> = {
  type: 20,
  aiModel: 80,
  context: 20_000,
  additionalInstructions: 4000,
  pageCount: 2,
  paperFocus: 2000,
  paraphraseOnly: 5,
  discussionPost: 12_000,
  originalPost: 16_000,
  incomingReply: 12_000,
  conversationHistory: 12_000,
  recipientRole: 20,
  recipientName: 120,
  contentToRevise: 24_000,
  writingSample: 6000,
  writerNotes: 4000,
  writingTone: 30,
  fileSources: 10_000,
  extractedMaterials: 60_000,
};

// Original documents are read in a browser worker, never uploaded to Vercel.
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 250;
export const MAX_DOCUMENT_CHARACTERS = 500_000;
export const MAX_MATERIAL_TEXT_BYTES = 16_000;
export const DOCUMENT_READ_TIMEOUT_MS = 30_000;
