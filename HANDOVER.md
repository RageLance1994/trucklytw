# HANDOVER — branch `visual-opti-refactor`

> Handover per riprendere il lavoro in una sessione nuova. Tutto è sul branch **`visual-opti-refactor`**, **non committato** (l'utente committa quando dà l'ok). Frontend builda verde (`cd frontend && npm run build`).

## Contesto & fonti di verità
- **`AGENTS.md`** (root) — contesto operativo della piattaforma (architettura, event bus, convenzioni tabelle/combobox).
- **`knowledge-map/`** — vault Obsidian di contesto (apri `00-INDEX.md`). Nodi chiave:
  - `Dockable-Toolbar-Plan.md`, `Tab-Switch.md`, `Chart-Style.md`, `Visual-Language.md`, `Fragility-Register.md`, `Restyle-Plan.md`.
- Memoria persistente in `~/.claude/projects/.../memory/` (vedi `MEMORY.md`).

## Stack
- `frontend/` React 19 + Vite + TS + Tailwind **v3** + MapLibre. Dark-first, token **OKLch** (vedi `style.css` + `tailwind.config.ts`). Brand = **arancione**.
- `backend/` Express + MongoDB + WS. **L'ingest binaria Teltonika NON è in questa repo** (servizio esterno → fix listener del punto 7 vanno fatti là).
- ⚠️ **`vite build` NON fa typecheck** (SWC): non rompe su unused/type errors. Verifica solo errori di sintassi/resolve.

## Convenzioni di design (GUARD-RAIL — rispettarle sempre)
- **Token**, non colori hardcoded: `bg-background` (base) < `bg-card` (card) ; `text-foreground`/`text-muted-foreground`, `border-border`, `bg-brand` (arancione), semantica `ok/warn/down`.
- **Tab switch** = underline stile htsmedcms/calcolo IVA → usare `components/ui/tab-switch.tsx` (`<TabSwitch/>`). Vedi `knowledge-map/Tab-Switch.md`.
- **Combo box** (input+suggerimenti) = `components/ui/combo-box.tsx` (`<ComboBox/>`).
- **Grafici** = `knowledge-map/Chart-Style.md` (arancione, area gradient, `emphasis:focus`, `sampling:lttb`, ECharts **bundlato locale**).
- **Glow discreti**: `box-shadow: 0 0 4px 0 ${accent}40` (NO aloni ampi). Vedi `knowledge-map/Visual-Language.md`.
- **Indicatori "active"/fill**: base squadrata → `rounded-t-full rounded-b-none` (border-bottom radius 0).
- **Pulsanti** = `components/ui/button.tsx` (varianti default/brand/outline/ghost/...).

## Architettura toolbar (chiave)
- `components/left-toolbar.tsx` — toolbar overlay **dockable in 4 posizioni** (sx/dx/top/bottom) via handle drag + menu tastiera + frecce. Stato dock in `lib/dock.ts` + `lib/use-dock.ts` + `components/dock-context.tsx`. CSS vars `--tk-toolbar-left/right/top/bottom` (z-ladder: drawers z-40, toolbar z-41, bande z-45, overlay AI z-48).
- Sezioni pannello: Cerca/Vista rapida/Flotta/Analisi/Mappe/Impostazioni. Su top/bottom il pannello è **ancorato sotto/sopra il pulsante** (anchorLeft) e la search è **inline estesa** nel rail.
- **Vista rapida** = sezione del rail con lista veicoli (legge `window.trucklyVehicles`, **fallback API** se non c'è mappa); click → fly-to, oppure (senza mappa) naviga a `/dashboard` + focus via `sessionStorage["truckly:focus-imei"]`.
- `Navbar` è resa **solo-mobile** (`md:hidden`).

## Pagine
- `/dashboard` → `DashboardPage` (mappa + toolbar + drawers).
- `/dashboard/workspace` → `WorkspacePage` (ex bottom-bar) app-shell con header/tab/rail fissi e scroll interno: tab Carburante/Attività autista/Veicoli/Autisti/Scarico dati. La `navigation` (A→B) resta overlay sulla mappa.

## Lavori COMPLETATI questa sessione (su branch)
1. ✅ **ORS_API_KEY** in-repo (`backend/env.yaml` + `cloudbuild.yaml` `--env-vars-file`) — l'utente l'ha anche messa live.
2. ✅ Design system token OKLch (erp-piplabsim), brand arancione (era ciano).
3. ✅ Toolbar → sinistra + **dockable 4 posizioni** (PR1 sx/dx, PR2 top/bottom). Review avversariale: fix applicati.
4. ✅ **WorkspacePage** dedicata (no più overlap bottom-bar/sidebar), scrollbar sottile, card de-nidate.
5. ✅ **Chart Seep** bonificati: ECharts locale, SVG **sanitizzato (XSS)**, validazioni, `extractDriverGraphs` blindato; **grafico carburante** ridisegnato (arancio+area, velocità nascosta di default, dataZoom pulito).
6. ✅ **Mobile + rewind**: routes = bottom sheet (altezza costante 58vh), fly-to con padding per il foglio, grafico inline su mobile, menu mobile cablato.
7. ✅ **a11y/responsive/declutter** (audit avversariale, 16 fix): tastiera, ARIA, contrasto, modali Escape, inert menu mobile, ecc.
8. ✅ **Combo box** veicolo (WorkspacePage) + autista (Attività autista).
9. ✅ **Tipo veicolo**: campo `vehicleType` (auto/furgone/camion/trattore, default camion) su schema+API+lista; select in form registrazione; **4 icone marker** per tipo (`lib/templates/vehicleMarker.ts`); icona tipo colorata-per-status + caret nella Vista rapida.
10. ✅ **Drawer autista** ridisegnato: tab *Stato guida | Anagrafica | Mission Control*, barre **glowing-solid** a base squadrata, menu **…** inline col nome (Report attività lì dentro), padding fix.
11. ✅ Allineate le **superfici dei 3 drawer** ai token (Driver/Quick/Bottom).
12. ✅ **Task #11 — Dislocazione user management** (FATTO). `AdminSidebar` (~1500 righe) estratto da `driver-sidebar.tsx` → nuovo `components/user-management-dashboard.tsx` (token-izzato, tabella **independently-scrollable** con header ricerca/"Registra azienda" fissi + intestazioni colonna `sticky`, modali con focus-trap+Escape via `Modal` in portal). Cablato nel tab **"Utenti"** della WorkspacePage (gated `priv<=2`). Vecchio drawer `mode==="admin"` + handler `truckly:admin-open` rimossi; trigger toolbar/navbar ripuntati su `bottom-bar-toggle {mode:"users"}`.
13. ✅ **Tab switch**: underline **animata** (cursore assoluto che scivola+widening, porting di piplabs `menus.js`); fix overflow ("cheroba": il cursore a `-bottom-px` + `overflow-x-auto` generava una scrollbar verticale → ora `bottom-0`). Standard ribadito: solo border-bottom, mai box/ring/rounded.
14. ✅ **Toolbar**: "Vista rapida" + "Veicoli" **uniti** in un solo menu `components/vehicles-menu.tsx` con TabSwitch **Tutti | Cluster | Tipologie | Per Tag**. Pannello fleet allargato (`w-96`) per non andare in overflow-x. Vista rapida standalone rimossa.
15. ✅ **Cluster veicoli custom** (backend, **multi-cluster**): gruppi nominati ("Flotta Nord/Sud"), condivisi per azienda. Model `Cluster` + API `/api/clusters*` in `backend/`. Frontend `lib/use-clusters.ts` (API + optimistic). Tab "Cluster" con **drag&drop**: drag = sposta, **Ctrl/Cmd+drag = copia** (multi-membership), drop su "Senza cluster" = togli da tutti; per-riga `＋`/`×`.
16. ✅ Toolbar: rimossa la **doppia icona** ("Cerca" + "Veicoli" aprivano lo stesso pannello). In verticale resta solo "Veicoli"; in orizzontale la search inline. Pannello Veicoli `w-96`.

## Lavori RIMANENTI / da verificare
- 🔲 **Debito declutter** (lasciato apposta, zero impatto funzionale): rimuovere ~360 righe di **nav-desktop morto** in `navbar.tsx` (mai renderizzato, è `md:hidden`); completare migrazione **colori hardcoded → token** nei drawer (testi `text-white/xx`, bordi `border-white/10`). In `driver-sidebar.tsx` restano alcuni tipi/helper admin ora morti minori.
- 👀 **Verifica funzionale cluster**: la API gira con backend attivo (`start-dev.ps1`). DnD testato a livello build; va provato live (crea cluster, drag, Ctrl+drag copia, ×/＋, drop su "Senza cluster").
- 👀 **Verifica visiva** dell'utente su: dock top/bottom, grafico carburante, rewind mobile, drawer autista nuovo, Vista rapida cross-pagina, barre glowing/flat-bottom.
- 🔲 (Altra repo) fix **listener server** ingest Teltonika.

## Comandi
- Build frontend: `cd frontend && npm run build`
- Dev: `start-dev.ps1` (Windows) — backend :8080, frontend :5173.
- Backend syntax check: `node --check backend/<file>.js`

## Vincoli/gotcha
- `gcloud` installato ma **senza account autenticato** (no ADC): config Cloud Run richiede `gcloud auth login` dell'utente. `backend/env.yaml` contiene **secret in chiaro versionati** → debito sicurezza (migrare a Secret Manager + ruotare).
- Event bus `truckly:*` (CustomEvent su window) — riusare eventi esistenti. Globali mappa `window.truckly*` (es. `trucklyFlyToVehicle`, `trucklyVehicles`, `trucklySetMapStyle`).
- Screenshot di review dell'utente in `screenshot-claude-truckly/` (gitignored).
