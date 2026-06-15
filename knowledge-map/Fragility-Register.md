---
title: Fragility Register
tags: [debt, bugs]
---

# Fragility Register (bug & fragilità note)

Registro vivo dei punti deboli emersi dalla mappatura. Severità indicativa.

## Backend — listeners ([[Backend-Listeners]])
| # | File:riga | Problema | Sev |
|---|-----------|----------|-----|
| L1 | `routes/_stream.js:13` | `deviceClients` undefined → crash su connessione | HIGH (ma file non montato) |
| L2 | `routes/_stream.js:22` | `req.user.vehicles.map` (manca `.list()` async) | HIGH |
| L3 | `routes/_websockets.js:50` | `deviceUpdate.io` senza null-check | HIGH |
| L4 | `routes/_websockets.js` (devicepreview) | `AuthorizedIMEIS` usato ma non importato | MED |
| L5 | `routes/_websockets.js:43-68 / 163-180` | race condition cache `ldCache` | MED |
| L6 | `routes/_websockets.js:165` | query backward illimitata driver | MED |
| L7 | `routes/_websockets.js` /devicepreview | nessun check ownership → peek IMEI | MED |
| L8 | costanti hardcoded (`BATCH_*`, 1h) | non configurabili | LOW |

## Backend — Seep/charts ([[Seep-Charts]])
| # | File:riga | Problema | Sev |
|---|-----------|----------|-----|
| S1 | `api.js:2750` | catch XLSX silenzioso → dati incompleti | CRIT |
| S2 | `api.js:248-330` | parsing XLSX regex + indici/offset hardcoded | CRIT |
| S3 | `api.js:201` | `metricToMinutes` → 0 silenzioso | CRIT |
| S4 | `api.js:593-617` | PDF python `catch(_){return buffer}` ingoia errori | HIGH |
| S5 | `seep.js:302` | `extractDriverGraphs` nessuna validazione | HIGH |
| S6 | `seep.js:321/366` | `resolveDriverId` match fuzzy senza confidence | HIGH |
| S7 | `api.js:552-590` | costanti posizione PDF magiche | MED |
| S8 | frontend driver-bottom-bar | SVG Seep grezzo (XSS) + ECharts CDN | MED |

## Frontend — UI/responsive
| # | Area | Problema | Sev |
|---|------|----------|-----|
| F1 | [[Rewind-Playback]] | player coperto/inusabile su mobile | HIGH |
| F2 | `driver-sidebar.tsx` (5095) / `driver-bottom-bar.tsx` (3597) | monoliti, difficili da rendere responsive/accessibili | MED |
| F3 | [[Toolbar]] | logica toolbar dispersa nella navbar | MED |
| F4 | accoppiamento `window.*` globals | stato mappa fuori da React, fragile | MED |

> Aggiornare questo registro man mano che i fix vengono applicati nel [[Restyle-Plan]].
