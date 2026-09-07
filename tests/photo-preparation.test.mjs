import test from "node:test";
import assert from "node:assert/strict";
const { preparePhoto } = await import("../src/lib/prepare-photo-client.ts");

test("phone photos are resized, rotated, and re-encoded instead of uploading original metadata", async () => {
  const originals = { Image: globalThis.Image, document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const events = [];
  const canvas = { width: 0, height: 0,
    getContext: () => ({ fillRect() {}, translate() {}, rotate(value) { events.push(["rotate", value]); }, drawImage(...args) { events.push(["draw", ...args.slice(1)]); } }),
    toBlob(callback, type) { events.push(["encode", this.width, this.height, type]); callback(new Blob(["encoded-pixels"], { type })); },
  };
  try {
    globalThis.Image = class { naturalWidth = 4032; naturalHeight = 3024; async decode() {} };
    globalThis.document = { createElement: () => canvas };
    URL.createObjectURL = () => "blob:original";
    URL.revokeObjectURL = (value) => { events.push(["revoke", value]); };
    const file = new File(["original-photo-with-metadata"], "camera.heic", { type: "image/heic" });
    const prepared = await preparePhoto(file, 90);
    assert.equal(prepared.name, "textbook-page.jpg");
    assert.equal(prepared.type, "image/jpeg");
    assert.equal(await prepared.text(), "encoded-pixels");
    assert.ok(events.some((event) => event[0] === "encode" && event[1] === 1800 && event[2] === 2400));
    assert.ok(events.some((event) => event[0] === "rotate" && event[1] === Math.PI / 2));
    assert.deepEqual(events.at(-1), ["revoke", "blob:original"]);
    assert.equal(canvas.width, 0);
    globalThis.Image = class { async decode() { throw new Error("unsupported format"); } };
    await assert.rejects(preparePhoto(file), /JPEG or PNG/);
    assert.deepEqual(events.at(-1), ["revoke", "blob:original"]);
    await assert.rejects(preparePhoto({ size: 21 * 1024 * 1024 }), /under 20 MB/);
  } finally {
    if (originals.Image === undefined) delete globalThis.Image; else globalThis.Image = originals.Image;
    if (originals.document === undefined) delete globalThis.document; else globalThis.document = originals.document;
    URL.createObjectURL = originals.create;
    URL.revokeObjectURL = originals.revoke;
  }
});
