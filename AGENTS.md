<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Deployment workflow

The user wants completed application updates deployed by default. After implementing and validating a change, deploy it to the existing production Vercel project and verify that the deployment succeeds. Do not stop at local changes or request deployment approval again unless the action introduces a new risk outside the requested update. Preserve the existing private access settings, and report any deployment blocker clearly.
