# Eval set

`claims.json` is intentionally empty: the team fills it with 12-15 REAL public claims. Do not invent claims or outcomes.

```json
[
  {
    "claim": "exact text of a real public claim",
    "expected": "supported | mixed | refuted | unverifiable | not_checkable",
    "source": "where you found it (URL or description)",
    "testedOn": "2026-10-24"
  }
]
```

Include a few that clearly hold up, a few that clearly don't, a few forecasts/opinions (`not_checkable`), and a few obscure ones (`unverifiable`).

Run with `npm run eval`. The runner scores the most important claim extracted from each item.

`demo.json` holds the 2 rehearsed demo inputs: `[{ "text": "..." }]`. `npm run demo:warm` pre-runs them into `server/data/demoCache.json` so the live demo never waits on search.
