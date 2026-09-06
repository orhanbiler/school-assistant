# Reviewing writing quality

The generator uses one model request with a final editorial check in the prompt. Voice settings and an optional writing sample apply to initial drafts, individual replies, batch replies, and revision. The sample supplies style, not facts or citations. Revision holds a trailing References, Works Cited, or Bibliography section outside the model and restores it verbatim.

The prompts intentionally avoid fixed sample answers, forced errors, word blacklists, and detector-score guarantees. A detector score is not a quality acceptance criterion. Prompt instructions improve guidance; they cannot guarantee factual fidelity or a particular voice. Read the result before using it.

## Repeatable manual review

Use the same selected model and inputs before and after a prompt change. Generate each case three times, and compare results without showing the reviewer which prompt produced them. Do not use private coursework or student data in shared evaluation records.

1. **Discussion, with a supplied source.** Context: “The library piloted a 9 p.m. closing time instead of 7 p.m. for six weeks. Average evening visits rose from 40 to 65. Staffing cost rose by 20%. These figures come from an internal pilot report; there was no student survey.” Instructions: “Write a 180–220-word discussion post arguing whether to continue the trial. Acknowledge a limitation. Do not invent a citation.” Check that the response develops a view, uses the actual figures, and does not invent survey results or personal experience.
2. **Academic essay.** Use the same context. Select Academic and request a one-page essay. Check for connected reasoning, measured claims, a relevant conclusion, and no forced conversational asides. Change the instruction to “Write one 120-word passage, no headings”; the explicit format and length should take precedence.
3. **Voice sample.** Add a paragraph you wrote about a different subject. Check for similar formality and directness without copied sentences, imported anecdotes, or unrelated facts. Repeat with no sample to confirm useful defaults.
4. **Reply and batch replies.** Use two posts taking different positions on the trial. Provide a name for one and leave the other unnamed. Check that each reply engages with a different specific point, avoids repeated praise/templates, and does not invent a recipient or references.
5. **Revision.** Supply a draft containing a direct quote, a cautious claim (“may improve”), a number, an in-text citation, and a Markdown References section. Check that meaning, quotation, certainty, number, and citation survive; the bibliography must remain byte-for-byte identical. Try an already clear draft: the editor should not gratuitously rewrite it.
6. **Source documents.** Upload a PDF and a Word (.docx) document, review the extracted text, and select a short PDF page range. Only that selection should appear in the draft's material. Try a scanned or damaged PDF, an older .doc file, and an empty TXT file; each should explain the problem before calling a model. A pasted URL alone must not be described as a source the model has read.

Score each output 1–5 for assignment fit, natural flow, specific reasoning, source fidelity, and voice fit. Reject any output with invented evidence, altered quotations, or missed mandatory requirements regardless of its average. Record word count separately. Automated prompt and request tests verify wiring and preservation, not prose quality or detector performance.

## Local checks

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`. The tests require Node 22.18+ for TypeScript stripping and do not make live model calls. Live quality review requires `OPENAI_API_KEY` or `GEMINI_API_KEY` in `.env.local` and a model available to that account.
