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

test("repeated essay lead-ins produce bounded style suggestions without changing the draft", () => {
  const content = `One challenge is the limited evening schedule.\n\nA second challenge is ${"the staffing cost. ".repeat(20)}\n\nAnother concern is exam-season demand.\n\nFinally, the trial needs review.`;
  const notes = reviewDraft(content);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, "structure");
  assert.equal(notes[0].examples.length, 3);
  assert.equal(notes[0].examples[1].length, 180);
  assert.ok(content.includes("A second challenge is"));
});

test("isolated lead-ins, ordinary prose and reference entries do not trigger the structure suggestion", () => {
  for (const content of [
    "One challenge is staffing.\n\nEvening visits may justify a trial.",
    "First responders need evening access.\n\nFinally available, the report explains why.",
    "The trial needs review.\n\nReferences\n\nOne challenge is staffing.\n\nA second challenge is funding.",
  ]) assert.deepEqual(reviewDraft(content), []);
});
