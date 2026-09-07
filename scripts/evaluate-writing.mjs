// Live, paid evaluation: one synthetic draft, charged to the real usage quota.
import OpenAI from "openai";
import { createRequire, registerHooks } from "node:module";
import { realpathSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = new URL("../", import.meta.url);
const require = createRequire(realpathSync(fileURLToPath(new URL("node_modules/next/package.json", root))));
require("@next/env").loadEnvConfig(fileURLToPath(root), false, { info() {}, error() {} });
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(new URL(`src/${specifier.slice(2)}.ts`, root).href, context);
  return nextResolve(specifier, context);
} });
const { buildWritingPrompts, splitReferenceSection } = await import("../src/lib/writing-prompts.ts");
const { reserveGeneration, getMaxOutputTokens, UsageError } = await import("../src/lib/server/usage-limits.ts");
const { getAccessConfig } = await import("../src/lib/server/access-config.ts");
const { MAX_PROMPT_BYTES, PROVIDER_TIMEOUT_MS } = await import("../src/lib/request-limits.ts");

const selected = process.argv[2] || "paper";
const model = "gpt-5.2";
const materials = [{
  filename: "fictional-pilot.txt", citationDetails: "Bell College Library. (2024). Evening access pilot. Fictional classroom source.",
  text: "In a fictional six-week trial, the library closed at 9 p.m. instead of 7 p.m. Average evening visits rose from 40 to 65; staffing costs rose by 20%. The trial did not count unique visitors, collect student opinions, or track grades. Exam season overlapped with the trial. Staff did not measure use after 9 p.m. No long-term funding or volunteer commitments were established.",
}];
const cases = {
  paper: { type: "paper", pageCount: "2", writingTone: "academic", paraphraseOnly: true,
    paperFocus: "Fictional Bell College Library: extending evening access for students who work during the day.",
    context: "Write a 500–600-word essay considering whether to extend the library-hours trial. Explain implementation challenges, ways to address them, and partners who could help. Use APA in-text citations and a reference list. Paraphrase only. Use only the supplied fictional evidence.",
    writerNotes: "I favor extending the trial before making it permanent. More visits are encouraging, but I would compare use outside exam season and check what the extra staffing costs buy. A student group could help ask students when they need access. Library staff would need to record visits and actual staffing costs. Those are proposals, not existing commitments.", materials },
  reply: { type: "followup", writingTone: "plain", recipientRole: "professor", recipientName: "Dr. Lee",
    originalPost: "I would extend the library trial before making a permanent decision. Visits increased, but staffing costs did too.",
    incomingReply: "How would you distinguish increased demand from exam-season use? What would a student survey fail to tell you?",
    additionalInstructions: "Reply in 150–180 words. Answer both questions, use the provided citation, and paraphrase only.",
    writerNotes: "I would compare visits during another six-week period outside exams, record staffing costs, and ask students about needed hours. A survey measures stated preferences; it would not show actual attendance or prove grades improved.", materials },
};

try {
  const options = cases[selected];
  if (!options) throw new Error("Choose paper or reply.");
  if (!getAccessConfig().ready || !process.env.OPENAI_API_KEY) throw new Error("Private generation is not configured.");
  const allowed = process.env.AI_ALLOWED_MODELS?.split(",").map((item) => item.trim()).filter(Boolean);
  if (allowed && !allowed.includes(model)) throw new Error("The comparison model is disabled.");
  if (process.argv.length > 3) throw new Error("Use only the paper or reply argument.");
  const directory = await mkdtemp(join(tmpdir(), `school-writing-eval-${selected}-`));
  const prompts = buildWritingPrompts(options);
  if (Buffer.byteLength(prompts.systemPrompt + prompts.userPrompt, "utf8") > MAX_PROMPT_BYTES) throw new Error("Comparison input is too long.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: PROVIDER_TIMEOUT_MS });
  const release = await reserveGeneration();
  let content;
  try {
    const response = await client.responses.create({
      model, store: false, max_output_tokens: getMaxOutputTokens(options.type),
      input: [{ role: "system", content: prompts.systemPrompt }, { role: "user", content: prompts.userPrompt }],
    });
    if (response.status !== "completed" || !response.output_text?.trim()) throw new Error("Provider did not complete the draft.");
    content = response.output_text;
  } finally { await release(); }
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const bodyWords = splitReferenceSection(content).body.trim().split(/\s+/u).length;
  const manifest = { date: new Date().toISOString(), model, case: selected, bodyWords,
    contentHash: hash(content), promptHash: hash(prompts.systemPrompt + prompts.userPrompt), options };
  await writeFile(join(directory, "draft.txt"), content);
  await writeFile(join(directory, "input.json"), JSON.stringify(prompts, null, 2));
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ directory, model, bodyWords }));
} catch (error) {
  console.error(error instanceof UsageError ? error.message : "Live comparison could not complete. No credentials or provider details were logged.");
  process.exitCode = 1;
}
