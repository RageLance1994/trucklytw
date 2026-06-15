---
title: Sidebar & Bottom Bar
tags: [frontend, responsive]
---

# Sidebar (desktop) & Bottom Bar (mobile)

## DriverSidebar — `components/driver-sidebar.tsx` (~5095 righe ⚠️ monolite)
Overlay destro, `translateX(100%)` chiuso, anim `truckly-sidebar-in` 240ms, z-index 30.
Modi (`sidebarMode`): `driver` (tacho/metriche/grafici → [[Seep-Charts]]), `routes` ([[Rewind-Playback]]), `navigation` ([[Routing-Navigation]]), `geofence`, `vehicle`, `admin`, `driver-register`.

## DriverBottomBar — `components/driver-bottom-bar.tsx` (~3597 righe ⚠️ monolite)
Bottom sheet, full-width mobile / 75vh desktop, anim `truckly-bottom-bar-in` 200ms, z-index 40 (sopra sidebar).
Modi (`bottomBarState.mode`): `fuel` (FuelDashboard, ECharts), `navigation` (RouteCalculator compact), `vehicles` (tabella), `drivers` (tabella + LUL), `tacho` (DDD files), `driver` (DriverDashboard + grafici Seep).

## RouteCalculator — `components/route-calculator.tsx`
Pianificazione A→B condivisa desktop/mobile. Input con autocomplete debounce ~2.2s, cache localStorage, mirino posizione veicolo. → [[Routing-Navigation]].

## Problemi noti (responsive/mobile)
- Due monoliti enormi → difficili da rendere responsive e accessibili; candidati a splitting nel [[Restyle-Plan]].
- Su schermi piccoli bottom bar (75vh/full) e sidebar destra **coprono** i controlli, in particolare il player [[Rewind-Playback]].
- Tabelle dense: rispettare convenzioni AGENTS.md (overflow-x-auto, header sticky, card su mobile).

Collegato a: [[Frontend-Shell]] · [[Map-Layer]] · [[Restyle-Plan]]
