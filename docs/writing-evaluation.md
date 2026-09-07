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
```

Each invocation makes **one paid GPT-5.2 request**. It honors the generation enable switch, model allowlist, output cap, timeout, and shared Supabase quota. It releases the active lease even when the provider fails. No call retries automatically, and nothing is sent to a detector by this script.

The script prints a new temporary directory containing the generated draft, exact input prompts, and a manifest with the fixture, model, date, body word count, and content/prompt hashes. These files contain only synthetic classroom material. Credentials and raw provider errors are not written to them. Run the same case against each candidate version; retain all outputs rather than choosing only a favorable result. Compare required answers, source fidelity, clarity, length, and voice before deciding whether to ship a change. Any third-party score is a separate observation, not a guaranteed outcome.

## Production changes

The draft review now highlights repeated paragraph lead-ins, such as “One challenge” followed by “A second challenge,” with up to three short examples. This is an advisory style check and does not modify the draft, call another model, or estimate authorship. Assignment-required structure may be appropriate. It excludes the reference list and updates with manual edits.

Successful empty responses from the usage-release function are now accepted. Previously, parsing these responses as JSON could incorrectly log a release failure even when the database had already released the lease. Reservation validation and usage caps remain enforced.
