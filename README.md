# TrustCheck

Does this money claim hold up? Paste a post, transcript or article link. TrustCheck splits it into claims, checks each against tiered sources, runs the arithmetic itself, and shows an evidence trail. It judges the support for a claim. It never tells you what to do with your money. *Evidence check only. Not financial advice.*

HackPSU Fall 2026, FNB Challenge. **AI reads and explains; deterministic code decides.**

## Architecture

```
input -> fetchUrl* -> extractClaims (Gemini) -> mathCheck (code) -> retrieveEvidence (Gemini + Google Search; Tavily/Brave opt-in)
      -> tierSources (code lookup) -> classifyStance (Gemini) -> decideVerdict (code)
      -> hypeFlags (code) -> aggregate (code) -> writeExplanations (Gemini + advice lint) -> result
```
Progress streams to the UI over SSE. Code enforces: Tier 3 can't decide a verdict, forecasts/opinions are `not_checkable`, quotes must be verbatim, cited evidence ids must exist, explanations are linted for advice.

## Setup
```bash
cp .env.example .env     # set GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GEMINI_MODEL
gcloud auth application-default login   # Vertex AI credentials (ADC); search uses the same ones
npm install
npm run dev:server       # :8787
npm run dev:client       # :5173 (proxies /api)
```
Optional: `DATABASE_URL` (Postgres; e.g. `createdb trustcheck_dev` then `DATABASE_URL=postgresql://localhost:5432/trustcheck_dev`; tables are created on boot), `BRAVE_API_KEY`, Auth0 (`AUTH0_DOMAIN`, `AUTH0_AUDIENCE` on the server; `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` in `client/.env`).

## Add-ons (feature flags, default off)
- `FEATURE_CALCULATORS=true`: "What this implies" cards for savings, fee, interest and loan claims (`server/src/pipeline/calculators.ts`). Runs only on numbers the text states; missing numbers are requested as a clearly labelled assumption. Never changes a verdict.
- `FEATURE_EMAIL_CHECK=true`: upload a `.eml` file at `#/email` for code-computed warning signs plus a claim check of the redacted body (`server/src/addons/emailCheck/`). Files are processed in memory; attachments and links are never opened or visited. Fill `server/src/config/brandDomains.json` to enable brand-impersonation and look-alike checks.
- `FEATURE_SCAMSOS=true`: "I think I was scammed" at `#/scamsos`. Five questions, then a calm three-tier plan (now / today / this week) and a copyable case summary. A rules file (`server/src/config/playbook.json`) decides the steps; the model may only reword them, and a guard rejects rewordings that add links, numbers or promises. Every step links to a verified official page or tells the user to use the number on their card or official app. Run `npm run check:playbook -w server` (also part of `npm run build`) after editing the playbook. Nothing is stored.
- Not built: the browser extension (add-on D).

## Test, eval, demo
- `npm test` unit tests (tiers, math, verdicts, aggregation, validators, SSRF)
- `npm run eval` runs `eval/claims.json` (fill with real claims, see `eval/README.md`)
- `npm run demo:warm` pre-runs `eval/demo.json` into the demo cache
- `npm run check:cli -w server -- "claim text"` one-off check

Tuning lives in `server/src/config/*.json`. Assumptions: `docs/ASSUMPTIONS.md`.

## Built with
[Node.js](https://nodejs.org), [Express](https://expressjs.com), [Helmet](https://helmetjs.github.io), [cors](https://github.com/expressjs/cors), [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit), [undici](https://github.com/nodejs/undici), [zod](https://zod.dev), [pg](https://node-postgres.com), [jose](https://github.com/panva/jose), [google-auth-library](https://github.com/googleapis/google-auth-library-nodejs), [mailparser](https://nodemailer.com/extras/mailparser/), [multer](https://github.com/expressjs/multer), [dotenv](https://github.com/motdotla/dotenv), [tsx](https://tsx.is), [Vitest](https://vitest.dev), [TypeScript](https://www.typescriptlang.org), [React](https://react.dev), [Vite](https://vitejs.dev), [Tailwind CSS](https://tailwindcss.com), [Auth0 React SDK](https://github.com/auth0/auth0-react). Services: Gemini on Google Cloud Vertex AI (incl. Google Search grounding), Tavily (optional), Brave Search (optional), Auth0.

## Limits
Informational only. Search and sources can be wrong or incomplete.
