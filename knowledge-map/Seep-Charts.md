---
title: Seep Trucker & Chart Generation
tags: [backend, frontend, charts, refactor-target]
---

# Seep Trucker & Chart Generation

Integrazione con **SeepTrucker** (tachigrafo digitale): login, fetch report, grafici SVG, PDF/XLSX.
Env: `SEEP_EMAIL`, `SEEP_PASSWORD`, `SEEP_LUL_ENABLED`, `PDF_PROVIDER`.

## File chiave
- `backend/utils/seep.js` — client SeepTrucker: `auth()`, `driverActivity()`, `driverPdfReport()`, `driverXlsxReport()`, `extractDriverGraphs()` (302), `resolveDriverId()` (321), `driverGraphs()` (440).
- `backend/utils/seep-sync.js` — cron ogni 5 min: scarica DDD da Teltonika → upload Seep. → [[Backend-Listeners]]
- `backend/routes/api.js` — endpoint chart/LUL: `POST /api/seep/driver-graphs` (2820), `POST /seep/lul/preview` (2719); parsing XLSX (248-330); PDF branding/recolor (552-617).
- `frontend/src/components/driver-bottom-bar.tsx` — `DriverDashboard` render grafici SVG + ECharts (CDN).

## LUL report types (api.js:185)
D01 activity_infringements · D02 registered_places · D03 activity_times · D04 work_times · D05 inserted_cards.

## 🩹 Perché è fragile (vedi [[Fragility-Register]] per dettaglio)
- **Fallback a cascata silenziosi**: parse XLSX fallisce → `catch` con solo `console.warn`, prosegue con dati incompleti (api.js:2750).
- **Parsing XLSX brittle**: regex su header + indici colonna hardcoded (0..7) + offset magici (`i+2`) (api.js:248-330).
- **`metricToMinutes` ritorna 0** su input non parsabile → ore "0" invece di errore (api.js:201).
- **`extractDriverGraphs`** nessuna validazione struttura settimane/giorni/graph (seep.js:302).
- **`resolveDriverId`** match per suffisso/nome fuzzy senza confidence → rischio driver sbagliato (seep.js:321).
- **PDF post-process Python** (`scripts/seep-pdf-postprocess.py`) via `spawnSync`, `catch(_) {return buffer}` ingoia tutto; costanti di posizione magiche.
- **SVG grezzo** da Seep reso lato frontend → rischio XSS, nessuna validazione.
- **ECharts da CDN** hardcoded → niente fallback offline.

## Obiettivo refactor
Validazione schema (es. zod) sulle risposte Seep; rimuovere fallback silenziosi (loggare/segnalare degrado, es. HTTP 207); estrarre mapping XLSX/posizioni PDF in config; sanificare SVG; bundling ECharts locale.

Collegato a: [[Sidebar-BottomBar]] · [[Backend-Listeners]] · [[Fragility-Register]]
