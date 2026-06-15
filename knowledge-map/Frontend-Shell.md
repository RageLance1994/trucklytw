---
title: Frontend Shell
tags: [frontend]
---

# Frontend Shell

Entry SPA: `frontend/src/main.tsx` (~1948 righe). Componente root `DashboardPage` (main.tsx:318).

## Layout
```
<div h-screen flex-col bg-[#0a0a0a]>
  <Navbar/>                 // top fisso, 64px (--truckly-nav-height)  → [[Toolbar]]
  <div relative h-full>
    <MapContainer/>         // full screen           → [[Map-Layer]]
    <QuickSidebar/>         // lista veicoli (destra)
    <DriverSidebar/>        // overlay destra        → [[Sidebar-BottomBar]]
    <DriverBottomBar/>      // bottom sheet (mobile)  → [[Sidebar-BottomBar]]
    <AssistantChat/>        // modal AI
  </div>
</div>
```

## Stato chiave (main.tsx:324+)
- `sidebarMode`: `driver | routes | navigation | geofence | vehicle | admin | driver-register`
- `bottomBarState.mode`: `driver | fuel | tacho | vehicles | drivers | navigation`
- `mapStyle`: `base | light | dark | satellite`
- `markerStyle`: `pin | full | compact | plate | name | direction`
- `mobileMarkerPanel`, `isMobileView` (media query in MapContainer:316)

## Event bus (CustomEvent su window)
`truckly:driver-open`, `truckly:bottom-bar-toggle`, `truckly:routes-open`, `truckly:navigation-open`, `truckly:vehicles-refresh`, `truckly:drivers-refresh`, `truckly:mobile-marker-open|update|close|focus`, `truckly:map-style`, `truckly:marker-style`, `vchange`.

> Regola AGENTS.md: prima di un nuovo evento, verificare se esiste già un equivalente; mantenere `detail` coerente.

## Pattern architetturale
Stato React nel parent · stato mappa nei **window globals** · comunicazione via CustomEvent. Accoppiamento stretto UI↔mappa, ma poco testabile. Da tenere a mente nel [[Restyle-Plan]].

## File principali
`main.tsx`, `MapContainer.tsx` ([[Map-Layer]]), `style.css` (1209 righe), `config.ts`, `lib/truckly-map.ts`, `lib/ws-client.ts`, `lib/data-manager.ts`, `lib/indexed-db.ts`, `lib/templates/vehicleMarker.ts`, `lib/templates/vehicleTooltip.ts`.
