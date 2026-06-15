---
title: Backend Listeners & Ingest
tags: [backend, websocket, refactor-target]
---

# Backend Listeners & Ingest dati veicoli

> ⚠️ Confine: la **ingest binaria Teltonika (Codec8/8E via TCP) è in un servizio esterno** (altra repo — è lì che andranno i fix "listener inconsistenti" del punto 7). Questo backend **non** ha listener TCP/UDP: solo HTTP `:8080` + WebSocket.

## WebSocket — `backend/routes/_websockets.js`
- `/ws/stream` (`authWS`): live data. **Global change stream** (`deployGlobalWatcher`, righe 18-85) su tutte le collection `*_monitoring`; batch `BATCH_SIZE=10`, `BATCH_INTERVAL=1000ms`; broadcast ai client iscritti; cache driver `ldCache`.
- `/ws/devicepreview` (righe 88-133): preview device non autorizzati, auto-authorize/deauthorize.
- Messaggio client: `{action:"subscribe", deviceIds:[...]}` (righe 140-197), valida ownership IMEI.

Protocollo server→client: `{ devices: [{ imei, data: { timestamp, gps, io } }] }`. → [[Data-Model]], [[Map-Layer]].

## Analisi dati
- `datainspectors/_drivers.js` — timeline stati driver (driving↔resting), soglia hardcoded 1h (riga 56).
- `datainspectors/_fuel.js` — consumo carburante (parzialmente implementato).
- `utils/tacho.js` — client Teltonika DDD; `utils/seep.js`/`seep-sync.js` → [[Seep-Charts]].

## 🩹 Inconsistenze listener (vedi [[Fragility-Register]])
- `routes/_stream.js` **rotto/non montato**: `deviceClients` undefined, `req.user.vehicles` trattato come array (manca `.list()`).
- `_websockets.js:50` accesso a `deviceUpdate.io` senza null-check.
- `AuthorizedIMEIS` usato ma non importato in `_websockets.js` (devicepreview).
- Race condition cache driver `ldCache` (watcher vs subscribe).
- Query backward illimitata per driver mancante (`_websockets.js:165`) → rischio timeout.

Collegato a: [[Architecture]] · [[Data-Model]]
