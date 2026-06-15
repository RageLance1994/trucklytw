---
title: Truckly Knowledge Map — Index (MOC)
tags: [moc, index]
updated: 2026-06-15
---

# 🗺️ Truckly — Knowledge Map

Mappa di contesto della piattaforma `trucklytw`. Apri in Obsidian e usa la **Graph view** (o graphify) per navigare le relazioni tra i nodi. Ogni nota è atomica e linka alle altre con `[[wikilink]]`.

> Fonte di verità operativa complementare: `AGENTS.md` nella root.

## Nodi principali

- [[Architecture]] — monorepo, boot, runtime, confini dei servizi
- [[Frontend-Shell]] — `main.tsx`, stato, event bus, pannelli
- [[Map-Layer]] — `MapContainer` + `TrucklyMap`, API globali `window.truckly*`
- [[Toolbar]] — toolbar/navbar attuale (target del refactor → spostare a sinistra)
- [[Sidebar-BottomBar]] — desktop sidebar vs mobile bottom bar
- [[Rewind-Playback]] — replay percorsi (rotto/scomodo su mobile)
- [[Routing-Navigation]] — A→B, provider ORS/Google, **secret ORS_API_KEY**
- [[Seep-Charts]] — integrazione SeepTrucker + chart generation (fragile)
- [[Backend-Listeners]] — websocket, change stream, ingest dati veicoli
- [[Data-Model]] — schemi Mongo, collezioni dinamiche per IMEI
- [[Fragility-Register]] — registro bug/fragilità note (da affrontare)
- [[Restyle-Plan]] — piano del branch `visual-opti-refactor`
- [[Dockable-Toolbar-Plan]] — piano feature: toolbar spostabile (sidebar/top/bottom)
- [[Tab-Switch]] — standard tab switch (underline, omologato a htsmedcms/IVA)
- [[Chart-Style]] — standard grafici (interattivi/leggibili, brand-aligned)
- [[Visual-Language]] — principi estetici (glow discreto, linguaggio grafico semplice)

## Stato del lavoro (branch `visual-opti-refactor`)

1. ✅ Lettura repo + knowledge map
2. ⏳ Config secret `ORS_API_KEY` su Cloud Run (bloccato su gcloud auth) → [[Routing-Navigation]]
3. ✅ Restyle: design system (token OKLch erp); `LeftToolbar` overlay **dockable in tutte e 4 le posizioni** (PR1 sx/dx + PR2 top/bottom: rail orizzontale, pannello a striscia, drop-zone 4 bordi, frecce, var `--tk-toolbar-*`); `Navbar` solo-mobile; combo box (veicolo/autista), tab switch underline (htsmedcms), Vista rapida nel rail → [[Dockable-Toolbar-Plan]], [[Tab-Switch]]
4. ⏳ Fix mobile (incl. [[Rewind-Playback]])
5. ⏳ Pulizia chart generation [[Seep-Charts]]
6. ⏳ Responsive + accessibilità + de-clutter
7. ⏳ (altra repo) listener server dati veicoli → [[Backend-Listeners]]
