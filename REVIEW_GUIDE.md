# EcoSort — 5-Minute Review Demo Script

Works fully offline in Demo Mode. No API key needed. Start at `index.html`.

## 0-30s — Hook (Home)
Open Home. Say: one wrong item contaminates a whole batch. EcoSort answers at the bin moment: which bin, how to prep, why it matters. Point to the 28 types, 4-bin stats and the live progress strip.

## 30s-2min — Classify (wow)
Go to Classify. Search `pizza` and hit Sort it. Point to the split rule: clean lid Blue, greasy base Green. Then search `battery`. Point to confidence, red bin, terminal-taping step. Mention Live AI with a key does real vision on uploads.

## 2-3min — Library + Bins
Open Library. 28 items, filter by Special disposal. Open Bins: Green wet, Blue dry, Red hazardous, Black general, plus dos and don'ts. Quote SWM 2016.

## 3-4min — Quiz + Assistant
Open Quiz, Start, answer two questions live. Then Assistant: ask `Where do temple flowers go?` and `How do I dispose of old medicines?`

## 4-5min — Impact + About
Open Impact: items sorted, diverted, CO2e, level badge, history. It picked up everything sorted on the Classify page. Copy summary or Download report. Close on About: problem, AI elements, responsible AI.

## If asked
- Live AI? Same UI, Claude vision via `node server.js` with `ANTHROPIC_API_KEY`. Health at `/api/health`.
- Offline? Yes. Open any page directly; the service worker caches all 8 pages.
- Data? History in localStorage only. No tracking.
- Scale? Campus pilot, region rules, local languages, municipal app integration.

## Quick checks before review
- `node --check js/app.js && node --check js/site.js && node --check js/knowledge.js && node --check server.js`
- `node server.js` → all 8 pages return 200, `/api/health` shows `live:false, items:28`
- Search `oil`, `coconut`, `bulb` each return a card in the library.
