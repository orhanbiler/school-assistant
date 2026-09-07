// Live, paid evaluation: bounded synthetic drafts, charged to the real usage quota.
import OpenAI from "openai";
import { createRequire, registerHooks } from "node:module";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectSamples, describeDraft, hash } from "./lib/evaluation-records.mjs";

const usage = "Usage: node --experimental-strip-types scripts/evaluate-writing.mjs [paper|reply|booking] [--runs 1..5] [--dry-run]";
const args = process.argv.slice(2);
if (args.includes("--help")) { console.log(usage); process.exit(0); }
const selected = args[0] && !args[0].startsWith("--") ? args.shift() : "paper";
let runs = 1;
let dryRun = false;
const seen = new Set();
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (seen.has(flag)) { console.error(usage); process.exit(1); }
  seen.add(flag);
  if (flag === "--dry-run") dryRun = true;
  else if (flag === "--runs" && /^[1-5]$/u.test(args[i + 1] || "")) runs = Number(args[++i]);
  else { console.error(usage); process.exit(1); }
}
if (!["paper", "reply", "booking"].includes(selected)) { console.error(usage); process.exit(1); }

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
  // This topic does not reuse the library or garden examples in the system prompt.
  booking: { type: "paper", pageCount: "2", writingTone: "academic", paraphraseOnly: true,
    paperFocus: "Fictional Alder College media lab: reducing unused equipment reservations without excluding students.",
    context: "Write a 500–600-word essay, excluding references, recommending how to handle unused media-lab reservations. Compare automatic cancellation with reminders, explain an access concern and an implementation challenge, and propose a way to evaluate the decision. Distinguish recorded facts from proposals and uncertainties. Use only the supplied fictional source, APA in-text citations, a reference list, and paraphrases only.",
    writerNotes: "I would test reminders before automatic cancellation. An uncollected booking does not tell us why someone could not arrive. I want to know whether reminders reach students and whether other students actually get access to released equipment. A pilot could record collection times and later use of canceled slots. These are my proposals, not findings or agreed policies.",
    materials: [{ filename: "fictional-media-lab.txt",
      citationDetails: "Alder College Media Lab. (2025). Equipment reservation review. Fictional classroom source.",
      text: "During a fictional four-week review, students made 120 camera-kit reservations. Eighteen kits were not collected within 30 minutes of the booked start. Staff recorded nine requests from walk-in students while kits remained reserved. The review did not record whether any of the eighteen kits were collected later, why students arrived late, or whether the walk-in requests came from different people. No reminders or automatic cancellation rules were tested. The booking system stores email addresses, but delivery reliability was not measured. Staff have not estimated the cost of changing the system or assessed disability-related access needs. No partner has committed funding or work." }],
  },
};

let directory;
let completed = 0;
try {
  const options = cases[selected];
  const prompts = buildWritingPrompts(options);
  const targetWords = selected === "reply" ? [150, 180] : [500, 600];
  if (Buffer.byteLength(prompts.systemPrompt + prompts.userPrompt, "utf8") > MAX_PROMPT_BYTES) throw new Error("Comparison input is too long.");
  // Preserve production request defaults to measure baseline variability first.
  const request = {
    model, store: false, max_output_tokens: getMaxOutputTokens(options.type),
    input: [{ role: "system", content: prompts.systemPrompt }, { role: "user", content: prompts.userPrompt }],
  };
  const promptHash = hash(JSON.stringify(request.input));
  const requestHash = hash(JSON.stringify(request));
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, case: selected, plannedRequests: runs, requestHash, targetWords, request }, null, 2));
    process.exit(0);
  }
  if (!getAccessConfig().ready || !process.env.OPENAI_API_KEY) throw new UsageError("Private generation is not configured.", 503);
  const allowed = process.env.AI_ALLOWED_MODELS?.split(",").map((item) => item.trim()).filter(Boolean);
  if (allowed && !allowed.includes(model)) throw new UsageError("The comparison model is disabled.", 403);
  directory = await mkdtemp(join(tmpdir(), `school-writing-eval-${selected}-`));
  await writeFile(join(directory, "request.json"), JSON.stringify(request, null, 2), { mode: 0o600 });
  await writeFile(join(directory, "input.json"), JSON.stringify(prompts, null, 2), { mode: 0o600 });
  const experiment = { schemaVersion: 2, date: new Date().toISOString(), model, case: selected, runs,
    promptHash, requestHash, options, targetWords, status: "running", completed: 0 };
  const saveExperiment = () => writeFile(join(directory, "experiment.json"), JSON.stringify(experiment, null, 2), { mode: 0o600 });
  await saveExperiment();
  console.log(JSON.stringify({ directory, model, plannedRequests: runs }));
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: PROVIDER_TIMEOUT_MS });
  try {
    await collectSamples({ runs, reserve: reserveGeneration, generate: () => client.responses.create(request),
      save: async ({ run, response, durationMs }) => {
        const content = response.output_text.trim() + prompts.references;
        const body = splitReferenceSection(content).body;
        const metrics = describeDraft(content, body, targetWords);
        const manifest = { schemaVersion: 2, date: new Date().toISOString(), model, returnedModel: response.model,
          responseId: response.id, case: selected, run, promptHash, requestHash, durationMs,
          effectiveSettings: { reasoning: response.reasoning ?? null, temperature: response.temperature ?? null,
            topP: response.top_p ?? null, text: response.text ?? null, maxOutputTokens: response.max_output_tokens ?? null },
          usage: response.usage, ...metrics };
        const runDirectory = runs === 1 ? directory : join(directory, `run-${String(run).padStart(2, "0")}`);
        if (runs > 1) await mkdir(runDirectory, { mode: 0o700 });
        await writeFile(join(runDirectory, "draft.txt"), content, { mode: 0o600 });
        await writeFile(join(runDirectory, "body.txt"), body, { mode: 0o600 });
        await writeFile(join(runDirectory, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
        completed = run;
        experiment.completed = run;
        await saveExperiment();
        console.log(JSON.stringify({ directory: runDirectory, run, returnedModel: response.model,
          bodyWords: metrics.bodyWords, withinTarget: metrics.withinTarget }));
      },
    });
    experiment.status = "completed";
  } catch (error) {
    experiment.status = "stopped";
    throw error;
  } finally { await saveExperiment(); }
} catch (error) {
  console.error(error instanceof UsageError ? error.message : "Live comparison could not complete. No credentials or provider details were logged.");
  if (directory) console.error(JSON.stringify({ directory, completed, plannedRequests: runs }));
  process.exitCode = 1;
}
