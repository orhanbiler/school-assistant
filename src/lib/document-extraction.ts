import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_CHARACTERS, MAX_DOCUMENT_PAGES } from "@/lib/request-limits";

export interface ExtractedDocument {
  text: string;
  pages?: string[];
}

// Reject large ZIP expansion before the DOCX reader decompresses document XML.
function checkDocxArchive(data: ArrayBuffer) {
  const view = new DataView(data);
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("This Word file is damaged. Save a new .docx copy and try again.");
  const entries = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  let expanded = 0;
  if (!entries || entries > 2000) throw new Error("This Word file is too complex. Save a shorter .docx excerpt.");
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error("This Word file is damaged or unsupported.");
    const size = view.getUint32(offset + 24, true);
    expanded += size;
    if (size > 8 * 1024 * 1024 || expanded > 32 * 1024 * 1024) throw new Error("This Word file expands to too much data. Save a shorter .docx excerpt.");
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}

export async function extractDocument(name: string, data: ArrayBuffer): Promise<ExtractedDocument> {
  if (!data.byteLength) throw new Error("This file is empty.");
  if (data.byteLength > MAX_DOCUMENT_BYTES) throw new Error("Documents must be 25 MB or smaller.");
  if (/\.pdf$/i.test(name)) {
    if (!new TextDecoder().decode(data.slice(0, 1024)).includes("%PDF-")) throw new Error("This file is not a readable PDF. Save a new PDF copy and try again.");
    const { getDocumentProxy } = await import("unpdf");
    let pdf;
    try {
      pdf = await getDocumentProxy(new Uint8Array(data), { useSystemFonts: false, disableFontFace: true });
      if (pdf.numPages > MAX_DOCUMENT_PAGES) throw new Error("This PDF has more than 250 pages. Save the relevant pages as a separate PDF.");
      const pages: string[] = [];
      let size = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        try {
          const content = await page.getTextContent();
          const text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
          size += text.length;
          if (size > MAX_DOCUMENT_CHARACTERS) throw new Error("This PDF contains too much text. Save the relevant pages as a separate PDF.");
          pages.push(text);
        } finally { page.cleanup(); }
      }
      const text = pages.join("\n\n");
      if (!text.trim()) throw new Error("This PDF has no selectable text. It may be scanned; run text recognition (OCR) first, then upload it again.");
      return { pages, text };
    } catch (error) {
      if (error instanceof Error && /password/i.test(error.name + error.message)) throw new Error("This PDF is password-protected. Upload an unlocked copy.");
      throw error;
    } finally { await pdf?.loadingTask.destroy(); }
  }
  if (/\.docx$/i.test(name)) {
    checkDocxArchive(data);
    const { default: mammoth } = await import("mammoth/mammoth.browser.js");
    // Raw text only: no generated HTML, image loading, or embedded links are executed.
    const result = await mammoth.extractRawText({ arrayBuffer: data });
    const text = result.value.trim();
    if (!text) throw new Error("This Word document contains no readable text.");
    if (text.length > MAX_DOCUMENT_CHARACTERS) throw new Error("This Word document contains too much text. Save a shorter excerpt.");
    return { text };
  }
  throw new Error("Use PDF or Word (.docx). Save older .doc files as .docx first.");
}
