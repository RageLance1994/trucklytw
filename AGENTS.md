# Truckly Platform Context (AGENT)

Questo file e il contesto operativo del progetto `trucklytw`.
Usalo prima di toccare feature mappa, sidebar, bottom bar, API, websocket e admin.

## 1) Architettura generale
- Monorepo con due app principali:
  - `backend/`: Express + MongoDB + WebSocket (`express-ws`) + EJS legacy + API JSON.
  - `frontend/`: React 19 + Vite + TypeScript + Tailwind + MapLibre.
- In produzione il backend serve anche la SPA (`backend/dist/index.html`).
- Runtime tipico locale:
  - backend su `:8080`
  - frontend Vite su `:5173`

## 2) Boot e comandi
- Script root:
  - `start-dev.ps1` (Windows): kill porte `8080`/`5173`, poi avvia backend + frontend.
  - `start-dev.sh` (macOS): apre 2 tab terminale.
- Backend:
  - `npm run dev` -> `nodemon index.js`
  - `npm start` -> `node index.js`
- Frontend:
  - `npm run dev`
  - `npm run build`

## 3) Backend: entrypoint e routing
- Entry: `backend/index.js`
  - middleware: `cookie-parser`, `express.json`, `express.urlencoded`, `express-fileupload`, compression.
  - CORS allowlist locale per `http://localhost:5173` e `http://127.0.0.1:5173`.
- Router mount:
  - `/` -> `routes/_home.js`
  - `/dashboard` -> `routes/_dashboard.js` (legacy EJS + endpoint storici)
  - `/ws` -> `routes/_websockets.js`
  - `/api` -> `routes/api.js` (API principali usate da frontend React)
  - `/_agents` -> `routes/_agents.js` (assistant chat + tool actions)

## 4) Auth e permessi
- Cookie auth: `auth_token`.
- Middleware:
  - `auth`: protegge HTTP route.
  - `authWS`: protegge websocket `/ws/stream`.
  - `imeiOwnership`: verifica ownership veicolo in route sensibili.
- Livelli usati nel codice:
  - `0`: super admin
  - `1`: admin
  - `2`: user/operator
  - `3`: readonly/viewer

## 5) Modello dati (Mongo)
- File: `backend/Models/Schemes.js`
- Collezioni principali:
  - `Vehicle` (plate/brand/model/details cifrati con campi `*Enc`)
  - `Drivers` (`tachoDriverId`, `name`, `surname`, `owner`)
  - `Users`, `Company`
  - AVL per device in collection dinamiche `${imei}_monitoring`
  - Refuelings in collection dinamiche `${imei}_refuelings`
- Nota importante:
  - nomi autisti NON arrivano da Teltonika IO in modo affidabile
  - mapping cardId -> nome va risolto dal DB `Drivers` (campo `tachoDriverId`)

## 6) Real-time e mappa
- WebSocket principale: `/ws/stream`
  - client invia `{ action: "subscribe", deviceIds: [...] }`
  - server invia payload `{ devices: [{ imei, data }] }`
- `MapContainer.tsx`:
  - inizializza `TrucklyMap`
  - crea marker + tooltip da AVL live
  - espone funzioni globali `window.truckly*` (route, geofence, style, fly-to, cache AVL, ecc.)
- Contratto globale usato dai componenti:
  - `window.trucklyGetAvl(imei)`
  - `window.trucklyDrawRoute`, `window.trucklyClearRoute`
  - `window.trucklyDrawNavigationRoute`, `window.trucklyClearNavigationRoute`
  - `window.trucklyHideOtherMarkers`, `window.trucklyShowAllMarkers`

## 7) Frontend: shell e pannelli
- Entry SPA: `frontend/src/main.tsx`
- Stato chiave:
  - `sidebarMode`: `"driver" | "routes" | "navigation" | "geofence" | "vehicle" | "admin" | "driver-register"`
  - `bottomBarState.mode`: `"driver" | "fuel" | "tacho" | "vehicles" | "drivers" | "navigation"`
- Componenti:
  - `driver-sidebar.tsx` (desktop)
  - `driver-bottom-bar.tsx` (mobile)
  - `route-calculator.tsx` (calcolo A->B usato in entrambe le UI)

## 8) Event bus frontend (CustomEvent)
- Eventi usati frequentemente:
  - `truckly:driver-open`
  - `truckly:bottom-bar-toggle`
  - `truckly:routes-open`
  - `truckly:navigation-open`
  - `truckly:vehicles-refresh`
  - `truckly:drivers-refresh`
  - `truckly:mobile-marker-open|update|close`
- Regola:
  - prima di introdurre nuovi eventi, verificare se ne esiste gia uno semanticamente uguale.
  - mantenere `detail` coerente (`{ imei }`, `{ mode, imei }`, ecc.).

## 9) Feature Navigazione A->B (stato attuale)
- API backend:
  - `POST /api/nav/geocode`
  - `POST /api/nav/route`
- Provider supportati:
  - Google (con traffico)
  - ORS (fallback/senza traffico realtime)
- UI:
  - desktop: dentro `DriverSidebar` in `mode === "navigation"`
  - mobile: dentro `DriverBottomBar` in `mode === "navigation"`
- Comportamento implementato:
  - cache localStorage location confermate
  - suggerimenti su focus con veicoli locali
  - autocomplete con debounce alto
  - pulsante mirino per posizione attuale veicolo
  - output: km, tempo, tempo traffico (se provider lo espone)

## 10) UI conventions obbligatorie
Queste regole vanno seguite per ogni nuova UI/refactor.

### Tables
- Le tabelle non devono rompere layout o spingere contenuti critici fuori viewport.
- Usare contenitore con `overflow-x-auto` per colonne ampie.
- Header sticky quando utile (`max-h` + scroll verticale).
- Righe compatte, leggibili e consistenti (testo piccolo, contrasto alto, separatori soft).
- Evitare nesting complesso dentro celle; privilegiare azioni chiare allineate.
- Su mobile preferire card/lista se la tabella perde usabilita.

### Combo Box
- I suggerimenti devono essere in dropdown overlay assoluto sotto input (non inline).
- Il dropdown non deve mai spostare input o elementi successivi.
- Trigger suggerimenti:
  - on focus: opzioni locali (es. veicoli), senza API call.
  - on input: ricerca remota con debounce alto (>= 2s) e soglia minima caratteri.
- Cache obbligatoria per query/selection confermate.
- Selezione: valorizza input, chiude dropdown, conserva coordinate/value.
- Styling coerente: bordo sottile, background dark, hover chiaro, ombra morbida.

### Pulsanti E Azioni
- Evitare pulsanti testuali standalone nelle toolbar delle tabelle/pannelli.
- Preferire sempre azioni con icone Font Awesome, con:
  - `title`/`aria-label` descrittivo
  - context menu per azioni multiple
- Per azioni tabellari usare pattern:
  - searchbar in testata
  - menu azioni in alto a destra (icona `ellipsis`)
  - filtri come checkbox nel menu con conteggio elementi.

### Route Inputs (A/B)
- Input con bottone mirino a sinistra per impostare posizione attuale.
- Placeholder standard:
  - `Posizione di partenza`
  - `Posizione di arrivo`
- Layout stabile: niente jump verticale quando compaiono suggerimenti.

## 11) Anti-regression checklist (prima di chiudere un task)
- Verificare che modalita `routes` e `navigation` restino separate (UI + stato + route line).
- Verificare che tooltip/driver card mostrino nome autista da directory DB, non ID raw.
- Verificare che dropdown combobox non rompa la verticale dei form.
- Verificare desktop + mobile:
  - apertura pannello corretta
  - close/reset stato corretto
  - route line pulita con `Pulisci` o cambio modalita
- Verificare assenza errori console su:
  - websocket reconnect
  - geocoding/routing failover
  - eventi `truckly:*`

## 12) Config e sicurezza
- Variabili chiave da usare (senza hardcodare):
  - `ROUTING_PROVIDER`
  - `GOOGLE_MAPS_API_KEY`
  - `ORS_API_KEY`
  - `PORT`, `NODE_ENV`, credenziali DB
- Non commitare mai chiavi/API secret in chat, code, screenshot o file versionati.
- Se una chiave e stata condivisa in chiaro, ruotarla.
