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

## Add-ons
- **Scope**: the add-on spec caps add-ons at two. Built A (calculators), B (email check) and, at the user's explicit request, C (ScamSOS). D (extension) is not built.
- **Gate**: the spec says to start add-ons only after deploy, eval table and demo cache are green. Those weren't yet when these were built (at the user's request). Both are behind flags that default off; turn them off in the demo if they aren't fully verified.
- **Calculators**: `principal` is required for `compound_growth` (enter 0 as your assumption if starting from nothing). Contributions are end-of-month. `fee_drag` starts from zero. Bounds: rates -99..1000 %, years <= 100, months <= 1200, money <= 1e12; anything outside is rejected.
- **Calculator extraction**: only fields the text states are kept; unknown model output is dropped. The "assumption" recompute endpoint (`POST /api/calculate`) is stateless and deterministic.
- **Email**: `mailparser` decodes MIME parts (including attachment bytes) into memory, but attachment contents are never inspected, saved or returned. Nothing from the email is persisted except the redacted body that goes through the normal claim check (anonymous checks are deleted after 7 days). The raw file, headers and addresses are returned to the uploader only.
- **Redaction**: emails, SSN-like, IPv4/IPv6, phone numbers (9+ digits or a `+`/parentheses), and any 8+ digit run. 7-8 digit local numbers and dates are left alone to avoid destroying claim text.
- **Email labels**: "Several warning signs" (any high, or 3+ warn), "Some warning signs" (1-2 warn), otherwise "No strong warning signs found in this file". The words "safe" and "legitimate" never appear in output (tested). The no-signs label is deliberately not green in the UI.
- **Brand lists**: `brandDomains.json` ships empty (the team fills it), so brand-mismatch and look-alike-of-brand signals are inactive until it's populated. Link-text mismatch, shorteners, IP URLs, punycode and mixed-script checks work without it.

## ScamSOS
- **Sources verified on 2026-10-24** by fetching and reading the pages: FTC "What To Do if You Were Scammed" (payment-method steps, passwords, remote access, keeping receipts and gift cards, reporting), FTC "How To Avoid a Scam" (resist pressure, talk to someone you trust, don't click links in unexpected messages, payment types scammers insist on), FTC "Credit Freezes and Fraud Alerts", ReportFraud.ftc.gov (referenced by the FTC pages), and the FBI's IC3. Re-check before presenting. `annualcreditreport.com` returned a 403 and `identitytheft.gov` returned only a title, so neither is used.
- **Wording follows the sources.** The FTC "what to do" page does not say to stop contacting the sender or avoid clicking links; those two steps cite "How To Avoid a Scam" instead and are worded to match it ("Stop sending money or information", "talk to someone you trust").
- **No promises**: no refund rights, deadlines or recovery claims. The validator rejects words like refund, recover, guarantee and "within N days"; steps say "ask whether it can be reversed".
- **Bank step is not universal.** The spec lists "contact your bank" as always applying. It is dropped for someone who only clicked a link or is just worried, so the first step for them is closing the page or pausing contact.
- **"When did it happen?"** only appears in the case summary; it does not change the steps.
- **Distress**: an optional checkbox shows a supportive message encouraging a trusted person and local emergency services if in immediate danger. No hotline numbers are hard-coded.
- **Model use**: only the static playbook step text is sent for rewording (never the user's answers). Best-effort with an 8 s timeout; on any failure or invalid output the original rule text is shown.
- **Findings from the first real run**: a company's own site (for example apple.com) is Tier 3 unless it is an `investor.` or `ir.` host, so a claim that only the company's newsroom confirms ends as "can't confirm". Add trusted company domains to `sourceTiers.json` if you want them treated as primary sources.

## Market briefing (add-on E, user request)
- **Boundary**: the user asked for "a normal financial advisor" with market data and a verdict on predictions. Built: sourced market context plus a factor balance. Not built: buy/sell/hold recommendations, price targets of our own, probabilities, or anything personalised. Reasons: the project's rule 2 (no personalised advice) and that automated individual recommendations would amount to unlicensed investment advice.
- **Data source**: Gemini on Vertex with Google Search grounding. No market-data API key, so quotes are whatever sources report and may be delayed. A real feed (Finnhub, Polygon, Alpha Vantage, etc.) could replace the snapshot later.
- **Two model calls**: (1) grounded research returns text plus the sources Google linked to each sentence; we insert [S#] markers at those byte offsets. (2) a structuring call turns the notes into JSON with `sourceIds`.
- **What code enforces**: an item survives only if (a) it cites a known source, (b) the sentences Google linked to that source share at least two meaningful words with the item (catches misattribution, which the first live run showed), (c) every multi-digit number in it appears in the retrieved text, and (d) it contains no advice phrasing. Dropped items are counted and shown.
- **Factor balance**: each driver counts with the weight of its best cited source (tier weights from `thresholds.json`), each source domain once per side, Tier 3 capped at 1.0 per side, `mixed` adds half to each side. Needs total weight >= 3 to say anything and a 2:1 ratio to "lean" (`thresholds.json` -> `outlook`). Direction only: the headline says it says nothing about how far or how fast.
- **Tier list additions** for market sources: Tier 1 nasdaq.com, nyse.com, cmegroup.com, cboe.com, spglobal.com; Tier 2 factset.com, morningstar.com, kiplinger.com, businessinsider.com, finance.yahoo.com. These also affect ordinary claim checks. Remove them in `sourceTiers.json` to be stricter.
- **Analyst ratings** are shown as reported ("consensus Buy") under a "Not our view, and not a recommendation" heading. Remove that section if the team thinks it reads as advice.
- **Performance and cost**: about 30-45 s and two model calls per briefing; results are cached in memory for 10 minutes per query; 5 briefings per minute per IP. Queries are never logged.
- **Hand-off from a claim** uses sessionStorage, not the URL, so claim text never lands in browser history.

## Live data tools (user request)
- **Why**: web search snippets are second-hand. For prices, company events and macro figures, primary data is better.
- **How**: Gemini function calling picks tools for each checkable claim (max 3, `toolConfig` AUTO, thinking off). Code validates every call against an allow-list and argument schemas, builds the request URLs itself, and turns results into evidence with code-formatted text. The model never sees API keys and never makes a request.
- **Verdicts unchanged**: tool evidence is classified by the same stance step and weighed by the same verdict engine. Tiers: FRED (stlouisfed.org) and SEC (sec.gov) Tier 1, Finnhub and CoinGecko Tier 2 as market data feeds.
- **FRED** uses the public "Download CSV" link (no key), limited to the last two years.
- **Not used**: Stooq (free quotes) is behind a JavaScript bot challenge, which we do not try to get around.
- **SEC**: the SEC fair-access policy asks automated clients to send a User-Agent naming the app and a contact address. The tool stays off until `SEC_USER_AGENT` is set; filing URLs are built only from validated EDGAR fields.
- **Search preference**: the web search prompt now asks for primary sources and established news organizations first. Code tiering is unchanged and still decides what counts.

## Evidence strength gauge (user request)
- The spec's evidence-strength formula scores refuted claims 0, so a claim clearly contradicted by strong sources showed "Insufficient". The gauge now shows **decisiveness** instead (`decisiveScores` in `thresholds.json`: supported 100, refuted 100, mixed 50, unverifiable 0) plus a direction line (mostly supports / mostly contradicts / mixed / mostly unconfirmed).
- The spec's support score is still computed and stored as `strength` for history and compatibility. Label rules never used it, so labels are unchanged.

## News alerts (user request)
- **Sources**: Google News RSS search (no key) and the SEC EDGAR company 8-K Atom feed (only with `SEC_USER_AGENT`; the SEC rejects undeclared automated clients). Google News RSS is intended for personal, non-commercial use: we show only headline, outlet, time and a link, never article text. GDELT did not respond reliably in testing and Yahoo's per-ticker RSS returned 404, so neither is used.
- **Reliability filter**: the publisher URL in each RSS item is tiered with the same `sourceTiers.json` as claim checks; only Tier 1/2 items are shown. Articles are never fetched.
- **Relevance**: the first live run returned unrelated Yahoo items (e.g. a Nike story for NVDA) and options-quote pages. Each topic now gets 2-5 aliases from one small model call (cached a day; falls back to the topic), the Google query uses those aliases, and a headline must name one of them on a word boundary (short aliases like "Fed" are case-sensitive). Quote-page junk is filtered by pattern.
- **Alerts**: in-app only, while a Verifin tab is open: polling every 3 minutes when the tab is visible, an unread count in the nav, and optional browser notifications (asked only on a click; at most 3 per check). No server-side scheduler, email or SMS. Watchlist and seen items live in localStorage; nothing is stored on the server.
- **Headlines as claims**: extraction now treats a headline's implied assertion as a claim, reads price idioms ("X loses $80,000" = fell below $80,000), and keeps time/amount qualifiers attached instead of splitting them into fragments.
