# Photo and weekly materials

## Phone workflow

1. Open Course Materials and choose the week under Add materials to.
2. Use Take photo for a new page image, Choose photos for the gallery/screenshots, or Choose files for PDF, Word, TXT, and HTML. The camera picker depends on browser/device support; it does not use a continuous camera stream.
3. For a photo, check the preview and rotate it as needed. Read text from photo sends the prepared image for transcription. It uses one GPT-5.2 request through the existing shared quota. Keep the page open while it reads.
4. Review/correct the text. Compare with the photo expands the page image during review. Check numbers, names, equations, table order, and any `[unclear]` passages. Save only the relevant excerpt. The photo is not kept in local storage.
5. Set the week and optionally add a source link, notes explaining how to use the material, and known publication details. Save to materials.
6. Select Use in this draft on up to three relevant materials. Other materials remain saved for later. A week filter changes the visible list, not the selected inputs; the selection summary identifies all selected weeks.

Saved photo/document text can be reopened and edited. The app does not infer the textbook's publication details from its filename or a link. Context notes guide relevance but are not treated as claims from the source. Week numbers organize assignments and are not citation years.

## Storage and limits

- Up to 30 materials on each device, with at most three selected per draft and at most three added in one batch. Additional materials save unselected when three are already selected.
- Week numbers range from 1 to 52. Older saved materials default to Week 1 and remain selected. Their text, links, and citations are preserved.
- Original photos: up to 20 MB. The browser decodes, orients, downsizes the longest edge to at most 2,400 pixels, and re-encodes a JPEG up to 3 MB. The app uploads that JPEG, which does not carry the original EXIF metadata. HEIC and other formats work only when the browser can decode them; an actionable error suggests JPEG, PNG, or a screenshot otherwise.
- Photo reading accepts one prepared JPEG at a time, under a bounded multipart request. Incomplete or empty transcription is an error. It uses the existing GPT-5.2 allowlist, enable switch, output token ceiling, provider timeout, zero retries, and Supabase quota/lease. Provider calls are made with `store: false`; that setting is not a claim of zero provider retention. The existing private sign-in and same-origin checks apply to `/api/extract-image`.
- Selected text remains limited to 16,000 UTF-8 bytes per extracted material, with the existing combined generation prompt cap. Notes: 2,000 characters; publication details: 1,000; source link: 2,000.
- PDFs/Word remain limited to 25 MB and use the existing on-device worker. Automatic OCR of entire scanned PDFs is not included; use page images or screenshots.
- Browser storage is finite. The existing save-status message reports a storage failure. Materials and drafts remain device-local and do not sync across devices. Signing out does not clear them; Clear all data does.

## September 7, 2026 validation

- Automated checks exercise the real photo handler with simulated auth, quota, and OpenAI responses: valid transcription, unauthenticated/cross-site requests, duplicate uploads, spoofed content types, oversize streams, disabled generation/models, exhausted quotas, incomplete responses, and provider-error redaction/lease release.
- Generation tests cover week/context metadata on both extracted and legacy uploads, invalid metadata rejected before quota use, unselected files excluded, legacy Week 1 defaults, and distinct metadata for duplicate filenames.
- The photo preprocessing test exercises resizing and rotation of a simulated 4,032 × 3,024 phone photo, JPEG re-encoding, object-URL cleanup, unsupported-format errors, and size rejection. It does not emulate a real camera or image decoder.
- One live GPT-5.2 test used a generated 1,200 × 1,600 JPEG containing fictional garden notes. The resulting 53-word transcription preserved the heading, page 42, participant count 24, the unmeasured-harvest qualification, and the study question without answering it. This was one clean synthetic image, not a benchmark of real textbook photos.
- TypeScript, lint, and a production Webpack build passed. Local Turbopack builds failed because a subprocess could not bind a port even after escalation. Vercel's production build is verified separately during deployment.
- No connected browser was available for new viewport screenshots or native interaction. Physical iPhone/Android camera capture, rotation, gallery formats, and software-keyboard interaction remain device checks. The previous mobile checks predate this feature.

Primary reference: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision). No extra OCR provider, database migration, or environment variable is required.
