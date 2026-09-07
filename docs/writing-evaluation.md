# Live writing evaluation

## September 2026 findings

GPT-5.2 was tested on fictional library assignments with fixed source material and writer notes. A separate editorial request, a shorter drafting prompt, and a low-reasoning variant were explored. These changes did not establish a reliable improvement and were excluded from production. The deployed prompts, selected model, and one-call generation workflow are retained.

These results were observed in the public ZeroGPT interface for the same short-reply assignment. Whole outputs were submitted, including a reference section when one was generated.

| Variation | Total output words | ZeroGPT result |
| --- | ---: | ---: |
| Existing drafting prompt | 140 | 16.6% |
| Separate edit of that reply | 162 | 39.9% |
| Shorter drafting prompt, new reply | 158 | 29.2% |

The existing prompt's separate essay sample received 39%. No verified comparison score was recorded for its edited version. The essay samples also demonstrated that prompt instructions alone do not ensure compliance with requested word counts. Several passages needed review for inferences that the fictional source did not support.

This was exploratory testing, with one sample per variation, not a representative benchmark. It was not a test of the user's Cheverly essay, and these figures must not be advertised as expected production scores. The variations also differ in length and wording. An added edit can raise a detector's score; neither a passing software test nor a low detector score establishes accurate sourcing or good writing.

## Repeating a controlled test

Run one of these commands with Node 22.18+ and the project's configured private environment:

```bash
node --experimental-strip-types scripts/evaluate-writing.mjs paper
node --experimental-strip-types scripts/evaluate-writing.mjs reply
node --experimental-strip-types scripts/evaluate-writing.mjs booking --runs 3
```

Each invocation makes **one paid GPT-5.2 request by default**. `--runs 1..5` runs that many identical requests sequentially, stopping on the first failure. It honors the generation enable switch, model allowlist, output cap, timeout, and shared Supabase quota. It releases the active lease even when the provider fails. No call retries automatically, and nothing is sent to a detector by this script. `--dry-run` prints the planned request without contacting OpenAI, Supabase, or a detector. These commands require Node 22.18+.

The script prints a new temporary directory containing `request.json`, `input.json`, and `experiment.json` with the fixture and requested run count. Each completed sample has `draft.txt`, `body.txt` (without the reference section), and `manifest.json` with exact content/input hashes, returned model snapshot, returned settings, token use, date, and word counts. Multiple runs use `run-01`, `run-02`, etc.; a single run keeps its draft and manifest at the top level. Word counts use whitespace-separated tokens and include any Markdown syntax. The manifest marks whether body length meets the fixture's requested range; this is not a writing-quality or authorship score. Failed runs preserve earlier completed samples and mark the experiment stopped.

These files contain only synthetic classroom material. Credentials and raw provider errors are not written to them. Temporary directories can be removed by the OS; copy an experiment to `output/writing-evaluations/` to keep it locally (that directory is ignored by Git). Schema version 2 hashes serialized message arrays for `promptHash` and the complete request for `requestHash`; these hashes are not directly comparable with the old script's concatenated-prompt hash.

The `booking` fixture uses a media-lab assignment absent from the system prompt's library and garden examples. The older library fixtures overlap with those examples, including their numerical facts, so they do not provide an independent topic for assessing transfer. Retain all outputs rather than selecting only favorable results. Compare required answers, source fidelity, clarity, length, and voice before deciding whether to ship a change. Any third-party score is a separate observation, not a guaranteed outcome.

## Recording detector results

Test exactly one saved file, unchanged, then log the displayed percentage locally:

```bash
node scripts/record-detector-result.mjs RUN_DIRECTORY full DETECTOR_HTTPS_URL SCORE unknown "Test time, product version/mode, displayed label, and highlights"
```

Replace the uppercase placeholders with the actual run directory, detector URL, and displayed number without `%`. Use `full` for `draft.txt` or `body` for `body.txt`. Use `probability` or `text-share` instead of `unknown` only when the vendor documents that interpretation. Do not turn an asterisk, an error, or an unsupported-length result into a numerical zero.

The command appends to `detector-observations.jsonl`, preserving each observation with the file's SHA-256 hash, scope, word count, and recording time. It rejects edited draft files so a score cannot silently attach to an earlier version. Records are explicitly marked `manual-unverified`: the tool cannot prove what was pasted into the website or that a reported score is authentic. It never opens the website or transmits the draft. Avoid private report links containing credentials or access tokens.

See [the September 7 investigation](detector-investigation.md) for the measured baseline, interpretation limits, and the next controlled comparisons.

## Production changes

The draft review now highlights repeated paragraph lead-ins, such as “One challenge” followed by “A second challenge,” with up to three short examples. This is an advisory style check and does not modify the draft, call another model, or estimate authorship. Assignment-required structure may be appropriate. It excludes the reference list and updates with manual edits.

Successful empty responses from the usage-release function are now accepted. Previously, parsing these responses as JSON could incorrectly log a release failure even when the database had already released the lease. Reservation validation and usage caps remain enforced.
