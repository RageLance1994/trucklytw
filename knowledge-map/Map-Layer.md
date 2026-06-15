---
title: Map Layer
tags: [frontend, map]
---

# Map Layer

`frontend/src/MapContainer.tsx` (~1662 righe) inizializza `TrucklyMap` (`lib/truckly-map.ts`): clustering (zoom < 12), popup/tooltip, route drawing, geofence.

Init (MapContainer:601): `new TrucklyMap({ container, styleUrl: "/maps/style.json", center: [12.5,42], zoom: 6, onMarkerSelect })`.

## API globali `window.truckly*`
Contratto usato da [[Sidebar-BottomBar]] e [[Rewind-Playback]]:

- Display: `trucklyFlyToVehicle`, `trucklyShowAllMarkers`, `trucklyHideOtherMarkers(imei)`, `trucklyShowOnlyMarkers(imeis[])`, `trucklySearchVehicles(q)`, `trucklyFlyToLocation`
- Stile: `trucklySetMapStyle`, `trucklySetMarkerStyle`, `trucklyForceMarkerClass`, `trucklyRefreshMarkers`
- Route: `trucklyDrawRoute(imei, history)`, `trucklyClearRoute`, `trucklyDrawNavigationRoute(geometry)` (→ [[Routing-Navigation]]), `trucklyClearNavigationRoute`, `trucklySetRouteProgress`, `trucklyUpdateRouteMarker(imei, point, heading, statusClass)`
- Eventi rotta: `trucklySetRouteEventMarker(payload)` (kind: pause/rest/refuel/withdrawal/driver-change), `trucklyClearRouteEventMarkers`
- Geofence: `trucklyStartGeofence`, `trucklyCreateGeofence`, `trucklyUpdateGeofence`
- Dati: `trucklyGetAvl(imei)`, `trucklyVehicles`

## Live data
WebSocket (MapContainer:1173+) → cache `avlCacheRef` → aggiorna marker **solo se `window.rewinding === false`** (skip durante replay → [[Rewind-Playback]]). Calibrazione fuel per tank capacity (MapContainer:1177) per evitare crash su capacità mancante.

## Marker / tooltip
Template in `lib/templates/vehicleMarker.ts` e `vehicleTooltip.ts`. 6 varianti marker via classi `truckly-marker--{pin|full|compact|plate|name|direction}`. Tooltip espone custom fields per-veicolo (persistiti via `/api/vehicles/custom-fields`).

> ⚠️ Rendering SVG/HTML da fonti esterne: attenzione XSS → [[Fragility-Register]].

Collegato a: [[Frontend-Shell]] · [[Backend-Listeners]]
