import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectSamples, describeDraft, recordDetectorResult } from "../scripts/lib/evaluation-records.mjs";

test("repeated evaluation releases each lease and saves every sample in sequence", async () => {
  const events = [];
  let call = 0;
  await collectSamples({ runs: 3,
    reserve: async () => { events.push("reserve"); return async () => { events.push("release"); }; },
    generate: async () => { events.push("generate"); return { status: "completed", output_text: `draft ${++call}` }; },
    save: async ({ run, response }) => { events.push(`save ${run}`); assert.equal(response.output_text, `draft ${run}`); },
  });
  assert.deepEqual(events, ["reserve", "generate", "release", "save 1", "reserve", "generate", "release", "save 2", "reserve", "generate", "release", "save 3"]);
});

test("a failed or incomplete paid request stops the experiment and still releases its lease", async () => {
  for (const failure of ["throw", "incomplete", "empty"]) {
    const saved = [];
    let calls = 0;
    let releases = 0;
    await assert.rejects(collectSamples({ runs: 3,
      reserve: async () => async () => { releases++; },
      generate: async () => {
        if (++calls === 1) return { status: "completed", output_text: "keep this draft" };
        if (failure === "throw") throw new Error("provider failure");
        return { status: failure === "incomplete" ? "incomplete" : "completed", output_text: " " };
      },
      save: async ({ run }) => { saved.push(run); },
    }));
    assert.equal(calls, 2);
    assert.equal(releases, 2);
    assert.deepEqual(saved, [1]);
  }
});

test("quota refusal and artifact-write failure cannot trigger another paid call", async () => {
  let calls = 0;
  let releases = 0;
  const generate = async () => { calls++; return { status: "completed", output_text: "draft" }; };
  await assert.rejects(collectSamples({ runs: 3, generate,
    reserve: async () => { throw new Error("quota exhausted"); }, save: async () => {},
  }));
  assert.equal(calls, 0);
  await assert.rejects(collectSamples({ runs: 3, generate,
    reserve: async () => async () => { releases++; }, save: async () => { throw new Error("disk full"); },
  }));
  assert.equal(calls, 1);
  assert.equal(releases, 1);
});

test("detector observations retain repeated scores for exact full/body text and reject changed artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "school-evaluation-test-"));
  try {
    const body = "A source supports this point.\n\nA separate paragraph qualifies it.";
    const full = `${body}\n\nReferences\nA source. (2025). Report.`;
    const metrics = describeDraft(full, body, [10, 15]);
    await writeFile(join(directory, "manifest.json"), JSON.stringify(metrics));
    await writeFile(join(directory, "draft.txt"), full);
    await writeFile(join(directory, "body.txt"), body);
    assert.equal(metrics.bodyWords, 10);
    assert.equal(metrics.totalWords, 15);
    assert.equal(metrics.withinTarget, true);
    assert.notEqual(metrics.contentHash, metrics.bodyHash);
    const options = { directory, scope: "full", detector: "https://example.com/detector", score: "50", meaning: "unknown" };
    const first = await recordDetectorResult(options);
    const second = await recordDetectorResult({ ...options, score: "0" });
    const third = await recordDetectorResult({ ...options, scope: "body", score: "16.6" });
    assert.equal(first.contentHash, second.contentHash);
    assert.equal(third.contentHash, metrics.bodyHash);
    assert.equal(first.source, "manual-unverified");
    const records = (await readFile(join(directory, "detector-observations.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(records.map((r) => r.score), [50, 0, 16.6]);
    for (const score of ["", " ", "NaN", "-1", "101", "0x10"]) {
      await assert.rejects(recordDetectorResult({ ...options, score }), /Score must/);
    }
    await assert.rejects(recordDetectorResult({ ...options, detector: "https://example.com/?token=secret" }), /without credentials/);
    await writeFile(join(directory, "draft.txt"), full + " edited");
    await assert.rejects(recordDetectorResult(options), /text changed/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("dry-run prepares identical repeated inputs and invalid run counts fail before generation", () => {
  const cli = new URL("../scripts/evaluate-writing.mjs", import.meta.url).pathname;
  const result = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", cli, "booking", "--runs", "3", "--dry-run"], { encoding: "utf8" }));
  assert.equal(result.dryRun, true);
  assert.equal(result.plannedRequests, 3);
  assert.equal(result.request.model, "gpt-5.2");
  assert.equal(result.request.store, false);
  assert.match(result.request.input[1].content, /Alder College/);
  assert.doesNotMatch(result.request.input[0].content, /Alder College|120 camera-kit/);
  for (const args of [["--runs", "0"], ["--runs", "6"], ["--runs"], ["--dry-run", "--runs", "3", "--runs", "2"]]) {
    assert.throws(() => execFileSync(process.execPath, [cli, ...args], { stdio: "pipe" }), /Command failed/);
  }
});
