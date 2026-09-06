# Private Supabase + Vercel setup

The app now uses Supabase email/password accounts. Create one owner account in the dashboard and disable public signup. The workspace and generation endpoint both verify the user with Supabase, then check the configured account UUID, confirmed email, and exact email address. An account with a matching display name or user metadata cannot grant itself access.

## 1. Create the Supabase project and your account

1. Open [Supabase's project dashboard](https://supabase.com/dashboard) and create a project for this app. Choose your organization, a region near your Vercel deployment, and a strong database password. Save that password in your password manager; the app does not need it.
2. In **Authentication → Sign In / Providers**, enable Email sign-in and turn off **Allow new users to sign up**. Keep anonymous sign-ins off. Leave email confirmation enabled. There is no signup route or signup button in this app, but disabling signup in Supabase is also necessary to close direct API registration.
3. In **Authentication → Users**, choose **Add user → Create new user**. Enter your approved owner email and a unique password directly in Supabase. Confirm this owner account using the dashboard's auto-confirm option. Do not send the password through chat. Copy the new user's **User UID** for `OWNER_USER_ID`.
4. Set **Authentication → URL Configuration → Site URL** to the exact HTTPS production origin shown in your Vercel project (for example, `https://your-project.vercel.app`). This app uses password login, so no Google OAuth callback is needed.
5. Open **SQL Editor** and run the complete file [202609060001_private_usage.sql](../supabase/migrations/202609060001_private_usage.sql). It creates private usage counters and two functions that only the server secret can execute. It does not store coursework.
6. Get the **Project URL**, **publishable key**, and **secret key** from the project's Connect dialog/API key settings. A legacy `service_role` key also works in place of the secret key. The secret key bypasses database row policies and must stay server-only.

If you forget the app password, manage the account through Supabase's user controls. A public password-reset flow is not included. Protect the Supabase and Vercel dashboard accounts with their own two-factor authentication.

## 2. Connect Vercel

In the Vercel project's **Settings → Environment Variables**, add these for Production. The provided `.env.example` contains the same names. Never add `NEXT_PUBLIC_` to these variables. Do not commit secrets or paste them into chat.

| Variable | Value |
| --- | --- |
| `APP_URL` | the exact HTTPS production origin shown in your Vercel project (for example, `https://your-project.vercel.app`) |
| `SUPABASE_URL` | Your project's HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | Project publishable key (or legacy anon key) |
| `SUPABASE_SECRET_KEY` | Project secret key (or legacy service_role key) |
| `OWNER_EMAIL` | The approved owner's email supplied during setup |
| `OWNER_USER_ID` | The precreated owner's User UID, copied from Authentication → Users |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | Set only the providers you use; use a dedicated provider project/key |
| `AI_GENERATION_ENABLED` | `false` until login and database setup are verified |

Use separate project credentials for previews and local development, or keep generation disabled there. For local use, copy `.env.example` to `.env.local`, supply the values, and use `APP_URL=http://localhost:3000`. Local environment files are ignored by Git and are not sent to Vercel automatically.

The production URL is not known yet. You can deploy once without the Supabase settings to obtain it; the app shows the setup lock and cannot generate content. Use the stable production domain from Vercel's project settings, not a temporary preview URL. Then set that same origin in both `APP_URL` and Supabase's Site URL, add the remaining settings, and redeploy.

The project pins `pnpm@10.34.5` in `package.json`. Enable Vercel's Corepack support with `ENABLE_EXPERIMENTAL_COREPACK=1`, leave the Install Command override off, and use the detected Next.js build command (`pnpm run build`). Editing environment variables takes effect on a new deployment. Keep `pnpm-lock.yaml` committed together with `package.json`; Vercel's frozen-lockfile check should stay enabled.

If deployment reports `ERR_PNPM_OUTDATED_LOCKFILE`, the checked-out commit contains a package list and lockfile that disagree. Run `pnpm install` locally with the pinned version, review and commit both files, then deploy that new commit. Retrying an older failed deployment uses the old source and will fail again. Do not use `--no-frozen-lockfile` as the production fix. The npm lockfile is also maintained for npm users; if npm changes dependencies, regenerate the pnpm lockfile with `pnpm import` and verify `pnpm install --frozen-lockfile` before pushing.

## 3. Check access, then enable generation

1. A signed-out visit to `/` must redirect to `/login`. Direct unsigned requests to `/api/generate` must return 401, or 503 when auth configuration is incomplete.
2. Sign in with the precreated account. Confirm the workspace opens and sign-out returns to the login page. Other accounts must be denied, even if they exist in Supabase.
3. Once the SQL migration and server secret are set, enable `AI_GENERATION_ENABLED=true` and redeploy. Generate one short draft. Inspect the usage record in SQL Editor with `select * from private.ai_usage;` to confirm that counts increased.
4. Try **My Thread**: paste the post you actually published, select Student or Professor, paste their reply, then choose Draft Reply. Add earlier conversation when useful. The app drafts text for you to review and copy; it does not post to your school platform.

## Usage protections and limits

Defaults: 5 requests per minute, 20 per hour, 40 per 24 hours, 300 per 30 days, and one active generation. Each window begins with its first counted request. Reservations use a database row lock, so concurrent Vercel instances cannot overspend the same request allowance. A crashed request's lease expires after 90 seconds. Failed provider calls remain counted. Restarting or redeploying the app does not reset counts. Clearing the usage table, changing the owner UUID, or changing Supabase projects does reset them.

Override `AI_REQUESTS_PER_MINUTE`, `AI_REQUESTS_PER_HOUR`, `AI_REQUESTS_PER_DAY`, and `AI_REQUESTS_PER_MONTH` with lower limits if desired. These are request caps, **not an exact dollar budget**. Charges depend on the selected model and token use. Use provider-side project spend controls where supported. Set `AI_GENERATION_ENABLED=false` and redeploy to lock generation; revoke a compromised AI key in its provider dashboard.

Bodies are capped at 512 KB while streaming, with at most three 128 KB TXT/HTML files and 32 KB of combined prompt text. Output is capped at 6,000 tokens for papers/revisions and 2,000 for other formats by default. `AI_MAX_OUTPUT_TOKENS` lowers the overall ceiling; `AI_ALLOWED_MODELS` optionally restricts models. OpenAI automatic retries are disabled. Provider requests time out after 60 seconds; a timed-out request can still incur provider charges. Batch replies stop when authentication, quota, or configuration checks fail.

## Sessions and data

Auth operations run on the server. Session cookies are HttpOnly, Secure on HTTPS, SameSite=Lax, and use an eight-hour browser lifetime renewed when tokens refresh. The page proxy refreshes cookies, but each protected endpoint independently verifies identity. This is not an absolute eight-hour session timeout. Supabase manages token expiry and refresh sessions. A copied access token can remain usable until it expires; sign-out revokes the current refresh session and clears its browser cookie. Removing/changing the configured owner or disabling generation provides an additional app-level lock after redeployment.

Drafts and writing samples remain in this browser's local storage when signing out. Use **Clear all data** on a shared device. Generated Markdown cannot execute raw HTML, and remote images are disabled. The application does not log provider errors containing submitted text or credentials. Auth service outages deny access; quota database outages deny generation.

## Development verification

Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm lint`, and `pnpm build`. Tests exercise real application handlers with simulated Supabase/Auth and AI responses, plus the real SQL migration in an embedded PostgreSQL runtime. The database checks cover all quota windows, lease expiry, competing reservations, and permissions for anonymous, authenticated, and service roles. These tests do not validate a live Supabase project's settings, Vercel environment, or real AI outputs. Complete the live checks above before relying on the deployment.

Primary references: [Vercel package managers](https://vercel.com/docs/package-managers), [Vercel Corepack setup](https://vercel.com/docs/builds/configure-a-build#corepack), [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [database functions](https://supabase.com/docs/guides/database/functions), [Next.js security release](https://nextjs.org/blog/august-2026-security-release).
