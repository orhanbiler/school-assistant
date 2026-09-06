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

test("revision restores the original bibliography even if the provider recreates one", async () => {
  reply = "A clearer draft (Lee, 2024).\n\nReferences\nAn unwanted replacement.";
  const references = "\r\n\r\n## References\r\nLee, A. (2024). Pilot. https://example.org/pilot\r\n";
  const result = await request({ type: "revise", contentToRevise: `A draft (Lee, 2024).${references}` });
  assert.equal(result.status, 200);
  assert.equal(result.data.content, `A clearer draft (Lee, 2024).${references}`);
  assert.equal(userData(calls.at(-1).input[1].content).draft, "A draft (Lee, 2024).");
  reply = "A useful draft.";
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
  assert.equal((await request({ type: "discussion", context: "Topic", writingSample: "x".repeat(6001) })).status, 413);
  assert.equal((await request({ type: "discussion", context: "x".repeat(20_000), writingSample: "x".repeat(6000), additionalInstructions: "x".repeat(4000) })).status, 413);
  assert.equal((await request({ type: "discussion", context: "Topic" }, Array.from({ length: 4 }, (_, i) => new File(["Notes"], `notes${i}.txt`)))).status, 413);
  assert.equal((await request({ type: "discussion", context: "Topic" }, [new File(["x".repeat(128 * 1024 + 1)], "notes.txt")])).status, 413);
  assert.equal(calls.length, before);
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
