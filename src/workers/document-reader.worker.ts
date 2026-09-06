import { extractDocument } from "../lib/document-extraction";

self.onmessage = async (event: MessageEvent<{ name: string; data: ArrayBuffer }>) => {
  try {
    self.postMessage({ type: "document-result", document: await extractDocument(event.data.name, event.data.data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "This document could not be read.";
    // Parser internals can contain file content. Send only our actionable messages.
    const safe = /^(This |Documents |Use PDF)/.test(message) ? message : "This document could not be read. Save a new PDF or .docx copy and try again.";
    self.postMessage({ type: "document-result", error: safe });
  }
};
