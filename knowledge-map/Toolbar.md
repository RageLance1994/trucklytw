---
title: Toolbar
tags: [frontend, refactor-target]
---

# Toolbar (target del refactor)

⚠️ **Non esiste un componente "Toolbar" dedicato.** Le funzioni di toolbar sono distribuite nella **Navbar** in alto.

File: `frontend/src/components/navbar.tsx`.
- Position `fixed`, `top:0`, altezza 64px, `bg-[#0a0a0a]`, `border-b border-white/10`.
- Contiene: search veicoli (`trucklySearchVehicles`), tab mobile (Flotta/Analisi/Mappe/Impostazioni), dropdown **map style** (→ evento `truckly:map-style`), dropdown **marker style** (→ `truckly:marker-style`), menu impostazioni (users/vehicles/drivers/company/logout), nome company.
- UI primitives: `components/ui/dropdown-menu.tsx` (Radix).

## Obiettivo [[Restyle-Plan]]
Spostare la toolbar **da sopra a sinistra**, come elemento che **sovrasta la mappa** (overlay), uniformando navigation/card/tipografia allo stile di **erp-piplabsim** (repo esterna di riferimento — serve accesso).

Considerazioni:
- La navbar oggi guida anche logica mobile (tab) e dispatcha eventi globali: il refactor deve preservare gli eventi `truckly:map-style` / `truckly:marker-style` / search o introdurne equivalenti coerenti (vedi event bus in [[Frontend-Shell]]).
- Una toolbar verticale sinistra deve convivere con [[Sidebar-BottomBar]] (sidebar destra) e con i pannelli mobile.

Collegato a: [[Frontend-Shell]] · [[Restyle-Plan]]
