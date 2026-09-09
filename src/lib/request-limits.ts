export const MAX_REQUEST_BYTES = 512 * 1024;
export const MAX_FILE_BYTES = 128 * 1024;
export const MAX_FILES = 3;
// Budget the user's serialized input separately from the app's writing rules.
// Leave room for three full excerpts, source metadata, context, and revisions,
// as well as an allowed 128 KB TXT/HTML upload with accompanying draft text.
export const MAX_USER_PROMPT_BYTES = 256_000;
export const MAX_BATCH_POSTS = 10;
export const PROVIDER_TIMEOUT_MS = 60_000;
export const MAX_CITATION_DETAILS_LENGTH = 1000;
export const MAX_MATERIAL_CONTEXT_LENGTH = 2000;
export const MAX_STORED_MATERIALS = 30;
export const MAX_WEEK_NUMBER = 52;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_REQUEST_BYTES = MAX_IMAGE_UPLOAD_BYTES + 16 * 1024;

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
  revisionMode: 20,
  // JSON escaping and metadata must not shrink the per-source text allowance.
  // The streamed body cap and individual material validation bound these arrays.
  fileSources: MAX_REQUEST_BYTES,
  extractedMaterials: MAX_REQUEST_BYTES,
};

// Original documents are read in a browser worker, never uploaded to Vercel.
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 250;
export const MAX_DOCUMENT_CHARACTERS = 500_000;
export const MAX_MATERIAL_TEXT_BYTES = 16_000;
export const DOCUMENT_READ_TIMEOUT_MS = 30_000;
