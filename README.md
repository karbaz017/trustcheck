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
Optional: `DATABASE_URL` (Postgres), `BRAVE_API_KEY`, Auth0 (`AUTH0_DOMAIN`, `AUTH0_AUDIENCE` on the server; `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` in `client/.env`).

## Test, eval, demo
- `npm test` unit tests (tiers, math, verdicts, aggregation, validators, SSRF)
- `npm run eval` runs `eval/claims.json` (fill with real claims, see `eval/README.md`)
- `npm run demo:warm` pre-runs `eval/demo.json` into the demo cache
- `npm run check:cli -w server -- "claim text"` one-off check

Tuning lives in `server/src/config/*.json`. Assumptions: `docs/ASSUMPTIONS.md`.

## Built with
[Node.js](https://nodejs.org), [Express](https://expressjs.com), [Helmet](https://helmetjs.github.io), [cors](https://github.com/expressjs/cors), [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit), [undici](https://github.com/nodejs/undici), [zod](https://zod.dev), [pg](https://node-postgres.com), [jose](https://github.com/panva/jose), [google-auth-library](https://github.com/googleapis/google-auth-library-nodejs), [dotenv](https://github.com/motdotla/dotenv), [tsx](https://tsx.is), [Vitest](https://vitest.dev), [TypeScript](https://www.typescriptlang.org), [React](https://react.dev), [Vite](https://vitejs.dev), [Tailwind CSS](https://tailwindcss.com), [Auth0 React SDK](https://github.com/auth0/auth0-react). Services: Gemini on Google Cloud Vertex AI (incl. Google Search grounding), Tavily (optional), Brave Search (optional), Auth0.

## Limits
Informational only. Search and sources can be wrong or incomplete.
