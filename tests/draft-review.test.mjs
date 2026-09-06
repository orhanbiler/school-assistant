import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/writing-prompts") return nextResolve(new URL("../src/lib/writing-prompts.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { reviewDraft } = await import("../src/lib/draft-review.ts");

test("paraphrase review identifies common quotation styles without changing text", () => {
  for (const quotation of ['"listen first"', '“listen first”', "'listen first'", '‘listen first’', '> Listen first.']) {
    const content = `The draft discusses the advice.\n\n${quotation}`;
    const notes = reviewDraft(content, true);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].id, "quotations");
    assert.deepEqual(notes[0].examples, [quotation]);
    assert.equal(content, `The draft discusses the advice.\n\n${quotation}`);
  }
});

test("contractions and reference titles are not treated as source quotations in the body", () => {
  const content = `I'd check attendance because it doesn't show whether students return. It’s a limited trial.\n\nReferences\nLee, A. (2024). “After hours”: A library trial.`;
  assert.deepEqual(reviewDraft(content, true), []);
  assert.deepEqual(reviewDraft('The report says “listen first.”', false), []);
});

test("review examples are bounded and duplicate passages are collapsed", () => {
  const notes = reviewDraft(`“${"a".repeat(1000)}” “repeat” “repeat” “third” “fourth”`, true);
  assert.equal(notes[0].examples.length, 3);
  assert.equal(notes[0].examples[0].length, 180);
  assert.deepEqual(notes[0].examples.slice(1), ['“repeat”', '“third”']);
});

test("general case references prompt review while named cases and bibliography entries do not", () => {
  assert.equal(reviewDraft("In the selected community, a trial could help.")[0].id, "case");
  assert.equal(reviewDraft("The chosen neighborhood needs a plan.")[0].id, "case");
  assert.deepEqual(reviewDraft("Maple Court is considering a library-hours trial."), []);
  assert.deepEqual(reviewDraft("The trial needs review.\n\nReferences\nLee. The selected community."), []);
});
