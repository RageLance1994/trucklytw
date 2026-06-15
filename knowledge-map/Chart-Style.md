---
title: Chart Style — standard di progetto
tags: [frontend, charts, design-system, convention]
---

# Chart Style (standard)

Standard per i grafici (ECharts) di Truckly: **interattivi, leggibili, brand-aligned**. Nasce dal redesign del grafico carburante (era "orribile/clanky/poco leggibile").

## Regole
- **Colore primario = brand arancione** (`#ff7a1a`); usare la palette `--chart-*` per le serie secondarie.
- **Area gradient** sotto la linea principale (`LinearGradient` 0.30 → 0.02) per leggibilità del livello.
- **Interattività**: `emphasis: { focus: "series" }` (hover su una serie attenua le altre).
- **Fluidità**: `sampling: "lttb"` su tutte le serie (no "clanky" con molti punti); `smooth: 0.3`.
- **Serie secondarie** (es. serbatoi) tratteggiate e più sottili; serie ausiliarie (es. velocità) opacità ridotta su asse secondario.
- **Assi puliti**: niente splitline aggressive, `axisLine` tenue (`rgba(255,255,255,0.10)`), `hideOverlap` sui label.
- **dataZoom** slider restyle brand (`fillerColor` arancione tenue, handle brand, `borderColor` transparent).
- **ECharts bundlato localmente** (dynamic import), mai da CDN. Vedi [[Seep-Charts]].

## Implementato
- `driver-bottom-bar.tsx` → `FuelEChart` (grafico carburante).

> TODO: applicare lo stesso standard ad altri grafici ECharts quando si toccano. Per gli SVG dei grafici autista (resi da SeepTrucker) vale solo la **sanitizzazione** ([[Seep-Charts]]), non lo styling ECharts. Collegato a [[Tab-Switch]].
