---
title: Visual Language — principi
tags: [frontend, design-system, convention]
---

# Visual Language (principi)

Linee guida estetiche trasversali, complementari a [[Chart-Style]] e [[Tab-Switch]].

## Glow discreto / linguaggio grafico semplice
**Principio (richiesto dall'utente):** gli effetti **glow** devono essere **discreti**, mai vistosi. Niente aloni ampi/sfocati che facciano sembrare gli elementi "blurry". L'obiettivo è un **linguaggio grafico semplice** e pulito (canoni moderni shadcn/tailwind).

Regola pratica per i glow (es. loading bar stato autista, `CounterBar` in `driver-sidebar.tsx`):
- **blur piccolo** (≈ 4px), **spread 0**, **bassa opacità** del colore (≈ 25%, es. `${color}40`).
- preferire fill **solido** con glow appena accennato, non un alone diffuso.
- esempio: `box-shadow: 0 0 4px 0 ${accent}40` (NO `0 0 10px ${accent}`).

> Applicato a: `CounterBar` (barre stato guida) — vedi [[Sidebar-BottomBar]]. Vale per qualsiasi futuro elemento "glowing" (badge, indicatori, progress).

## Status / indicatori "active": bordo inferiore squadrato
**Guard-rail (richiesto dall'utente):** gli elementi che rappresentano uno **stato attivo / riempimento** (es. fill delle loading bar, indicatori di stato `:active`) devono avere **`border-bottom-left-radius` e `border-bottom-right-radius = 0px`** → **angoli superiori arrotondati, base squadrata** (`rounded-t-full rounded-b-none`, non `rounded-full`).

> Applicato a: `CounterBar` (traccia + fill) in `driver-sidebar.tsx`. Da rispettare per ogni nuovo indicatore di stato attivo.
