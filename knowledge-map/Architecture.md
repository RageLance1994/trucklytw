---
title: Architecture
tags: [architecture]
---

# Architecture

Monorepo con tre aree:

- `backend/` — Express + MongoDB (Mongoose) + WebSocket (`express-ws`) + EJS legacy + API JSON. Serve anche la SPA in produzione (`backend/dist/index.html`).
- `frontend/` — React 19 + Vite + TypeScript + Tailwind + MapLibre GL. → [[Frontend-Shell]]
- `truckly-refactor/` — app Next.js separata (landing/marketing, in evoluzione).

## Runtime locale
- backend: `:8080` (`npm run dev` → `nodemon index.js`)
- frontend Vite: `:5173` (`npm run dev`)
- Boot: `start-dev.ps1` (Windows) / `start-dev.sh` (macOS)

## Confine importante
La **ingest binaria dei device Teltonika (Codec8/8E via TCP) NON è in questa repo**. Un servizio esterno scrive nelle collezioni `${imei}_monitoring`; questo backend legge e fa streaming via WebSocket. → [[Backend-Listeners]], [[Data-Model]]

## Auth
Cookie `auth_token`; middleware `auth` (HTTP), `authWS` (WS), `imeiOwnership`. Livelli: `0` superadmin, `1` admin, `2` user, `3` viewer.

Collegato a: [[Data-Model]] · [[Map-Layer]] · [[Routing-Navigation]]
