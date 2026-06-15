---
title: Routing / Navigation (A→B)
tags: [backend, frontend, secret]
---

# Routing / Navigation (A→B)

API backend (`backend/routes/api.js`):
- `POST /api/nav/geocode` → `geocodeWithORS` (api.js:68) / `geocodeWithGoogle` (api.js:91)
- `POST /api/nav/route` → `routeWithORS` (api.js:116) / `routeWithGoogle` (api.js:154)

Provider scelto da `resolveRoutingProvider` (api.js:50): `ROUTING_PROVIDER` env, default **`ors`** (`DEFAULT_ROUTING_PROVIDER = "ors"`).

UI: [[Sidebar-BottomBar]] mode `navigation` + `route-calculator.tsx`; il risultato disegna la linea via `trucklyDrawNavigationRoute(geometry)` ([[Map-Layer]]).

## 🔑 Secret mancante su Cloud Run — CAUSA del bug "no percorsi A→B"
Con provider `ors`, sia geocode che route fanno:
```js
const apiKey = process.env.ORS_API_KEY || "";
if (!apiKey) throw new Error("ORS_API_KEY missing");
```
Quindi **se `ORS_API_KEY` non è propagato su Cloud Run, i percorsi punto-a-punto falliscono.**

Stato env:
- Locale `backend/.env`: `ROUTING_PROVIDER=ors`, `ORS_API_KEY` valorizzato (JWT, len 120) ✅
- Cloud Run: `ORS_API_KEY` **assente** ❌ → da configurare (idealmente come Secret Manager, non env in chiaro).
- `GOOGLE_MAPS_API_KEY`: non in `.env` (serve solo se si passa a provider google).

### Blocco operativo
`gcloud` non è installato/in PATH su questa macchina → non posso applicare la config da qui. Serve: gcloud + auth + nome service/region/project. Vedi [[Restyle-Plan]] §2 per i comandi pronti.

Collegato a: [[Map-Layer]] · [[Architecture]]
