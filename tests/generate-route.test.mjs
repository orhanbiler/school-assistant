import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Match Next's module aliases while testing the real handler without a server.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../src/app/api/generate/route.ts");
const { POST: signIn } = await import("../src/app/api/auth/sign-in/route.ts");
const { POST: signOut } = await import("../src/app/api/auth/sign-out/route.ts");
const { POST: extractImage } = await import("../src/app/api/extract-image/route.ts");
const { appendMaterialInputs, materialWeek } = await import("../src/lib/materials.ts");
const { MAX_FILE_BYTES, MAX_MATERIAL_TEXT_BYTES, MAX_USER_PROMPT_BYTES, TEXT_FIELD_LIMITS } = await import("../src/lib/request-limits.ts");
const { buildWritingPrompts } = await import("../src/lib/writing-prompts.ts");

const { getAccessConfig, isAllowedUser } = await import("../src/lib/server/access-config.ts");
const owner = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", aud: "authenticated", role: "authenticated" };
const testSettings = {
  OPENAI_API_KEY: "test-key-no-network", GEMINI_API_KEY: "test-key-no-network",
  OWNER_EMAIL: owner.email, OWNER_USER_ID: owner.id, APP_URL: "https://writing.example.com",
  SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  SUPABASE_SECRET_KEY: "test-server-secret", AI_GENERATION_ENABLED: "true",
};
const originalKeys = Object.fromEntries(Object.keys(testSettings).map((key) => [key, process.env[key]]));
Object.assign(process.env, testSettings);
const calls = [];
let reply = "A useful draft.";
let incomplete = false;
let quotaReply = [1, 0, 0];
let quotaUnavailable = false;
let providerError = false;
let emptyRelease = false;
const quotaCalls = [];
const authCalls = [];
let refreshAllowed = false;
const fetchMock = mock.method(globalThis, "fetch", async (url, init) => {
  const address = String(url);
  if (address.startsWith("https://project.supabase.co/auth/")) {
    authCalls.push(address);
    const headers = new Headers(init.headers);
    assert.equal(headers.get("apikey"), testSettings.SUPABASE_PUBLISHABLE_KEY);
    if (address.includes("/user")) {
      const token = headers.get("authorization")?.replace("Bearer ", "");
      const users = { "owner-token": owner, "other-token": { ...owner, id: "22222222-2222-4222-8222-222222222222" }, "unverified-token": { ...owner, email_confirmed_at: undefined } };
      return users[token] ? Response.json(users[token]) : Response.json({ message: "Invalid token" }, { status: 401 });
    }
    if (address.includes("/logout")) return new Response(null, { status: 204 });
    if (address.includes("/token")) {
      const input = JSON.parse(init.body);
      if (input.password === "correct-test-password" || (refreshAllowed && input.refresh_token)) {
        const user = input.email && input.email !== owner.email ? { ...owner, id: "22222222-2222-4222-8222-222222222222" } : owner;
        return Response.json({ access_token: "owner-token", refresh_token: "new-refresh-token", token_type: "bearer", expires_in: 3600, user });
      }
      return Response.json({ msg: "Invalid credentials", error_code: "invalid_grant" }, { status: 400 });
    }
    throw new Error("Unexpected auth request");
  }
  if (address.startsWith("https://project.supabase.co/rest/v1/rpc/")) {
    assert.equal(new Headers(init.headers).get("apikey"), testSettings.SUPABASE_SECRET_KEY);
    const name = address.split("/").at(-1);
    const args = JSON.parse(init.body);
    quotaCalls.push([name, args]);
    if (quotaUnavailable) throw new Error("Private storage error details");
    if (name === "release_ai_generation" && emptyRelease) return new Response(null, { status: 204 });
    return Response.json(name === "reserve_ai_generation" ? quotaReply : null);
  }
  assert.match(address, /^https:\/\/(api\.openai\.com|generativelanguage\.googleapis\.com)\//);
  calls.push(JSON.parse(init.body));
  if (providerError) return Response.json({ error: { message: "Sensitive provider error including a secret" } }, { status: 500 });
  const data = address.includes("api.openai.com")
    ? { id: "resp_test", object: "response", status: incomplete ? "incomplete" : "completed", output: [
      { type: "message", role: "assistant", content: [{ type: "output_text", text: reply }] },
    ] }
    : { candidates: [{ content: { role: "model", parts: [{ text: reply }] }, finishReason: incomplete ? "MAX_TOKENS" : "STOP" }] };
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
});
after(() => {
  fetchMock.mock.restore();
  for (const [key, value] of Object.entries(originalKeys)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function sessionCookie(token = "owner-token", options = {}) {
  const session = { access_token: token, refresh_token: "refresh-token", expires_at: Math.floor(Date.now() / 1000) + (options.maxAge ?? 3600), token_type: "bearer", user: owner };
  return `${getAccessConfig().cookieName}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

async function request(fields, files = [], options = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  for (const file of files) form.append("files", file);
  const headers = new Headers({
    Origin: "https://writing.example.com", "X-Scholar-Request": "1",
    Cookie: await sessionCookie(), ...options.headers,
  });
  if (options.anonymous) headers.delete("cookie");
  const result = await POST(new Request("https://writing.example.com/api/generate", { method: "POST", headers, body: form }));
  return { status: result.status, data: await result.json(), headers: result.headers };
}

function userData(text) {
  return JSON.parse(text.slice(text.indexOf("{")));
}

async function photoRequest({ file = new File([new Uint8Array([255, 216, 255, 0, 255, 217])], "page.jpg", { type: "image/jpeg" }), anonymous = false, origin = "https://writing.example.com", duplicate = false, header = "1" } = {}) {
  const form = new FormData();
  form.append("image", file);
  if (duplicate) form.append("image", file);
  const headers = new Headers({ Origin: origin, "X-Scholar-Request": header });
  if (!anonymous) headers.set("Cookie", await sessionCookie());
  // Finish Node's multipart serialization before testing cancellation of the
  // inbound request stream (avoids an Undici serializer cancellation race).
  const encoded = new Response(form);
  headers.set("Content-Type", encoded.headers.get("Content-Type"));
  const response = await extractImage(new Request("https://writing.example.com/api/extract-image", { method: "POST", headers, body: await encoded.arrayBuffer() }));
  return { status: response.status, data: await response.json(), headers: response.headers };
}

test("photo transcription sends one image through owner access and shared quota without retries or storage", async () => {
  const before = calls.length;
  const beforeQuota = quotaCalls.length;
  const response = await photoRequest();
  assert.equal(response.status, 200);
  assert.equal(response.data.text, reply);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(calls.length, before + 1);
  assert.equal(calls.at(-1).store, false);
  assert.equal(calls.at(-1).model, "gpt-5.2");
  assert.match(calls.at(-1).input[1].content[1].image_url, /^data:image\/jpeg;base64,/);
  assert.equal(calls.at(-1).input[1].content[1].detail, "high");
  assert.deepEqual(quotaCalls.slice(beforeQuota).map(([name]) => name), ["reserve_ai_generation", "release_ai_generation"]);
});

test("unsigned, cross-site, duplicate, spoofed and oversized photo uploads cannot consume quota", async () => {
  const before = calls.length;
  const beforeQuota = quotaCalls.length;
  assert.equal((await photoRequest({ anonymous: true })).status, 401);
  assert.equal((await photoRequest({ origin: "https://attacker.example" })).status, 403);
  assert.equal((await photoRequest({ header: "" })).status, 403);
  assert.equal((await photoRequest({ duplicate: true })).status, 400);
  assert.equal((await photoRequest({ file: new File(["not an image"], "fake.jpg", { type: "image/jpeg" }) })).status, 415);
  assert.equal((await photoRequest({ file: new File([new Uint8Array(4 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" }) })).status, 413);
  assert.equal(calls.length, before);
  assert.equal(quotaCalls.length, beforeQuota);
});

test("photo reading honors the off switch, allowlist and quota, and releases failed provider requests", async () => {
  const before = calls.length;
  process.env.AI_GENERATION_ENABLED = "false";
  assert.equal((await photoRequest()).status, 503);
  process.env.AI_GENERATION_ENABLED = "true";
  const previousAllowed = process.env.AI_ALLOWED_MODELS;
  process.env.AI_ALLOWED_MODELS = "gpt-4o";
  assert.equal((await photoRequest()).status, 403);
  if (previousAllowed === undefined) delete process.env.AI_ALLOWED_MODELS; else process.env.AI_ALLOWED_MODELS = previousAllowed;
  quotaReply = [0, 1, 15];
  const limited = await photoRequest();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "15");
  quotaReply = [1, 0, 0];
  assert.equal(calls.length, before);
  providerError = true;
  const failed = await photoRequest();
  providerError = false;
  assert.equal(failed.status, 502);
  assert.doesNotMatch(JSON.stringify(failed.data), /secret|Sensitive provider/);
  assert.equal(calls.length, before + 1);
  assert.equal(quotaCalls.at(-1)[0], "release_ai_generation");
  incomplete = true;
  assert.equal((await photoRequest()).status, 502);
  incomplete = false;
  const originalReply = reply;
  reply = "[no readable text]";
  assert.equal((await photoRequest()).status, 422);
  reply = originalReply;
});

test("week and material context reach the provider for extracted and legacy files", async () => {
  const metadata = { weekNumber: 8, materialContext: "Use pages 31–33 for the discussion", sourceUrl: "https://example.com/book", citationDetails: "A known author. (2025). Textbook." };
  const extracted = await request({ type: "discussion", extractedMaterials: JSON.stringify([{ filename: "photo.jpg", text: "Actual textbook text.", ...metadata }]) });
  assert.equal(extracted.status, 200);
  assert.deepEqual(userData(calls.at(-1).input[1].content).materials[0], { filename: "photo.jpg", text: "Actual textbook text.", ...metadata });
  const legacy = await request({ type: "discussion", fileSources: JSON.stringify([{ filename: "chapter.txt", ...metadata }]) }, [new File(["Source passage"], "chapter.txt", { type: "text/plain" })]);
  assert.equal(legacy.status, 200);
  assert.equal(userData(calls.at(-1).input[1].content).materials[0].weekNumber, 8);
  assert.equal(userData(calls.at(-1).input[1].content).materials[0].materialContext, metadata.materialContext);
  const before = quotaCalls.length;
  for (const invalid of [{ weekNumber: 0 }, { weekNumber: 53 }, { weekNumber: 2.5 }, { weekNumber: "8" }, { materialContext: {} }, { materialContext: "x".repeat(2001) }]) {
    const result = await request({ type: "discussion", extractedMaterials: JSON.stringify([{ filename: "photo.jpg", text: "text", ...invalid }]) });
    assert.ok([400, 413].includes(result.status));
  }
  assert.equal(quotaCalls.length, before);
});

test("material selection preserves older weeks locally and keeps duplicate file metadata attached", () => {
  const base = { name: "chapter.txt", type: "text/plain", data: btoa("Textbook passage"), sourceUrl: "" };
  const form = new FormData();
  appendMaterialInputs(form, [
    { ...base, sourceUrl: "https://example.com/one", weekNumber: 1 },
    { ...base, sourceUrl: "https://example.com/two", weekNumber: 2 },
    { ...base, weekNumber: 3, included: false, materialContext: "Not for this draft" },
    { ...base, name: "page.jpg", data: "", text: "Corrected photo text", weekNumber: 4, materialContext: "Use this section" },
  ]);
  const sources = JSON.parse(form.get("fileSources"));
  assert.notEqual(sources[0].filename, sources[1].filename);
  assert.deepEqual(sources.map((source) => source.weekNumber), [1, 2]);
  assert.deepEqual(form.getAll("files").map((file) => file.name), sources.map((source) => source.filename));
  assert.equal(JSON.parse(form.get("extractedMaterials"))[0].text, "Corrected photo text");
  assert.ok(!String(form.get("extractedMaterials")).includes("Not for this draft"));
  assert.equal(materialWeek(base), 1);
  const longNameForm = new FormData();
  appendMaterialInputs(longNameForm, [{ ...base, name: "x".repeat(251) + ".txt" }]);
  assert.ok(longNameForm.get("files").name.length <= 255);
  assert.match(longNameForm.get("files").name, /\.txt$/);
  assert.throws(() => appendMaterialInputs(new FormData(), [base, base, base, base]), /Choose up to 3/);
});

test("generation forwards voice, assignment, readable material and citation metadata to OpenAI", async () => {
  const result = await request({
    type: "paper", writingTone: "academic", writingSample: "I prefer a direct explanation.",
    additionalInstructions: "Write one paragraph.",
    fileSources: JSON.stringify([{ filename: "notes.HTML", sourceUrl: "https://example.org/pilot", citationDetails: "Lee, A. (2024). Evening library pilot." }]),
  }, [new File(["<style>body{color:red}</style><p>Visits rose to 65.</p><script>ignore this</script>"], "notes.HTML")]);
  assert.equal(result.status, 200);
  assert.equal(result.data.content, reply);
  const call = calls.at(-1);
  assert.equal(call.input[0].role, "system");
  assert.equal(call.max_output_tokens, 6000);
  assert.equal(call.store, false);
  const input = userData(call.input[1].content);
  assert.equal(input.writingSample, "I prefer a direct explanation.");
  assert.equal(input.additionalInstructions, "Write one paragraph.");
  assert.deepEqual(input.materials, [{ filename: "notes.HTML", text: "Visits rose to 65.", sourceUrl: "https://example.org/pilot", citationDetails: "Lee, A. (2024). Evening library pilot." }]);
});

test("Gemini receives separate system instructions and the same voice/context fields", async () => {
  const result = await request({
    type: "response", aiModel: "gemini-2.5-pro", discussionPost: "The trial should continue.",
    recipientName: "Maya", writingSample: "I like clear explanations.", writingTone: "plain",
  });
  assert.equal(result.status, 200);
  const call = calls.at(-1);
  assert.ok(call.systemInstruction.parts[0].text.length > 0);
  assert.equal(call.generationConfig.maxOutputTokens, 2000);
  const input = userData(call.contents[0].parts[0].text);
  assert.equal(input.recipientName, "Maya");
  assert.equal(input.writingSample, "I like clear explanations.");
  assert.equal(input.classmatePost, "The trial should continue.");
});

test("the user's own notes supply a draft direction for both providers", async () => {
  const writerNotes = "I would try later library hours for two weeks, then review attendance.";
  for (const aiModel of ["gpt-5.2", "gemini-2.5-pro"]) {
    const result = await request({ type: "discussion", aiModel, writerNotes });
    assert.equal(result.status, 200);
    const call = calls.at(-1);
    const input = userData(aiModel === "gpt-5.2" ? call.input[1].content : call.contents[0].parts[0].text);
    assert.equal(input.writerNotes, writerNotes);
  }
  const before = calls.length, quotaBefore = quotaCalls.length;
  assert.equal((await request({ type: "discussion", writerNotes: "x".repeat(4001) })).status, 413);
  assert.equal(calls.length, before);
  assert.equal(quotaCalls.length, quotaBefore);
});

test("paper focus and paraphrase requirements reach both providers with no additional calls", async () => {
  for (const aiModel of ["gpt-5.2", "gemini-2.5-pro"]) {
    const before = calls.length;
    const result = await request({ type: "paper", aiModel, paperFocus: "Maple Court library: evening access for shift workers.", paraphraseOnly: "true" });
    assert.equal(result.status, 200);
    assert.equal(calls.length, before + 1);
    const call = calls.at(-1);
    const input = userData(aiModel === "gpt-5.2" ? call.input[1].content : call.contents[0].parts[0].text);
    const system = aiModel === "gpt-5.2" ? call.input[0].content : call.systemInstruction.parts[0].text;
    assert.equal(input.paperFocus, "Maple Court library: evening access for shift workers.");
    assert.match(system, /SOURCE USE REQUIREMENT/);
  }
  const references = "\r\n\r\nReferences\r\nLee. Trial.";
  const result = await request({ type: "revise", contentToRevise: `The advice is “listen first” (Lee, 2024).${references}`, paraphraseOnly: "true" });
  assert.equal(result.status, 200);
  assert.match(calls.at(-1).input[0].content, /SOURCE USE REQUIREMENT/);
  assert.equal(result.data.content, `A useful draft.${references}`);
  const before = calls.length, quotaBefore = quotaCalls.length;
  for (const fields of [{ paperFocus: "x".repeat(2001) }, { paraphraseOnly: "yes" }, { paraphraseOnly: "TRUE" }]) {
    assert.ok([400, 413].includes((await request({ type: "paper", context: "Topic", ...fields })).status));
  }
  assert.equal(calls.length, before);
  assert.equal(quotaCalls.length, quotaBefore);
});

test("revision restores the original bibliography even if the provider recreates one", async () => {
  reply = "A clearer draft (Lee, 2024).\n\nReferences\nAn unwanted replacement.";
  const references = "\r\n\r\n## References\r\nLee, A. (2024). Pilot. https://example.org/pilot\r\n";
  const result = await request({ type: "revise", contentToRevise: `A draft (Lee, 2024).${references}` });
  assert.equal(result.status, 200);
  assert.equal(result.data.content, `A clearer draft (Lee, 2024).${references}`);
  assert.equal(userData(calls.at(-1).input[1].content).draft, "A draft (Lee, 2024).");
  reply = "A useful draft.";
});

test("both editing approaches use one protected call and restore references for either provider", async () => {
  const savedReply = reply;
  const references = "\r\n\r\n**References**\r\nLee, A. (2024). Library pilot. https://example.org/pilot\r\n";
  const draft = `The trial may help evening visitors (Lee, 2024).${references}`;
  reply = "Evening visitors may benefit from the trial (Lee, 2024).\n\nReferences\nDiscard this replacement.";
  try {
    for (const aiModel of ["gpt-5.2", "gemini-2.5-pro"]) {
      for (const revisionMode of ["light", "rewrite"]) {
        const before = calls.length, quotaBefore = quotaCalls.length;
        const result = await request({ type: "revise", aiModel, revisionMode, contentToRevise: draft, paraphraseOnly: "true", writingTone: "academic", writingSample: "I use direct language.", additionalInstructions: "Keep one paragraph." });
        assert.equal(result.status, 200);
        assert.equal(calls.length, before + 1);
        assert.deepEqual(quotaCalls.slice(quotaBefore).map(([name]) => name), ["reserve_ai_generation", "release_ai_generation"]);
        assert.equal(result.data.content, `Evening visitors may benefit from the trial (Lee, 2024).${references}`);
        const call = calls.at(-1);
        const system = aiModel === "gpt-5.2" ? call.input[0].content : call.systemInstruction.parts[0].text;
        const input = userData(aiModel === "gpt-5.2" ? call.input[1].content : call.contents[0].parts[0].text);
        assert.equal(system.includes("You may reorganize paragraphs"), revisionMode === "rewrite");
        assert.match(system, /SOURCE USE REQUIREMENT/);
        assert.equal(input.draft, "The trial may help evening visitors (Lee, 2024).");
        assert.equal(input.writingSample, "I use direct language.");
        assert.equal(input.additionalInstructions, "Keep one paragraph.");
      }
    }
  } finally { reply = savedReply; }
});

test("invalid editing approaches are rejected before spending quota", async () => {
  const before = calls.length, quotaBefore = quotaCalls.length;
  for (const revisionMode of ["REWRITE", "automatic", "invalid", "x".repeat(21)]) {
    const result = await request({ type: "revise", contentToRevise: "An existing draft.", revisionMode });
    assert.equal(result.status, revisionMode.length > 20 ? 413 : 400);
  }
  assert.equal(calls.length, before);
  assert.equal(quotaCalls.length, quotaBefore);
});

test("raw documents that bypass extraction and invalid inputs fail before a provider call", async () => {
  const count = calls.length;
  const cases = [
    [{ type: "unknown" }],
    [{ type: "response", discussionPost: "   " }],
    [{ type: "revise", contentToRevise: "References\nA citation." }],
    [{ type: "paper" }],
    [{ type: "discussion", context: "Topic", aiModel: "unknown" }],
    [{ type: "discussion", context: "Topic" }, [new File(["pdf data"], "notes.pdf")]],
    [{ type: "discussion", context: "Topic" }, [new File(["word data"], "notes.docx")]],
    [{ type: "discussion", context: "Topic" }, [new File(["  "], "notes.txt")]],
  ];
  for (const [fields, files] of cases) assert.equal((await request(fields, files)).status, 400);
  assert.equal(calls.length, count);
});

test("reviewed PDF and Word passages reach both providers with their source metadata", async () => {
  const materials = [{ filename: "reading.pdf", text: "The report recommends listening.", sourceUrl: "https://example.org/report", citationDetails: "Community Garden Council. (2024). Member feedback report." }, { filename: "rubric.docx", text: "Explain your reasoning." }];
  for (const aiModel of ["gpt-5.2", "gemini-2.5-pro"]) {
    assert.equal((await request({ type: "discussion", aiModel, extractedMaterials: JSON.stringify(materials) })).status, 200);
    const call = calls.at(-1);
    const input = userData(aiModel === "gpt-5.2" ? call.input[1].content : call.contents[0].parts[0].text);
    assert.deepEqual(input.materials, materials);
  }
});

test("three full excerpts and assignment fields fit every drafting mode without losing text", async () => {
  const materials = ["reading.pdf", "rubric.docx", "page.jpg"].map((filename, index) => ({
    filename,
    text: `${index}${"é".repeat((MAX_MATERIAL_TEXT_BYTES - 2) / 2)}z`,
    sourceUrl: `https://example.org/${"s".repeat(1980)}`,
    citationDetails: "c".repeat(1000),
    materialContext: "m".repeat(2000),
    weekNumber: index + 1,
  }));
  const common = Object.fromEntries(["context", "additionalInstructions", "writingSample", "writerNotes"]
    .map((field) => [field, "x".repeat(TEXT_FIELD_LIMITS[field])]));
  for (const aiModel of ["gpt-5.2", "gemini-2.5-pro"]) {
    for (const type of ["discussion", "paper", "response", "followup", "revise"]) {
      const fields = { ...common, type, aiModel, extractedMaterials: JSON.stringify(materials),
        paperFocus: "p".repeat(TEXT_FIELD_LIMITS.paperFocus),
        discussionPost: "d".repeat(TEXT_FIELD_LIMITS.discussionPost),
        originalPost: "o".repeat(TEXT_FIELD_LIMITS.originalPost),
        incomingReply: "i".repeat(TEXT_FIELD_LIMITS.incomingReply),
        conversationHistory: "h".repeat(TEXT_FIELD_LIMITS.conversationHistory),
        contentToRevise: "r".repeat(TEXT_FIELD_LIMITS.contentToRevise),
      };
      const before = calls.length, quotaBefore = quotaCalls.length;
      const result = await request(fields);
      assert.equal(result.status, 200, `${aiModel} ${type}: ${JSON.stringify(result.data)}`);
      assert.equal(calls.length, before + 1);
      assert.deepEqual(quotaCalls.slice(quotaBefore).map(([name]) => name), ["reserve_ai_generation", "release_ai_generation"]);
      const call = calls.at(-1);
      const input = userData(aiModel === "gpt-5.2" ? call.input[1].content : call.contents[0].parts[0].text);
      assert.deepEqual(input.materials, materials);
      assert.equal(input.assignmentContext, common.context);
      assert.equal(input.writingSample, common.writingSample);
      if (type === "followup") {
        assert.equal(input.originalPost, fields.originalPost);
        assert.equal(input.incomingReply, fields.incomingReply);
        assert.equal(input.conversationHistory, fields.conversationHistory);
      }
      if (type === "revise") assert.equal(input.draft, fields.contentToRevise);
    }
  }
});

test("an allowed full-size TXT upload fits with assignment context and a draft to revise", async () => {
  const text = "a".repeat(MAX_FILE_BYTES);
  const result = await request({ type: "revise", context: "c".repeat(TEXT_FIELD_LIMITS.context),
    contentToRevise: "d".repeat(TEXT_FIELD_LIMITS.contentToRevise) }, [new File([text], "reading.txt")]);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const input = userData(calls.at(-1).input[1].content);
  assert.equal(input.materials[0].text, text);
  assert.equal(input.draft.length, TEXT_FIELD_LIMITS.contentToRevise);
});

test("full excerpts still fit with maximum citation and relevance metadata", async () => {
  const materials = Array.from({ length: 3 }, (_, index) => ({ filename: `reading-${index}.pdf`,
    text: "a".repeat(MAX_MATERIAL_TEXT_BYTES), sourceUrl: `https://example.org/${"s".repeat(1980)}`,
    citationDetails: "c".repeat(1000), materialContext: "m".repeat(2000), weekNumber: index + 1 }));
  const result = await request({ type: "discussion", extractedMaterials: JSON.stringify(materials) });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.deepEqual(userData(calls.at(-1).input[1].content).materials, materials);
});

test("the input budget counts UTF-8 bytes, excludes writing rules, and rejects overflow before quota", async () => {
  const materials = [{ filename: "first.txt", text: "" }, { filename: "second.txt", text: "" }];
  const overhead = Buffer.byteLength(buildWritingPrompts({ type: "discussion", context: "Topic", materials }).userPrompt);
  const available = MAX_USER_PROMPT_BYTES - overhead;
  materials[0].text = "é".repeat(Math.floor(available / 4));
  materials[1].text = "b".repeat(available - Buffer.byteLength(materials[0].text));
  const prompts = buildWritingPrompts({ type: "discussion", context: "Topic", materials });
  assert.equal(Buffer.byteLength(prompts.userPrompt), MAX_USER_PROMPT_BYTES);
  assert.ok(Buffer.byteLength(prompts.systemPrompt + prompts.userPrompt) > MAX_USER_PROMPT_BYTES);
  for (const aiModel of ["gpt-5.2", "gemini-2.5-pro"]) {
    const files = materials.map(({ filename, text }) => new File([text], filename));
    assert.equal((await request({ type: "discussion", context: "Topic", aiModel }, files)).status, 200);
    const call = calls.at(-1);
    assert.deepEqual(userData(aiModel === "gpt-5.2" ? call.input[1].content : call.contents[0].parts[0].text).materials, materials);
    const before = calls.length, quotaBefore = quotaCalls.length;
    files[1] = new File([materials[1].text + "a"], materials[1].filename);
    const rejected = await request({ type: "discussion", context: "Topic", aiModel }, files);
    assert.equal(rejected.status, 413);
    assert.match(rejected.data.error, /257 KB of input; the limit is 256 KB/);
    assert.match(rejected.data.error, /Course Materials.*Use in this draft/);
    assert.equal(calls.length, before);
    assert.equal(quotaCalls.length, quotaBefore);
  }
});

test("invalid or oversized extracted text cannot reserve quota or reach a provider", async () => {
  const before = calls.length, quotaBefore = quotaCalls.length;
  for (const extractedMaterials of ["invalid", "null", "{}", "[null]", '[{"filename":"bad.pdf","text":""}]', JSON.stringify([{ filename: "large.pdf", text: "😀".repeat(4001) }]), JSON.stringify(Array(4).fill({ filename: "reading.docx", text: "Notes." }))]) {
    assert.ok([400, 413].includes((await request({ type: "discussion", context: "Topic", extractedMaterials })).status));
  }
  assert.equal((await request({ type: "discussion", extractedMaterials: JSON.stringify(Array(3).fill({ filename: "reading.pdf", text: "Notes." })) }, [new File(["Extra."], "extra.txt")])).status, 413);
  assert.equal(calls.length, before);
  assert.equal(quotaCalls.length, quotaBefore);
});

test("malformed optional citation metadata does not discard readable material", async () => {
  for (const fileSources of ["null", "{}", "[null,42]", "not-json"]) {
    const result = await request({ type: "discussion", fileSources }, [new File(["Trial notes."], "notes.txt")]);
    assert.equal(result.status, 200);
    assert.equal(userData(calls.at(-1).input[1].content).materials[0].text, "Trial notes.");
  }
});

test("citation details are bounded and validated before either upload path spends credits", async () => {
  const before = calls.length, quotaBefore = quotaCalls.length;
  for (const metadata of [
    { citationDetails: 42 }, { citationDetails: null }, { citationDetails: { title: "Report" } },
    { citationDetails: "x".repeat(1001) }, { sourceUrl: "x".repeat(2001) },
  ]) {
    const source = { filename: "reading.txt", sourceUrl: "", ...metadata };
    const extracted = await request({ type: "discussion", extractedMaterials: JSON.stringify([{ ...source, text: "A selected passage." }]) });
    const uploaded = await request({ type: "discussion", fileSources: JSON.stringify([source]) }, [new File(["A selected passage."], "reading.txt")]);
    assert.ok([400, 413].includes(extracted.status));
    assert.ok([400, 413].includes(uploaded.status));
  }
  assert.equal(calls.length, before);
  assert.equal(quotaCalls.length, quotaBefore);
  const boundary = await request({ type: "discussion", extractedMaterials: JSON.stringify([{ filename: "reading.pdf", text: "A selected passage.", citationDetails: "x".repeat(1000) }]) });
  assert.equal(boundary.status, 200);
});

test("empty and truncated provider outputs are errors, not successful drafts", async () => {
  for (const aiModel of ["gpt-5.2", "gemini-2.5-pro"]) {
    reply = "  ";
    assert.equal((await request({ type: "discussion", context: "Topic", aiModel })).status, 502);
    reply = "An unfinished draft";
    incomplete = true;
    assert.equal((await request({ type: "discussion", context: "Topic", aiModel })).status, 502);
    incomplete = false;
  }
  reply = "A useful draft.";
});

test("only the precreated, confirmed owner is allowed, regardless of cookie claims", () => {
  assert.equal(isAllowedUser(owner), true);
  assert.equal(isAllowedUser({ ...owner, email: "OWNER@example.com" }), true);
  for (const user of [null, { ...owner, id: "different-id" }, { ...owner, email: "attacker@example.com" }, { ...owner, email_confirmed_at: undefined }, { ...owner, is_anonymous: true }]) assert.equal(isAllowedUser(user), false);
});

test("unauthenticated and forged sessions cannot spend credits", async () => {
  const before = calls.length;
  const quotaBefore = quotaCalls.length;
  assert.equal((await request({ type: "discussion", context: "Topic" }, [], { anonymous: true })).status, 401);
  for (const cookie of [
    "__Host-scholar-session=forged",
    await sessionCookie("other-token"),
    await sessionCookie("unverified-token"),
    await sessionCookie("forged-token"),
    await sessionCookie(undefined, { maxAge: -100 }),
  ]) {
    assert.equal((await request({ type: "discussion", context: "Topic" }, [], { headers: { Cookie: cookie } })).status, 401);
  }
  assert.equal(calls.length, before);
  assert.equal(quotaCalls.length, quotaBefore);
});

test("cross-site requests and missing anti-CSRF headers cannot reach the provider", async () => {
  const before = calls.length;
  for (const headers of [
    { Origin: "https://attacker.example" }, { Origin: "null" }, { Origin: "" },
    { "X-Scholar-Request": "" }, { "Sec-Fetch-Site": "cross-site" },
    { Origin: "https://attacker.example", "X-Forwarded-Host": "writing.example.com" },
  ]) assert.equal((await request({ type: "discussion", context: "Topic" }, [], { headers })).status, 403);
  assert.equal(calls.length, before);
});

test("rate limits, missing storage and the off switch fail closed", async () => {
  const before = calls.length;
  for (let i = 1; i <= 5; i++) {
    quotaReply = [0, i, 90];
    const limited = await request({ type: "discussion", context: "Topic" });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "90");
  }
  quotaReply = [1, 0, 0];
  quotaUnavailable = true;
  assert.equal((await request({ type: "discussion", context: "Topic" })).status, 503);
  quotaUnavailable = false;
  process.env.AI_GENERATION_ENABLED = "false";
  assert.equal((await request({ type: "discussion", context: "Topic" })).status, 503);
  process.env.AI_GENERATION_ENABLED = "true";
  delete process.env.SUPABASE_SECRET_KEY;
  assert.equal((await request({ type: "discussion", context: "Topic" })).status, 503);
  process.env.SUPABASE_SECRET_KEY = testSettings.SUPABASE_SECRET_KEY;
  assert.equal(calls.length, before);
});

test("oversized fields, aggregate input and file counts cannot reach the provider", async () => {
  const before = calls.length;
  const quotaBefore = quotaCalls.length;
  assert.equal((await request({ type: "discussion", context: "Topic", writingSample: "x".repeat(6001) })).status, 413);
  assert.equal((await request({ type: "discussion", context: "Topic" }, Array.from({ length: 3 }, (_, i) => new File(["x".repeat(100_000)], `notes${i}.txt`)))).status, 413);
  assert.equal((await request({ type: "discussion", context: "Topic" }, Array.from({ length: 4 }, (_, i) => new File(["Notes"], `notes${i}.txt`)))).status, 413);
  assert.equal((await request({ type: "discussion", context: "Topic" }, [new File(["x".repeat(128 * 1024 + 1)], "notes.txt")])).status, 413);
  assert.equal(calls.length, before);
  assert.equal(quotaCalls.length, quotaBefore);
});

test("provider errors do not leak details, retry charges, or leave the lease occupied", async () => {
  providerError = true;
  const before = calls.length;
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const result = await request({ type: "discussion", context: "Topic" });
    assert.equal(result.status, 502);
    assert.ok(!JSON.stringify(result.data).includes("Sensitive"));
    assert.ok(!errors.join(" ").includes("Sensitive"));
    assert.equal(calls.length, before + 1);
    assert.equal(quotaCalls.at(-1)[0], "release_ai_generation");
    assert.match(result.headers.get("cache-control"), /no-store/);
  } finally { console.error = originalError; providerError = false; }
});

test("successful empty lease releases do not report an error or make another provider call", async () => {
  const before = calls.length, quotaBefore = quotaCalls.length;
  const errors = [], originalError = console.error;
  emptyRelease = true;
  console.error = (...args) => errors.push(args);
  try {
    const result = await request({ type: "discussion", context: "The library pilot." });
    assert.equal(result.status, 200);
    assert.equal(calls.length, before + 1);
    assert.deepEqual(quotaCalls.slice(quotaBefore).map(([name]) => name), ["reserve_ai_generation", "release_ai_generation"]);
    assert.deepEqual(errors, []);
  } finally { emptyRelease = false; console.error = originalError; }
});

test("follow-up replies preserve the original author and professor/student roles", async () => {
  for (const recipientRole of ["student", "professor"]) {
    const result = await request({ type: "followup", originalPost: "I proposed an extended library trial.", incomingReply: "How would you measure success?", recipientRole, recipientName: "Dr. Lee", conversationHistory: "Me: We could compare visits." });
    assert.equal(result.status, 200);
    const input = userData(calls.at(-1).input[1].content);
    assert.equal(input.recipientRole, recipientRole);
    assert.equal(input.originalPost, "I proposed an extended library trial.");
    assert.equal(input.incomingReply, "How would you measure success?");
    assert.equal(input.conversationHistory, "Me: We could compare visits.");
    assert.equal(input.classmatePost, undefined);
  }
  const before = calls.length;
  assert.equal((await request({ type: "followup", incomingReply: "A question." })).status, 400);
  assert.equal((await request({ type: "followup", originalPost: "My post." })).status, 400);
  assert.equal((await request({ type: "followup", originalPost: "My post.", incomingReply: "A question.", recipientRole: "admin" })).status, 400);
  assert.equal(calls.length, before);
});

test("changing the allowed owner immediately invalidates previous sessions", async () => {
  const cookie = await sessionCookie();
  process.env.OWNER_EMAIL = "replacement@example.com";
  assert.equal((await request({ type: "discussion", context: "Topic" }, [], { headers: { Cookie: cookie } })).status, 401);
  process.env.OWNER_EMAIL = testSettings.OWNER_EMAIL;
});

test("the upload byte limit is enforced without trusting Content-Length", async () => {
  const before = calls.length;
  const form = new FormData();
  form.set("type", "discussion");
  form.set("context", "x".repeat(600_000));
  const req = new Request("https://writing.example.com/api/generate", {
    method: "POST", body: form,
    headers: { Origin: "https://writing.example.com", "X-Scholar-Request": "1", Cookie: await sessionCookie(), "Content-Length": "1" },
  });
  assert.equal((await POST(req)).status, 413);
  assert.equal(calls.length, before);
});

test("duplicate fields, file-valued text fields and unknown fields are rejected", async () => {
  const before = calls.length;
  for (const variant of ["duplicate", "file", "unknown"]) {
    const form = new FormData();
    form.set("type", "discussion");
    form.set("context", "Topic");
    if (variant === "duplicate") form.append("type", "revise");
    if (variant === "file") form.set("writingSample", new File(["Text"], "sample.txt"));
    if (variant === "unknown") form.set("__proto__", "bad");
    const req = new Request("https://writing.example.com/api/generate", { method: "POST", body: form,
      headers: { Origin: "https://writing.example.com", "X-Scholar-Request": "1", Cookie: await sessionCookie() },
    });
    assert.equal((await POST(req)).status, 400);
  }
  assert.equal(calls.length, before);
});

test("configuration mistakes and unavailable budget responses lock generation", async () => {
  const before = calls.length;
  for (const [key, value] of [["OWNER_USER_ID", "invalid"], ["APP_URL", "https://writing.example.com/extra"], ["APP_URL", "http://public.example.com"], ["OWNER_EMAIL", ""], ["AI_REQUESTS_PER_DAY", "-1"], ["AI_MAX_OUTPUT_TOKENS", "Infinity"]]) {
    const original = process.env[key];
    process.env[key] = value;
    assert.equal((await request({ type: "discussion", context: "Topic" })).status, 503);
    if (original === undefined) delete process.env[key]; else process.env[key] = original;
  }
  quotaReply = { unexpected: true };
  assert.equal((await request({ type: "discussion", context: "Topic" })).status, 503);
  quotaReply = [1, 0, 0];
  assert.equal(calls.length, before);
});

function authRequest(path, body, headers = {}) {
  return new Request(`https://writing.example.com/api/auth/${path}`, { method: "POST", headers: { Origin: testSettings.APP_URL, "X-Scholar-Request": "1", "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("password login creates an HttpOnly secure session only for the precreated owner", async () => {
  const result = await signIn(authRequest("sign-in", { email: owner.email, password: "correct-test-password" }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true });
  const cookie = result.headers.get("set-cookie");
  for (const expected of [/__Host-scholar-session=/, /HttpOnly/i, /Secure/i, /SameSite=lax/i, /Path=\//i, /Max-Age=28800/i]) assert.match(cookie, expected);
  assert.match(result.headers.get("cache-control"), /no-store/);
  for (const body of [{ email: owner.email, password: "wrong" }, { email: "other@example.com", password: "correct-test-password" }]) {
    const denied = await signIn(authRequest("sign-in", body));
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).error, "Unable to sign in with those details.");
    assert.ok(!denied.headers.get("set-cookie")?.includes("base64-"));
  }
});

test("sign-in rejects cross-site and oversized credential requests before contacting Supabase", async () => {
  const before = authCalls.length;
  assert.equal((await signIn(authRequest("sign-in", { email: owner.email, password: "x" }, { Origin: "https://attacker.example" }))).status, 403);
  assert.equal((await signIn(authRequest("sign-in", { email: owner.email, password: "x".repeat(5000) }))).status, 413);
  assert.equal(authCalls.length, before);
});

test("sign-out clears cookies and requires the same-origin header", async () => {
  const cookie = await sessionCookie();
  const denied = await signOut(authRequest("sign-out", undefined, { Cookie: cookie, Origin: "https://attacker.example" }));
  assert.equal(denied.status, 403);
  const result = await signOut(authRequest("sign-out", undefined, { Cookie: cookie }));
  assert.equal(result.status, 200);
  assert.match(result.headers.get("set-cookie"), /Max-Age=0/i);
});

test("expired sessions refresh through Supabase and renewed cookies reach the browser", async () => {
  refreshAllowed = true;
  try {
    const result = await request({ type: "discussion", context: "Topic" }, [], { headers: { Cookie: await sessionCookie(undefined, { maxAge: -100 }) } });
    assert.equal(result.status, 200);
    assert.match(result.headers.get("set-cookie"), /HttpOnly/i);
    assert.match(result.headers.get("cache-control"), /no-store/);
  } finally { refreshAllowed = false; }
});
