import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const countWords = (value) => value.trim() ? value.trim().split(/\s+/u).length : 0;

// Sequential requests use the same shared quota as the app. Stop at the first
// failure; never silently retry a paid request or discard earlier samples.
export async function collectSamples({ runs, reserve, generate, save }) {
  for (let run = 1; run <= runs; run++) {
    const release = await reserve();
    let response;
    const started = Date.now();
    try {
      response = await generate();
      if (response.status !== "completed" || !response.output_text?.trim()) {
        throw new Error("Provider did not complete the draft.");
      }
    } finally {
      await release();
    }
    await save({ run, response, durationMs: Date.now() - started });
  }
}

export function describeDraft(content, body, targetWords) {
  const bodyWords = countWords(body);
  return {
    contentHash: hash(content), bodyHash: hash(body),
    totalWords: countWords(content), bodyWords, targetWords,
    withinTarget: bodyWords >= targetWords[0] && bodyWords <= targetWords[1],
    paragraphWords: body.split(/\n\s*\n/u).filter((p) => p.trim()).map(countWords),
  };
}

// A local, manually reported observation. This never contacts a detector.
export async function recordDetectorResult({ directory, scope, detector, score, meaning, note = "" }) {
  if (!["full", "body"].includes(scope)) throw new Error("Scope must be full or body.");
  if (!/^(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)$/u.test(score)) {
    throw new Error("Score must be a number from 0 to 100, without a percent sign.");
  }
  if (!["probability", "text-share", "unknown"].includes(meaning)) {
    throw new Error("Score meaning must be probability, text-share, or unknown.");
  }
  let url;
  try { url = new URL(detector); } catch { throw new Error("Supply the detector's HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Use a detector HTTPS URL without credentials, query, or fragment.");
  }
  if (note.length > 2000) throw new Error("Keep the optional observation note under 2,000 characters.");
  const filename = scope === "full" ? "draft.txt" : "body.txt";
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  const content = await readFile(join(directory, filename), "utf8");
  const contentHash = hash(content);
  if (contentHash !== manifest[scope === "full" ? "contentHash" : "bodyHash"]) {
    throw new Error("The text changed after generation. Record the edited text as a separate experiment.");
  }
  const observation = {
    recordedAt: new Date().toISOString(), source: "manual-unverified",
    detector: url.href, score: Number(score), meaning, scope, filename,
    contentHash, words: countWords(content), note,
  };
  await appendFile(join(directory, "detector-observations.jsonl"), JSON.stringify(observation) + "\n", { mode: 0o600 });
  return observation;
}
