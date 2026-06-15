---
title: Restyle Plan — visual-opti-refactor
tags: [plan, refactor]
branch: visual-opti-refactor
---

# Restyle Plan — branch `visual-opti-refactor`

Piano di lavoro per il rifacimento visivo + ottimizzazioni. Da affinare con le risposte alle domande aperte.

## 1. Knowledge map ✅
Vault Obsidian in `knowledge-map/` (questo file + nodi collegati da [[00-INDEX]]).

## 2. Secret `ORS_API_KEY` su Cloud Run
Causa root in [[Routing-Navigation]]. Da fare quando avremo gcloud + auth + identità del service.
```bash
# 1) crea/aggiorna secret (preferito: Secret Manager)
printf '%s' "$ORS_API_KEY" | gcloud secrets create ORS_API_KEY --data-file=- \
  || printf '%s' "$ORS_API_KEY" | gcloud secrets versions add ORS_API_KEY --data-file=-
# 2) collega al service Cloud Run
gcloud run services update <SERVICE> --region <REGION> \
  --update-secrets=ORS_API_KEY=ORS_API_KEY:latest
# (assicurarsi anche ROUTING_PROVIDER=ors se non già impostato)
```
🔒 Non incollare la chiave in chat/commit. Se condivisa in chiaro, ruotarla.

## 3. Toolbar: da top → sinistra (overlay mappa) ✅ + spostabile (piano)
- ✅ Estratta `LeftToolbar` (rail+pannello erp) da [[Toolbar]]; `Navbar` resa solo-mobile.
- ✅ Preservati eventi `truckly:map-style`, `truckly:marker-style`, search.
- 🔜 Evoluzione: toolbar **spostabile** dall'utente (sidebar sx/dx, toolbar top/bottom) con handle → piano dettagliato in [[Dockable-Toolbar-Plan]] (rollout PR1 left/right + infra, PR2 top/bottom).

## 4. Design system uniforme con **erp-piplabsim**
Allineare navigation, card, tipografia. ⛔ **Repo non disponibile in questo workspace** → serve accesso/estrazione token (colori, font, spacing, componenti card/nav).
- Definire design tokens in `tailwind.config.ts` (oggi quasi vuoto) + CSS vars in `style.css`.

## 5. Responsive / accessibilità / de-clutter
- Audit a11y (accesslint) su pagine chiave.
- Spezzare i monoliti `driver-sidebar.tsx` / `driver-bottom-bar.tsx`.
- Convenzioni AGENTS.md (tabelle, combobox, azioni a icona).

## 6. Mobile fixes (incl. [[Rewind-Playback]])
- Player replay mobile-first; pannelli che non coprono la mappa.

## 7. Pulizia chart generation [[Seep-Charts]]
- Validazione schema, stop ai fallback silenziosi, config per mapping/posizioni, sanitize SVG, ECharts locale.

## 8. (Altra repo) listener server inconsistenti
- Fix ingest/listener nel servizio esterno Teltonika → riferimenti in [[Backend-Listeners]] / [[Fragility-Register]].

## ❓ Domande aperte (bloccanti)
1. **erp-piplabsim**: come accedo? (path locale / git URL / export design tokens?)
2. **Cloud Run**: posso installare gcloud qui o esegui tu i comandi? service/region/project?
3. Ordine di priorità tra i punti 3-7 per le prime PR?
