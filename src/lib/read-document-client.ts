import { DOCUMENT_READ_TIMEOUT_MS } from "@/lib/request-limits";
import type { ExtractedDocument } from "./document-extraction";

export async function readDocument(file: File): Promise<ExtractedDocument> {
  const data = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/document-reader.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("This document took too long to read. Save the relevant pages as a smaller file and try again."));
    }, DOCUMENT_READ_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<{ type?: string; document?: ExtractedDocument; error?: string }>) => {
      // PDF.js also emits internal worker messages, including its initial ready signal.
      if (event.data?.type !== "document-result") return;
      finish();
      if (event.data.document) resolve(event.data.document);
      else reject(new Error(event.data.error || "This document could not be read."));
    };
    worker.onerror = () => { finish(); reject(new Error("The document reader could not start. Reload the page and try again.")); };
    worker.postMessage({ name: file.name, data }, [data]);
  });
}
