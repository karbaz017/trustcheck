# TrustCheck: Devpost submission draft

> Items marked **[TEAM: …]** need a human: team names, links, quotes and results we can't make up.

**Name:** TrustCheck

**Tagline:** Saw a money claim online? See what the evidence says before you act. Evidence, not advice.

**Tracks:** FNB Challenge (Trust, Decisions & Financial Confidence), Best Use of Gemini (MLH), Best Use of Auth0. **[TEAM: confirm which tracks you opted into]**

---

## Inspiration

College students get a lot of money advice from TikTok, Reddit, group chats and AI chatbots, and much of it comes as confident claims: "this stock will double", "I turned $1,000 into $10,000 in 30 days", "it's guaranteed". Checking one properly takes time and know-how most people don't have in the moment. We wanted the step between *information* and *action* to be quick and honest: does this claim actually hold up?

**[TEAM: add 1–2 real quotes from the students you interviewed, with permission]**

## What it does

Paste a post, a transcript or an article link. TrustCheck:

1. **Splits the text into individual claims** and labels each one: a fact, a number, a forecast or an opinion. Forecasts are never called true or false: TrustCheck checks whether any official source or trusted outlet makes the same prediction. An extraordinary prediction nobody reliable makes (like "+100% tomorrow"), or one pushed with "buy now" pressure, is flagged "Doesn't hold up". Opinions are marked "Can't be verified".
2. **Checks each factual claim against sources** found with live Google Search and with **live data tools**: crypto prices (CoinGecko), official economic data from the Federal Reserve (FRED), SEC company filings, and stock quotes (Finnhub, when a key is set).
3. **Ranks sources by reliability.** Tier 1 is official sources (regulators, `.gov`, SEC filings, company investor pages). Tier 2 is established outlets (Reuters, AP, Bloomberg, WSJ, CNBC…) and market data feeds. Tier 3 is everything else, and it can never decide a verdict on its own.
4. **Runs the math itself.** "Doubles every 30 days" becomes a card showing it implies about **4,598× in one year**.
5. **Flags pressure language** like "guaranteed", "risk-free" and "get in now".
6. **Explains the result**: an overall label (Holds up / Needs checking / Doesn't hold up), an evidence-strength gauge with its direction, and a "Why it doesn't hold up" list that names the sources and quotes them.

It **never** tells you to buy, sell or hold. It judges the claim, not your decision.

### Add-ons (each behind a feature flag)
- **What this implies:** calculators for compound growth, fee drag, APR↔APY, loan payments and required returns. They only use numbers the text states; anything missing is asked for and clearly labelled as your assumption.
- **Email check:** upload a suspicious `.eml` file. Code checks for mismatched links, look-alike domains, failed authentication, double-extension attachments and pressure wording, then claim-checks the body. Attachments are never opened and links are never visited. Personal data is removed before any AI sees it.
- **ScamSOS:** "I think I was scammed." Five questions produce a calm Now / Today / This week plan from a rules file where every step links to a verified official page (FTC, FBI IC3), plus a case summary you can copy for your bank. AI may only soften the wording, and a guard rejects any rewording that adds links, numbers or promises.
- **Market briefing:** type a ticker or a prediction like "NVDA will fall in 30 days". You get current figures, what's moving it, bull and bear points, upcoming events and risks, every item cited. A code-computed factor balance shows whether the sourced factors lean toward, against, or are mixed on the prediction. It covers direction only: no price targets, no probabilities, no advice.
- **News alerts:** keep a watchlist. While the app is open it checks every 3 minutes for headlines from reliable outlets only, with optional browser notifications and a "Check this headline" button.
- **Login and history** with Auth0. Anonymous checks work without an account and are deleted after 7 days.

## How we built it

**Core principle: AI reads, code decides.** Gemini extracts claims, classifies how each source relates to a claim, and writes explanations. Deterministic TypeScript does the math, applies source tiers, and produces every verdict, score and label.

Pipeline (each stage streams progress to the UI over Server-Sent Events):

`extract claims (Gemini) → math (code) → search + live data tools (Gemini picks tools, code runs them) → tier sources (lookup) → stance (Gemini) → verdict (code) → hype flags (code) → aggregate (code) → explain (Gemini + lint)`

- **AI:** Gemini 2.5 Flash on **Google Cloud Vertex AI**, using structured JSON output with schemas, **Google Search grounding** for retrieval, and **function calling** for the live data tools. The model only picks from an allow-list of tools; code validates the arguments and makes every request.
- **Guardrails enforced in code:**
  - Every quote must appear word for word in the retrieved text.
  - Every evidence ID the model cites must exist.
  - In the market briefing, every number must appear in the source text, and a citation only counts if the sentences actually linked to that source match the item.
  - Explanations are checked for advice wording and internal code names, with fallback templates.
  - All pasted, fetched and emailed content is treated as untrusted data (prompt-injection defense).
- **Backend:** Node.js, Express, TypeScript and PostgreSQL, with a guarded URL fetcher (blocks private, loopback and cloud-metadata addresses at connect time), rate limiting and Helmet.
- **Frontend:** React, Vite and Tailwind. Accessible (status never shown by color alone), dark mode, phone-friendly.
- **Auth:** Auth0 single-page-app login. The server verifies the JWT and limits history and delete to the owner.
- **Free data sources:** CoinGecko, FRED (public CSV), SEC EDGAR, Google News RSS.
- **Testing:** 212 unit and integration tests (Vitest) covering source tiers, all calculators, the verdict engine, label rules, quote and citation validators, the advice lint, redaction, the URL-fetch safety checks, the email fixtures, the 10 ScamSOS scenarios, the market and news parsers, and the live tools with mocked network calls.

## Challenges we ran into

- **The model didn't know today's date.** "NVIDIA acquired Hugging Face in 2026" was classified as a *forecast*, because the model assumed 2026 is in the future, so it was never checked. We now give every reasoning step the real date. The claim now comes back "Mixed": the deal was announced in September 2026 but is expected to close in 2027.
- **Confident but wrong citations.** In the market briefing the model attributed analyst-style statements to NVIDIA's investor-relations page, which then wrongly carried the most weight. We added a check that a citation only counts if the sentences Google linked to that source share real words with the item.
- **Questions and headlines produced "no claims".** Students type "Is NVDA a good stock to buy?", not neat statements. We taught the extractor to turn questions into opinion/forecast claims and headlines into the assertions they imply. "Bitcoin Loses $80,000" now means it *fell below* $80,000.
- **A contradicted claim looked "weak".** The original scoring gave refuted claims 0, so strong evidence *against* a claim showed as "Insufficient". We split the gauge into how decisive the evidence is and which way it points.
- **Staying on the right side of "advice".** We wanted market context and a verdict on predictions without becoming an unlicensed advisor. The factor balance reports direction only and is computed by code.
- **Data access rules.** The SEC rejects anonymous automated tools, so that tool stays off until a contact string is configured. One free quote site sits behind a bot-check wall, so we didn't use it rather than get around it.

## Accomplishments that we're proud of

- Verdicts come from code, not from the model, and a source the system didn't retrieve can never be cited.
- Real checks we ran on live data during the hackathon:
  - "The FDIC insures deposits up to $250,000 per depositor" → **Holds up**, backed by fdic.gov.
  - "Savings accounts at FDIC-insured banks are only protected up to $10,000" → **Doesn't hold up**, contradicted by fdic.gov and Vanguard.
  - "Bitcoin is trading above $100,000 right now" → **Doesn't hold up**, with CoinGecko's live price ($80,515) as evidence.
  - "The Federal Reserve's interest rate target is currently 5.5%" → **Doesn't hold up**, with the Fed's own data (FRED: 4.00% upper limit) as evidence.
- ScamSOS: every step is tied to a verified official page, and the build fails if a placeholder link or a promise of getting money back slips in.
- 212 passing tests, feature flags for every add-on, and an assumptions log (`docs/ASSUMPTIONS.md`) for every judgment call.

## What we learned

- LLMs are great readers and poor judges. Moving the decisions into small, tested functions made the system both more trustworthy and easier to debug.
- "Grounded" doesn't mean "correctly attributed". You have to check that a citation really supports the sentence it's attached to.
- How you word a result matters as much as the result. Labels like "Insufficient" or "no money-related claims" confused real users even when the logic was right.

## What's next for TrustCheck

- Run our evaluation set of real public claims and publish the accuracy table. **[TEAM: fill `eval/claims.json` and add results here]**
- Deploy publicly. **[TEAM: add the URL]**
- Turn on SEC filings and live stock quotes by default.
- A browser extension: right-click any selected text and choose "Check with TrustCheck".
- Email/SMS alerts for the watchlist, and more languages.

## Built with

`typescript` `node.js` `express` `react` `vite` `tailwindcss` `postgresql` `google-cloud` `vertex-ai` `gemini` `google-search-grounding` `auth0` `vitest` `zod` `coingecko` `fred` `sec-edgar` `google-news-rss` `mailparser` `server-sent-events`

## Try it out

- GitHub: https://github.com/karbaz017/trustcheck
- Live demo: **[TEAM: deployed URL]**
- Video (≤ 5 min): **[TEAM: link]**

## Team

**[TEAM: list all four members and their Devpost profiles]**

## Honesty notes (for judges)

- TrustCheck is informational only. Search results and sources can be wrong or incomplete, and a well-supported claim doesn't make something a good decision for you.
- Open-source packages and services used are listed in the README's "Built with" section.
- **[TEAM: mention the similar tools you checked, if any]**
