import test from "node:test";
import assert from "node:assert/strict";
import { pdfFixture, docxFixture, arrayBuffer } from "./document-fixtures.mjs";
const { extractDocument } = await import("../src/lib/document-extraction.ts");
const { readDocument } = await import("../src/lib/read-document-client.ts");

test("the browser reader ignores PDF.js internal ready messages and waits for extracted text", async () => {
  const original = globalThis.Worker;
  let terminated = false;
  globalThis.Worker = class {
    postMessage() {
      this.onmessage({ data: { sourceName: "worker", targetName: "main", action: "ready" } });
      assert.equal(terminated, false);
      this.onmessage({ data: { type: "document-result", document: { text: "Selected reading." } } });
    }
    terminate() { terminated = true; }
  };
  try {
    assert.deepEqual(await readDocument(new File(["fixture"], "reading.pdf")), { text: "Selected reading." });
    assert.equal(terminated, true);
  } finally { if (original === undefined) delete globalThis.Worker; else globalThis.Worker = original; }
});

test("PDF extraction preserves separate pages for selection", async () => {
  const result = await extractDocument("reading.PDF", arrayBuffer(pdfFixture(["First page reading.", "Second page evidence."])));
  assert.deepEqual(result.pages, ["First page reading.", "Second page evidence."]);
  assert.equal(result.text, "First page reading.\n\nSecond page evidence.");
});

test("Word extraction returns raw text, including literal markup without rendering it", async () => {
  const text = "A course reading. <script>alert('test')</script>";
  const result = await extractDocument("reading.docx", arrayBuffer(docxFixture(text)));
  assert.equal(result.text, text);
  assert.equal(result.pages, undefined);
});

test("unreadable, scanned and oversized documents have actionable errors", async () => {
  await assert.rejects(extractDocument("empty.pdf", new ArrayBuffer(0)), /empty/);
  await assert.rejects(extractDocument("bad.pdf", arrayBuffer(Buffer.from("not a PDF"))), /not a readable PDF/);
  await assert.rejects(extractDocument("scan.pdf", arrayBuffer(pdfFixture([""]))), /text recognition/);
  await assert.rejects(extractDocument("long.pdf", arrayBuffer(pdfFixture(Array(251).fill("Reading.")))), /250 pages/);
  await assert.rejects(extractDocument("large.pdf", new ArrayBuffer(25 * 1024 * 1024 + 1)), /25 MB/);
  await assert.rejects(extractDocument("old.doc", arrayBuffer(Buffer.from("old format"))), /Save older/);
  await assert.rejects(extractDocument("bad.docx", arrayBuffer(Buffer.from("not a zip"))), /damaged/);
  await assert.rejects(extractDocument("empty.docx", arrayBuffer(docxFixture(""))), /no readable text/);
});

test("DOCX expansion limits reject archive bombs before parsing", async () => {
  const data = docxFixture();
  const offset = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  data.writeUInt32LE(128 * 1024 * 1024, offset + 24);
  await assert.rejects(extractDocument("bomb.docx", arrayBuffer(data)), /expands to too much/);
});
