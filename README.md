This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Private access and replies

The workspace and AI endpoint require a precreated Supabase email/password account matching the owner's email and user ID. Disable public signup in Supabase. Generation also requires the protected Supabase usage functions and an explicit enable switch; missing configuration keeps generation locked. Follow the [private Vercel deployment guide](docs/private-deployment.md) before deploying.

Use **My Thread** to reply to a student or professor under your own discussion post. Add your original post, choose who replied, paste their message, and optionally include earlier replies. New discussion drafts are copied into the original-post field automatically; replace this with the version you actually posted when needed.

## Writing voice and quality

Use **Your Writing Voice** to choose a tone and optionally paste a short sample of your own writing. These settings apply to drafts, revisions, and batch replies. Add your perspective and relevant source excerpts in Additional Context. Upload TXT or HTML files; paste text from PDF or Word documents.

**Refine Writing** edits for clarity and flow while preserving the draft's meaning and restoring its reference list unchanged. See the [writing quality review guide](docs/writing-quality.md) for repeatable examples and validation steps. The app does not guarantee detector scores.

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
