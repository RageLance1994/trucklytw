---
title: Rewind / Playback
tags: [frontend, mobile, refactor-target]
---

# Rewind / Playback (replay percorsi)

Vive nella [[Sidebar-BottomBar]] in `sidebarMode === "routes"` (componente `RoutesSidebar` in `driver-sidebar.tsx:1053+`).

## Flusso
1. Mode `routes` → set `window.rewinding = true`, nasconde altri marker.
2. Fetch storico: `dataManager.getHistory(imei, fromMs, toMs)`.
3. Normalizza + downsample (max ~2000 punti); `trucklyDrawRoute(imei, history)`.
4. **Scrubber** slider 0..1 (driver-sidebar.tsx:1070, 1259-1273) → per posizione: punto corrente + heading dai vicini + statusClass (speed+ignition) → `trucklyUpdateRouteMarker(...)`.
5. Timeline eventi (pause/rest/refuel/withdrawal/driver-change) come marker; click → `focusTimelineEvent` aggiorna scrubber.

`RoutePoint = { timestamp, gps{Latitude,Longitude,Speed}, io{ignition, totalOdometer?, driver1Id?, tachoDriverIds?} }`.

## ❌ Problemi mobile (priorità)
- Su schermi piccoli il bottom sheet / sidebar coprono lo scrubber e la mappa → playback inusabile.
- Controlli non pensati per touch; nessun layout dedicato per replay in mobile.
- Stato accoppiato a `window.rewinding` globale → fragile su unmount/cambio modalità.

Obiettivo nel [[Restyle-Plan]]: layout replay mobile-first (player compatto ancorato, mappa visibile, scrub touch-friendly).

Collegato a: [[Map-Layer]] · [[Sidebar-BottomBar]]
