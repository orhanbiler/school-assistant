# Detector score investigation — September 7, 2026

The local app is available at `http://localhost:3000` while its development server is running. It was started with `APP_URL=http://localhost:3000` and bound to `127.0.0.1`; existing private sign-in and usage limits remain active. The login page returned HTTP 200, `/` redirected to `/login`, and an unsigned generation request was denied. No browser was connected for an authenticated UI check or new detector submissions.

## What is established

The app makes a fresh GPT-5.2 Responses API request for each generation or AI revision. It passes the writing sample and notes as request context; it does not update model weights or save a fine-tuned model. The production request leaves reasoning and sampling parameters to provider defaults. The three measured responses below returned `reasoning.effort: none`, `temperature: 1`, `top_p: 0.98`, and medium verbosity. These are observed settings for these responses, not a promise that provider defaults will never change.

[OpenAI's GPT-5.2 model documentation](https://developers.openai.com/api/docs/models/gpt-5.2) lists fine-tuning as unsupported. Work on this model therefore involves prompt/example changes and evaluations. [Its parameter guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2) allows temperature and top-p only with reasoning effort `none`. Changing those settings would be another experiment, not evidence that detector scores improve.

The existing benchmark uses the same library facts as a system-prompt example. Previous experiments also used one sample per variation. Neither setup isolates whether an apparent improvement persists across new topics and repeated generations.

The app's Copy button copies the entire raw draft, including Markdown and references. Selecting text from the rendered preview or copying only paragraphs can produce a different detector input. That is a possible confound to check, not a confirmed explanation of the user's scores.

## New baseline: same request, three outputs

Command:

```bash
node --experimental-strip-types scripts/evaluate-writing.mjs booking --runs 3
```

The fictional Alder College media-lab assignment asks for 500–600 body words, a comparison of cancellation and reminders, an access concern, an implementation challenge, and an evaluation proposal. It supplies fixed notes and one fictional source. This topic is not in the system-prompt examples. No writing sample was supplied. These are synthetic tests, not the user's scored drafts.

| Run | Body words | Full draft words | Body paragraph lengths | Meets requested length | Detector result |
| --- | ---: | ---: | --- | --- | --- |
| 1 | 677 | 689 | 114, 149, 139, 100, 175 | No | Not measured |
| 2 | 735 | 748 | 121, 121, 138, 117, 93, 145 | No | Not measured |
| 3 | 631 | 644 | 118, 135, 109, 113, 156 | No | Not measured |

Counts split on whitespace, exclude the reference section for body counts, and retain Markdown. All three requests have SHA-256 `45d44d065e2230ac7a374efdf97f2727514db31a882d4fa7560b3a5e068b6cd0`. All returned `gpt-5.2-2025-12-11`, with different output hashes. All three paid requests completed through the shared quota. There were no retries or additional editorial calls.

Artifacts are saved locally under `output/writing-evaluations/2026-09-07-booking-baseline/` (ignored by Git). Each run preserves the full and body text plus its manifest; the experiment root contains the exact request. The original temporary directory was `/tmp/school-writing-eval-booking-Y0P76f`.

This establishes output variability with the same request and a length failure in every sampled output. It does not establish a population failure rate or explain any detector score.

## Manual content review

All three drafts address the requested policy comparison, access concern, implementation, and evaluation, retaining the core counts of 120 reservations, 18 late collections, and nine walk-in requests. Each includes the supplied fictional reference.

There are source-fidelity concerns despite those correct counts:

- Run 1 places the source citation after proposed evaluation measures. The measures are described as proposals, but citation placement could imply that the source recommends them.
- Run 2 opens by asserting that other students were turned away. The source records requests while kits remained reserved; it does not record whether requests were refused. Its early statement that a reminder pilot can reduce unused reservations is also stronger than the untested source warrants, though later paragraphs qualify the proposal.
- Run 3 says the access concern is not hypothetical. The source explicitly says disability-related access needs were not assessed. A possible risk should remain distinct from a documented local outcome.

The drafts repeatedly begin with an unused-reservations tension, compare cancellation and reminders, and finish with a pilot evaluation. The assignment partly requires that structure. Dense paragraphs, repeated caveats, and similar openings are editorial observations, not proven detector features. No style observation here is used as an authorship score.

## How to interpret 50% versus 0%

The detector and the exact tested input are essential. [GPTZero describes its percentage as a probability](https://support.gptzero.me/articles/7549392421-how-do-i-interpret-results-from-gptzero-s-advanced-sentence-scanning) and says its prediction depends on document-wide patterns. [Turnitin describes its percentage as a portion of qualifying prose](https://guides.turnitin.com/hc/en-us/articles/22774058814093-Using-the-AI-Writing-Report), documents possible misclassification, and requires at least 300 prose words. These are different measurements. A 0% result is not proof of human authorship. Do not equate GPTZero with the separately named ZeroGPT used in the earlier exploratory tests.

If different generated versions were tested, their different wording and length could contribute to different predictions. If the exact same file received both scores on the same service, generation randomness cannot explain that change; first check detector mode/version, full text versus body, input truncation, formatting, and timestamps. A repeated result may also be cached and is not automatically an independent measurement.

## Next comparison once the user's examples are available

1. Preserve the actual 50% and 0% texts, their prompts, editing history, detector name/URL, displayed score label, and test dates. Record whether references and headings were included. Keep the user's originals unchanged.
2. Submit one unchanged text repeatedly to the same detector and mode; record every result against the same content hash. This examines detector repeatability without regenerating text.
3. Test all three saved baseline outputs under the same conditions. Keep full-draft and body-only results as separate conditions. Record errors or unsupported inputs as such, never as zero.
4. Compare factual support, assignment coverage, word count, and fit to an authentic writing sample before choosing a prompt change. Change one variable at a time and retain all outputs. Reserve other topics for validation.

No production prompt or model setting was changed based on these three samples. The deliverable is a measured baseline and repeatable local tooling. The user's particular score difference remains unresolved until the scored texts and detector details are available.
