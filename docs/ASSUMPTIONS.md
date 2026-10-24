# Assumptions

- **investor./ir. subdomains**: the spec says "of the claimed company". We can't know the company at tier time, so any `investor.*`, `investors.*` or `ir.*` host with 3+ labels is Tier 1. Edit `server/src/config/sourceTiers.json` to change.
- **Central claims**: label rules refer to importance-3 claims. If no checkable claim has importance 3, the highest checkable importance is used so a refuted lower-importance claim isn't ignored.
- **Source weights**: each domain counts once per side (supports/contradicts); Tier 3 is capped at 1.0 per side.
- **Quote failure**: if a model quote isn't verbatim, it is dropped; the stance is kept only if the stance reason shares 2+ substantial words with the snippet, else the source becomes `irrelevant`.
- **Stance/citation failure** after retries: all of that claim's evidence is treated as irrelevant, so the claim is `unverifiable`.
- **Search**: default provider is Gemini on Vertex AI with Google Search grounding (same credentials). Its "snippet" for a source is the grounded statement(s) that cite it, i.e. model-written text tied to that source, not the page's raw text; quotes are verified against that text. Tavily/Brave are opt-in via `SEARCH_PROVIDERS`. Google redirect links are resolved to publisher URLs; if that fails the chunk title (a domain) is used.
- **Secondary search (opt-in)**: Brave Search (`BRAVE_API_KEY`). Demo cache serves whole pre-warmed results for exact (normalized) input text.
- **Storage**: with no `DATABASE_URL` an in-memory store is used (lost on restart). Postgres tables are created on boot.
- **Auth**: `GET /api/check/:id` is open for anonymous checks (unguessable UUID); checks owned by a user are visible only to that user. The client streams SSE via `fetch` so the Authorization header can be sent.
- **Eval/demo files** are empty on purpose: the team must supply real claims (no fabricated outcomes).
- **Vertex AI**: all Gemini calls (claim extraction, stance, explanations, grounded search) go to Vertex AI `generateContent` with ADC credentials; there is no API key. Requires `GOOGLE_CLOUD_PROJECT`, `GEMINI_MODEL`, optional `GOOGLE_CLOUD_LOCATION` (default `us-central1`; `global` supported). The credential needs the Vertex AI User role.
- **Model default**: `GEMINI_MODEL` has no default in code; set it in `.env`.
