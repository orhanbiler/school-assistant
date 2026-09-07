This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Private access and replies

The workspace and AI endpoint require a precreated Supabase email/password account matching the owner's email and user ID. Disable public signup in Supabase. Generation also requires the protected Supabase usage functions and an explicit enable switch; missing configuration keeps generation locked. Follow the [private Vercel deployment guide](docs/private-deployment.md) before deploying.

Use **My Thread** to reply to a student or professor under your own discussion post. Add your original post, choose who replied, paste their message, and optionally include earlier replies. New discussion drafts are copied into the original-post field automatically; replace this with the version you actually posted when needed.

## Writing voice and quality

Use **Your Voice & Ideas** to choose a tone, add your main point in **What I want to say**, and optionally paste a short sample of your own writing. These settings apply to drafts, revisions, and batch replies. Add relevant source excerpts in Additional Context. Upload PDF, Word (.docx), TXT, or HTML files. PDF and Word documents are read on your device; review the text and choose relevant PDF pages before adding it. Only the selected text is saved and sent for generation. PDFs and Word files can be up to 25 MB; scanned PDFs need text recognition first, and older .doc files must be saved as .docx.

In **Course Materials**, choose the week before adding files. **Take photo** opens the phone's camera picker where supported; **Choose photos** accepts textbook page images and screenshots. Preview or rotate the photo, tap **Read text from photo**, correct the transcription, then save it with its week, optional source link, notes, and publication details. Photo reading sends a resized JPEG to OpenAI and uses one shared AI request. The app saves the reviewed text rather than the image. PDFs and Word documents continue to be read on your device. For scanned PDFs, choose a photo or screenshot of the relevant page.

Keep up to 30 materials on this device and select up to three with **Use in this draft**. Filter the library by week without losing other materials. Older saved materials appear under Week 1 and remain selected. Open **Week, source link & notes** to change a material's week (1–52), add its link or context, and supply a known publication title, author, and year. **Review or edit saved text** lets you correct a photo transcription or change an excerpt later. These details accompany selected materials when generating; links are not fetched. See [Photo and weekly materials](docs/photo-materials.md) for limits and verification. Materials and drafts do not automatically sync between your phone and computer.

In **Paper**, use **Specific community, case, or issue** for the setting and problem selected in an earlier assignment. Paste the full directions under **Assignment requirements**. **Paraphrases only** is on by default for new papers and stays with that draft during AI edits and restoration. The draft review flags common quotation marks and general case references for your attention; it does not verify paraphrasing, source accuracy, or AI authorship. **Download TXT** saves plain text. If the assignment requires Word, format and save the essay as a Word document before submitting.

Use **My draft → Edit** to change the writing yourself. Your edits save on this device. **Light edit with AI** accepts editing instructions, and **Restore previous draft** recovers the version before the last generation or revision. On phones, use Materials, Write, and My draft to move around the workspace. The header offers home-screen installation, and supported browsers can share the current draft through the device's share sheet. AI generation still requires an internet connection and private sign-in; the app does not cache private pages for offline access.

All generation modes use guidance that starts with the actual issue, develops concrete reasoning, and reviews the draft for generic wording and repetitive paragraph structure. Your writing sample guides the voice without supplying facts for a different topic.

Under **My draft → Editing approach**, choose **Light edit** for small changes or **Rewrite for natural flow** to reorganize repetitive paragraphs and recast formulaic passages. Both approaches preserve the argument and citations through model instructions and restore the original reference list unchanged in code. Each edit uses one generation, with the previous draft available to restore. See the [writing quality review guide](docs/writing-quality.md) for repeatable examples and validation steps. The app does not guarantee detector scores.

The draft review also highlights repeated paragraph lead-ins with concrete examples to consider while editing. It is an advisory style check, not an AI detector. See [Live writing evaluation](docs/writing-evaluation.md) for measured experiments and the protected test command.

For repeatable local comparisons, the evaluation command supports `booking --runs 3` and an offline `--dry-run`. It saves exact prompts, returned GPT-5.2 settings, full/body text hashes, and length checks. Detector results can be logged manually against those files without sending text from the script. See the [detector investigation](docs/detector-investigation.md) for the initial three-run findings and remaining questions.

## Getting Started

Use the pinned pnpm version from `package.json` (10.34.5). Complete the private setup above and configure `.env.local`, then run:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Commit `package.json` and `pnpm-lock.yaml` together after dependency changes. If you use npm to update dependencies, run `pnpm import` and verify a frozen pnpm install before deploying, because Vercel detects the pnpm lockfile.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
