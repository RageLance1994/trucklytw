---
title: Dockable Toolbar — Implementation Plan
tags: [plan, refactor, feature]
branch: visual-opti-refactor
source: workflow dockable-toolbar-design (3 design approaches -> adversarial judge panel -> synthesis)
ranking: "css-first(6.0) > free-dock(5.67) > layout-provider(5.33)"
---

> Prodotto dal workflow multi-approccio (vedi [[Restyle-Plan]], [[Toolbar]]). Base = approccio CSS-first, con innesti da LayoutContext (DockContext single-source) e free-dock (phasing forzato). Collegato a [[Frontend-Shell]] (event bus), [[Sidebar-BottomBar]] e [[Fragility-Register]] (z-index flat).

# Truckly Dockable Toolbar — Final Implementation Plan

> Status: ready-to-implement. Base approach selected, grafts applied, judge-raised killer risks resolved inline. All file/line anchors below were re-verified against the working tree.

---

## 1. Overview & Goals

Make the existing `LeftToolbar` (a `pointer-events-none absolute inset-y-0 left-0 z-40 hidden md:flex` overlay) repositionable to any of four edges — **LEFT / RIGHT / TOP / BOTTOM** — via a drag handle **and** an equal-status keyboard menu. The icon rail and its section panel (Flotta/Analisi/Mappe/Impostazioni) reorient per edge. Preference persists per device. Desktop-only (≥ md); phones are untouched.

**Goals**
- Zero regression at the default (`left`) dock — it must be byte-for-byte today's layout.
- Overlay-only: the map stays full-bleed. **No** `map.resize()`, **no** flex-sibling restructuring of the map box. (Explicitly out of scope, flagged so nobody assumes otherwise.)
- One source of truth for the dock value, consumed by the toolbar *and* every coexisting overlay/FAB, so the four scattered magic offsets stop drifting.
- Accessibility is a first-class path, not a bolt-on: every dock reachable with zero pointer use; drag is an enhancement.
- A **concrete z-index ladder** that resolves the flat-`z-40` collisions the judges flagged as the killer risk on all three designs.

**Non-goals (v1):** push-the-map mode; mobile free-dock; cross-device server sync (no prefs endpoint exists — `/api/session` is read-only identity, `settingsEnc` is dead); free x/y floating; per-breakpoint memory (see §3 rationale).

---

## 2. Chosen Architecture (and why, referencing the judged scores)

**Base = Design #1 "CSS-first 4-position dock" (avg 6, the top-ranked).** Its core mechanism is verified-feasible (Tailwind 3.4.19 `data-[dock=…]:` arbitrary variants work natively, all variant strings are static literals so the scanner keeps them), it reuses the proven `applyMapStyle` write-then-dispatch idiom byte-for-byte, and `dock=left` is a literal zero-diff baseline. Lowest build cost, lowest blast radius.

**Graft from Design #2 (avg 5.67):**
- The **explicit CSS-var geometry contract** (`--tk-toolbar-*` insets, not a string in `calc()`) for FAB/drawer offsetting — cleaner than threading `data-dock` into already-tangled conditional `className` template literals, which Judge #1 called the killer of Design #1's "pure className flip" framing.
- The `DOCK_PUSHES_MAP = false` documented scope-boundary constant.
- The **single-`setDock`-funnel** for both drag and keyboard so every reposition announces exactly once.

**Graft from Design #3 (avg 5.33):**
- A **minimal React Context (`DockContext`)** carrying `dock` to leaf consumers (`RailButton`, section panel) — instead of Design #1's fragile "two mirrored sources of truth" (React state *and* a DOM attribute that any third reader sees). The Context is the single in-React source; the DOM attribute + CSS vars are *derived outputs* written in one effect, never read back into React state. This kills the "renders one dock while FABs offset for another" failure Judge #3 named.
- Its **honest phase split** (left/right cheap mirror in PR1; top/bottom rewrite later) — but enforced as a hard gate rather than left optional, which all three judges demanded.

**Why not Design #2 or #3 as base:** both introduce a `LayoutProvider`/`DockProvider` with a panel registry that is scaffolding-only in v1 — dead abstraction the judges flagged as scope-creep against the app's no-store convention. We adopt the *one* useful idea (a tiny dock-only context) without the registry. Design #2/#3's per-breakpoint persistence was repeatedly flagged as a UX surprise ("toolbar teleports on window resize") — we drop it.

**Net:** Design #1's cheap CSS-first body + Design #2's var contract + Design #3's single-context-source and forced phasing.

---

## 3. Persisted Data Model

**Storage key:** `truckly:toolbar-dock` (namespaced, matches `truckly:map-style` / `truckly:marker-style`).

**Shape — plain enumerated string (v1).** We have four enumerated docks and no free positioning, so JSON is unjustified. A string is forward-compatible: a future `{side, collapsed}` reader can `try/parse` and fall back to treating a bare string as `{side}`.

```ts
// frontend/src/lib/dock.ts
export type Dock = "left" | "right" | "top" | "bottom";
export const DOCKS = ["left", "right", "top", "bottom"] as const;
export const DEFAULT_DOCK: Dock = "left";
export const DOCK_STORAGE_KEY = "truckly:toolbar-dock";
export const DOCK_EVENT = "truckly:toolbar-dock";
export const DOCK_PUSHES_MAP = false; // documents the deferred push-mode boundary

export function readDock(): Dock {
  try {
    const raw = localStorage.getItem(DOCK_STORAGE_KEY);
    return (DOCKS as readonly string[]).includes(raw ?? "") ? (raw as Dock) : DEFAULT_DOCK;
  } catch {
    return DEFAULT_DOCK;
  }
}

export function isVertical(d: Dock): boolean {
  return d === "left" || d === "right";
}
```

**Read:** once in `useDock` init (guarded `try/catch`, mirroring `left-toolbar.tsx:96-102`). Invalid/garbage → `DEFAULT_DOCK` so a corrupt entry never blanks the toolbar.

**Write (write-then-dispatch, single writer — mirrors `applyMapStyle`, `left-toolbar.tsx:132-140`):**
```ts
localStorage.setItem(DOCK_STORAGE_KEY, value);              // 1. persist
document.documentElement.setAttribute("data-dock", value); // 2. derived DOM attr (CSS hook)
// 3. derived geometry vars written in the same effect (see §9)
window.dispatchEvent(new CustomEvent(DOCK_EVENT, { detail: { side: value } })); // 4. broadcast
```
Listeners **only `setState`**, never re-write storage → no feedback loop (same rule as the style events). Optional `storage` event listener for multi-tab is opt-in, off by default.

**Migration/default:** none needed (new key). Absent ⇒ `left` ⇒ today's exact layout.

**No per-breakpoint memory** — the judges flagged "dock teleports when you resize across `lg`" as a UX defect on Designs #2/#3. One value per device.

**GDPR:** add `truckly:toolbar-dock` to the persistent-keys inventory. ⚠️ **Path correction (Judge #3 caught the wrong path in Design #1):** it is `frontend/src/pages/CookiePolicyPage.tsx` (~lines 97-107), **not** `components/`. Purpose: "preferenza posizione barra strumenti"; duration: persistente. No server persistence.

---

## 4. Component API & Files to Change/Create

### New files
| File | Purpose |
|---|---|
| `frontend/src/lib/dock.ts` | `Dock` type, `DOCKS`, `readDock`, `isVertical`, storage/event constants, `DOCK_PUSHES_MAP`. |
| `frontend/src/lib/use-dock.ts` | `useDock()` hook: read/persist/broadcast, write `data-dock` + `--tk-toolbar-*` vars, ResizeObserver for top/bottom height, subscribe to `DOCK_EVENT`. |
| `frontend/src/components/dock-context.tsx` | 1-screen `DockContext` provider + `useDockValue()` so `RailButton`/panel read `dock` without prop churn. Provider wraps only the toolbar subtree (not the whole app). |

### Changed files (verified anchors)
| File | Change |
|---|---|
| `frontend/src/components/left-toolbar.tsx` | Root wrapper `data-dock` + variant classes; rail axis variants; `RailButton` edge-aware indicator; section-panel orientation variants; mount `<DockHandle>` + drop bands; consume `useDock`. |
| `frontend/src/main.tsx` | Vista-rapida FAB (`:1873`, `md:left-24 top-[5.25rem]`) and AI FAB (`:1889`, `bottom-6 right-6`) → var-driven offsets; mobile-marker panel height calc (`~:1850`) subtracts toolbar var; **raise AI overlay `fixed inset-0 z-40` (`:1365`) per the z-ladder (§7).** |
| `frontend/src/components/quick-sidebar.tsx` | `pt-16` (`:181`) → var-driven; resolve left-dock vs left-drawer (§7). |
| `frontend/src/components/driver-sidebar.tsx` | `pt-16` (`:3416`) → var-driven; right-dock coexistence offset. |
| `frontend/src/components/driver-bottom-bar.tsx` | Height calc (`:589`, `calc(100dvh - var(--truckly-nav-height,64px))` + the `min-h` dup + `lg:h-[75vh]`) also subtracts `var(--tk-toolbar-bottom,0px)`. |
| `frontend/src/style.css` | `:root` defaults for `--tk-toolbar-left/right/top/bottom` (all `0px`) near `--truckly-nav-height`; `.dock-zone` band styles; add `.hidden-left`/`.hidden-top` only if slide-hide is added later (NOT v1). |
| `frontend/src/pages/CookiePolicyPage.tsx` | Add key to inventory (~`:97-107`). |
| `frontend/tailwind.config.ts` | **No change** — arbitrary `data-` variants work in 3.4.19; `content` glob `./src/**/*.{ts,tsx}` already covers new files. |

### Component API
```ts
// useDock — no props
useDock(): { dock: Dock; setDock(side: Dock): void }
// side effects: localStorage, data-dock attr, --tk-toolbar-* vars, ResizeObserver, DOCK_EVENT subscribe/dispatch

// DockHandle — internal to left-toolbar
<DockHandle dock={dock} onSetDock={setDock} />   // grip button + keyboard menu + pointer-drag controller

// LeftToolbar — stays prop-less (<LeftToolbar/> at main.tsx:1335 unchanged)
// RailButton — reads useDockValue() for indicator edge; signature otherwise unchanged
```
The legacy export name `LeftToolbar` is preserved (no rename to `DockableToolbar`) so the `main.tsx` import line is never touched.

---

## 5. Drag-handle + Dock-zone UX (incl. keyboard/ARIA)

**Keyboard is the primary, fully-specified path. Drag is an enhancement that routes through the same `setDock`.** Both ship in the **same PR** (avoids the WCAG-2.5.7 "drag-only shipped first" regression all three judges warned about).

### Handle
A focusable `<button>` grip at the rail's **leading** end (`GripVertical` for left/right, `GripHorizontal` for top/bottom), `cursor-grab → grabbing`, `aria-label="Sposta barra strumenti"`, `aria-haspopup="menu"`, `aria-expanded`. **Target size:** wrap in a `size-10` (40px) hit area inside the `w-16` rail to satisfy WCAG 2.5.8 (Judge #2 flagged the bare grip as likely < 44px — we use the existing `size-10` RailButton footprint).

### Keyboard menu (the accessible path) — fully pinned, no ambiguity
- Enter/Space on the handle opens a `role="menu"` with 4 `role="menuitemradio"` items: Sinistra / Destra / Alto / Basso; current marked `aria-checked`.
- **Roving tabindex**, `Home`/`End`/`ArrowUp`/`ArrowDown` move within the list, `Enter` commits, `Esc` closes and **returns focus to the handle**, `Tab` closes. (Judge #2: "aria-haspopup menu without roving/Home/End/Esc is incomplete" — addressed.)
- **Direct arrow-nudge shortcut** with a **deterministic edge map** (Judge #2 demanded a literal table — Design #2 left it ambiguous):

  | Key | Result |
  |---|---|
  | ArrowLeft | dock `left` |
  | ArrowRight | dock `right` |
  | ArrowUp | dock `top` |
  | ArrowDown | dock `bottom` |

  Advertised via `aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"`. Each arrow maps 1:1 to its edge — no list cycling.
- **Menu render position:** anchored to the handle with collision-flip so a bottom/right dock never opens off-screen or over the map (use the existing dropdown anchor logic; never a fixed "below the handle").

### Drag (enhancement)
Pointer Events (not HTML5 DnD — no keyboard story, poor touch). `pointerdown` on the handle → `setPointerCapture`, `data-dragging` on `documentElement` (gates the bands via CSS), `stopPropagation` so the MapLibre canvas underneath doesn't steal the gesture. `pointermove` hit-tests the pointer against four invisible edge zones (snap-to-edge, VS Code model) and arms the nearest. A lightweight edge highlight + optional ghost gives feedback **without reflowing the toolbar mid-drag** (no map repaint). `pointerup` over an armed zone whose side differs → `setDock`; else snap back. **6px threshold** → sub-threshold is a click that opens the keyboard menu (discoverability). **Abort paths** (Judge #2): `pointercancel`, release-outside-window, and viewport crossing below md mid-drag all release capture, drop the ghost, and commit nothing.

### Dock-zone bands
Four full-edge translucent bands, rendered **only** while `data-dragging` (or keyboard reposition) is active. Left/right ≈ 96px strips; top/bottom ≈ 72px strips. **Contrast fix (Judge #2 flagged `bg-brand/8` + `/40` ring as < 3:1 on a dark map, failing WCAG 1.4.11):** idle = `bg-brand/12` + dashed `ring-brand/60`; armed = solid `bg-brand/20` + `ring-brand` + label; current dock = muted "qui ora" (non-armable). All ≥ 3:1 non-text contrast. Bands are `aria-hidden` (pointer aid only); the keyboard menu is the accessible equivalent. **Reduced motion:** gate transitions behind `motion-reduce:` — and **reconcile with the existing global `prefers-reduced-motion` block at `style.css:474`** (Judge #2 flagged double-handling): the per-element variants only add the ghost/snap; the global block already neutralizes generic transitions, so we add `motion-reduce:transition-none` only where the global rule doesn't reach. Verify no dead/conflicting rules.

### Reverse-flex tab-order caveat (Judge #2, WCAG 1.3.2/2.4.3)
`flex-row-reverse`/`flex-col-reverse` desyncs DOM order from visual order. **We do NOT use reverse-flex.** For right/bottom we keep natural DOM order and place the panel via explicit ordering/positioning (panel before/after rail by CSS `order`, not by reversing the flex container), so keyboard tab order always matches visual order.

---

## 6. Per-orientation Behavior — Toolbar AND Section Panels

Driven by one `data-dock` value via static `data-[dock=…]:` variants. `--tk-toolbar-*` vars derived from it.

### `left` (default — zero regression)
Vertical `w-16 flex-col` rail pinned `inset-y-0 left-0 m-3`; section panel `w-64` opens to the **right** of the rail, `-ml-1` seam; active indicator on the rail's **left** edge (`left-0 h-5 w-0.5`). Identical to today. Sets `--tk-toolbar-left ≈ 88px`, all other toolbar vars `0px`.

### `right` (cheap mirror — PR1)
Rail pinned `right-0`; panel opens **left** of the rail via `order` (not reverse-flex), `-mr-1` seam; active indicator → **right** edge (`right-0`). Sets `--tk-toolbar-right ≈ 88px`. Coexists beside `DriverSidebar` (§7), not under it.

### `top` (rewrite — PR2)
Rail → horizontal `h-16 flex-row` strip pinned `inset-x-0 top-0`; logo leading, icons in a row, `mt-auto` logout spacer → `ml-auto`. Section panel **detaches below** the rail as a horizontal sheet: `h-64`, width `w-[min(440px,92vw)]`, **anchored under the rail item that opened it** (Judge #2: "left-aligned for v1" breaks spatial association — we anchor to the trigger from day one). Active indicator → rail **bottom** edge (`bottom-0 h-0.5 w-5`). Internal content (SectionLabel + PanelItem list) reflows from a vertical list into a responsive 2-col grid where it would otherwise overflow (Mappe = 4 map styles + 6 marker styles → grid + `max-h ~40vh` internal scroll). Writes `--tk-toolbar-top` = measured rail height (ResizeObserver, §9).

### `bottom` (rewrite — PR2)
Mirror of `top` via `order` (panel above rail), `-mb-1` seam, active indicator on rail **top** edge. Respects `env(safe-area-inset-bottom)`. Highest-conflict edge (DriverBottomBar + AI FAB) — resolved in §7. Writes `--tk-toolbar-bottom` = measured rail height.

> **Honesty note for the implementer:** top/bottom are *not* a className flip — the panel grow-axis genuinely changes and the content reflows. This is ~60-70% of the total effort and lives entirely in PR2. Do not let it block the cheap left/right win.

---

## 7. Coexistence with Other Overlays + Z-index/Spacing Strategy

This is the **killer risk on all three designs** (flat `z-40`: toolbar, QuickSidebar `left-0`, DriverSidebar `right-0`, DriverBottomBar `bottom-0`, AI overlay `inset-0`, both FABs all at `z-40`; occlusion decided by DOM order). The plan resolves it with a **concrete written z-ladder** plus var-based spacing — not the per-case hand-waves the judges rejected.

### Z-ladder (decided, not "z-40 OR z-45")
```
z-30  mobile marker bottom-sheet (unchanged)
z-40  drawers & bars: QuickSidebar, DriverSidebar, DriverBottomBar   (unchanged)
z-41  dockable toolbar rail + section panel        (raised by exactly 1 — sits above peer drawers on a shared edge)
z-45  dock-zone bands (only while dragging)         (above toolbar, below modals)
z-48  AI assistant overlay (fixed inset-0)          (raised from z-40 — a full-screen overlay MUST sit above the toolbar)
z-50  mobile Navbar / modals                        (unchanged, desktop-irrelevant for the toolbar)
```
- **AI overlay (`main.tsx:1365`) raised z-40 → z-48.** Judge #1/#2 named this the unfixable case for Design #1: an `inset-0 z-40` layer buries the toolbar (and the keyboard menu) on *every* dock, and an edge-offset can't help a full-screen overlay. Raising it above the toolbar is the only correct fix and it's a one-line change.
- **Toolbar raised to z-41**, so on any shared edge it wins over the peer drawer rather than relying on DOM order. Verify the raise does not cover a drawer's own close-X (Judge #3): drawers get an edge inset (below) so their controls stay clear.

### Var-based spacing (de-magicing — centralized, the thing Judge #1 called the real killer)
Every consumer reads the same `--tk-toolbar-*` vars instead of hardcoded literals. One writer (`useDock`), many readers:
- **Vista-rapida FAB** (`main.tsx:1873`): `left`/`top` offset = `calc(1rem + var(--tk-toolbar-left,0px))` etc., preserving its existing `bottomBarState.open` opacity conditional untouched (we change only the position literals, not the state logic — Judge #1's "entangled conditional" warning).
- **AI FAB** (`main.tsx:1889`): `bottom`/`right` offset += the relevant toolbar var, preserving its `mapStyle` + 4-boolean guards.
- **QuickSidebar / DriverSidebar `pt-16`** → `padding-top: calc(4rem ... )` only when top-docked; left/right origin offset by `--tk-toolbar-left/right`.
- **DriverBottomBar height** (`:589`, all three of the calc + `min-h` dup + `lg:h-[75vh]`): subtract `var(--tk-toolbar-bottom,0px)` in addition to `--truckly-nav-height`.

### The two collisions the judges said Design #1 under-specified
1. **Left dock + QuickSidebar (`left-0`) — the most likely day-one state.** Resolution: when `dock=left` AND QuickSidebar open, QuickSidebar's left origin shifts to `calc(var(--tk-toolbar-left))` so it opens **beside** the rail, and the section panel auto-collapses (rail stays visible). Explicit resting layout: rail (88px) | quick-sidebar drawer | map. Documented, not hand-waved.
2. **Stacking-context geometry (Judge #1, sharp catch):** the toolbar is `absolute` inside a positioned ancestor, while drawers are `fixed`. An `absolute right-[88px]` is relative to its containing block, not the viewport, so "dock beside the drawer" can drift. **Fix:** the toolbar's containing block is the full-bleed `relative h-full w-full` content box (`main.tsx:~1333`) which is itself viewport-sized and not transformed, so `absolute` insets *do* equal viewport insets here — **but** we verify in QA that no ancestor introduces a transform/filter (which would create a new containing block). If one ever does, switch the toolbar root to `fixed`. This assumption is added to the test checklist (§12).

---

## 8. Responsive & Mobile Strategy

**Desktop-only affordance.** Toolbar keeps `hidden md:flex` (renders only ≥ 768px). Handle, bands, and keyboard menu never mount below md — so none of the mobile chrome (Navbar `z-50 md:hidden`, QuickSidebar, bottom sheets, mobile marker sheet `z-30`) is touched.

- Persisted value is still **read** on mobile (harmless, inert until ≥ md).
- **Edge case:** user docks top/bottom on desktop, narrows below md → toolbar hides, mobile chrome takes over, no broken intermediate state; widening restores the saved dock.
- **Height-var coordination:** for `top`/`bottom`, `useDock` writes the measured rail height to `--tk-toolbar-top` / `--tk-toolbar-bottom` via ResizeObserver (same pattern as `navbar.tsx:~234` → `--truckly-nav-height`). For `left`/`right` those vars are `0px`. **Critical single-writer rule (Judge #3's killer for Design #2/#3):** the top-docked desktop toolbar writes its **own** `--tk-toolbar-top` var — it does **NOT** write `--truckly-nav-height` (which the `md:hidden` Navbar owns). MapContainer/DriverBottomBar/mobile-panel calcs subtract *both* vars; each var has exactly one writer per breakpoint. This avoids the "desktop top-toolbar silently resizes the map by overloading nav-height" corruption the judge verified.
- **Tablets:** iPad portrait (768px) is exactly the md boundary; the feature appears at ≥ md with Pointer-Events touch support. Touch on the snap bands over the MapLibre canvas uses `touch-action: none` on the handle + `stopPropagation`; keyboard menu remains the safe path.

---

## 9. Persistence + Broadcast Wiring

```
        ┌──────────── useDock (single writer) ────────────┐
setDock →│ 1 localStorage.setItem(truckly:toolbar-dock)    │
         │ 2 DockContext setState  (in-React source)       │
         │ 3 documentElement[data-dock] = side  (CSS hook) │
         │ 4 write --tk-toolbar-left/right/top/bottom vars  │
         │ 5 dispatch CustomEvent('truckly:toolbar-dock')  │
         └─────────────────────────────────────────────────┘
                          │ (window event)
        ┌─────────────────┴─────────────────────────────┐
   LeftToolbar self-sync          FABs / drawers (read vars + data-dock)
```

- **In-React source of truth = `DockContext`** (graft from Design #3). The DOM attribute and CSS vars are *derived outputs*, never read back into React — eliminating Design #1's "two mirrored sources" drift (Judge #3).
- **ResizeObserver** on the rail writes the top/bottom height var only when `isVertical(dock)` is false; sets it `0px` otherwise.
- Listeners only `setState` → no feedback loop (same rule as the existing style events).
- Optional `storage`-event multi-tab sync: off by default, one-line opt-in.

---

## 10. Phased Rollout (forced, not optional)

All three judges' top remediation: **split the cheap, design-system-faithful 80% from the risky top/bottom 20%.** Hard gate.

**PR1 — LEFT/RIGHT + full infra (~0.5–1 day, near-zero risk)**
1. `lib/dock.ts` + `lib/use-dock.ts` + `dock-context.tsx`.
2. Toolbar root `data-dock` + left/right variant classes; `RailButton` edge-aware indicator via `DockContext`; panel `order`-based placement (no reverse-flex).
3. `<DockHandle>` with the **full keyboard menu + arrow map** and pointer snap-to-edge; bands for left/right.
4. The **z-ladder** (raise AI overlay → z-48, toolbar → z-41) and **var-based de-magicing** of all four FAB/drawer offsets — done **here**, because the collisions exist the moment `right` ships.
5. Left-dock vs QuickSidebar resolution; CookiePolicy entry; aria-live status node.
6. Ship. This is a true mirror + a `~120-line` hook + the var purge; independently shippable and reversible.

**PR2 — TOP/BOTTOM (~0.5–1 day, the only real layout work)**
7. Rail axis flip (`h-16 flex-row`), panel-as-strip with trigger-anchored positioning + content reflow grid.
8. `--tk-toolbar-top/bottom` ResizeObserver wiring into DriverBottomBar + mobile-panel calcs (single-writer rule enforced).
9. Bottom-dock vs DriverBottomBar/AI-FAB coexistence; MapLibre control padding nudge so a top/bottom rail doesn't cover zoom/attribution.
10. Full QA matrix (§12).

---

## 11. Risks & Mitigations

| # | Risk (judge-sourced) | Mitigation |
|---|---|---|
| R1 | **Flat z-40 collisions** (the universal killer) | Concrete z-ladder §7: drawers z-40, toolbar z-41, bands z-45, **AI overlay raised to z-48**. Decided, not "OR". |
| R2 | **AI `inset-0` overlay buries toolbar + keyboard menu on every dock** | Raise overlay to z-48 above the toolbar (one line). Edge-offset can't fix a full-screen layer — only stacking can. |
| R3 | **Coupled magic offsets drift** (Judge #1's named killer) | Centralize behind `--tk-toolbar-*` vars, one writer. Change only position literals in the FABs, leaving their `bottomBarState`/`mapStyle`/boolean conditionals untouched. |
| R4 | **Two mirrored sources of truth desync** (Judge #3) | `DockContext` is the only in-React source; DOM attr + vars are derived outputs, never read back. |
| R5 | **`--truckly-nav-height` overload by a top toolbar** (Judge #3 verified app-wide breakage) | Top toolbar writes its **own** `--tk-toolbar-top`; never `--truckly-nav-height`. One writer per var per breakpoint. Consumers subtract both. |
| R6 | **Left dock + left QuickSidebar overlap** (day-one state) | Explicit resting layout: QuickSidebar origin offset by `--tk-toolbar-left`, section panel auto-collapses; rail stays beside the drawer. |
| R7 | **`absolute` vs `fixed` geometry drift** (Judge #1) | Toolbar's containing block is the untransformed viewport-sized content box, so insets equal viewport insets; QA asserts no transformed ancestor, else switch root to `fixed`. |
| R8 | **Reverse-flex tab-order break** (Judge #2, WCAG 1.3.2/2.4.3) | No reverse-flex; use CSS `order` so DOM order == visual order. |
| R9 | **Dock-zone contrast < 3:1** (Judge #2, WCAG 1.4.11) | Idle `bg-brand/12` + `ring-brand/60`; armed `bg-brand/20` + `ring-brand`. |
| R10 | **Incomplete ARIA menu** (Judge #2) | Roving tabindex + Home/End/Esc/return-focus; deterministic arrow→edge table; collision-flipped menu anchor. |
| R11 | **Top/bottom panel content reflow underestimated** | Scoped entirely into PR2; grid + `max-h` + internal scroll; trigger-anchored, not left-aligned. Budget the bulk of effort here. |
| R12 | **Drag fights MapLibre pan / abort edge cases** | `touch-action:none` + `stopPropagation` on handle; `pointercancel`/out-of-window/below-md-mid-drag all abort cleanly. |
| R13 | **DriverBottomBar triple-calc** (`:589` calc + `min-h` + `lg:h-[75vh]`) | Update all three sites to subtract `var(--tk-toolbar-bottom,0px)`; var defaults `0px` so left/right docks are untouched — assert in QA. |
| R14 | **Push-mode assumed in scope** | `DOCK_PUSHES_MAP=false` constant + this note: overlay-only; push/`map.resize()` is a separate future effort. |
| R15 | **Wrong CookiePolicy path** (Judge #3 tell) | Corrected to `frontend/src/pages/CookiePolicyPage.tsx`. |

---

## 12. Verification / Test Checklist

**Functional / persistence**
- [ ] Fresh load with no key → `left`, byte-for-byte identical to current toolbar (visual diff = 0).
- [ ] `setDock` persists; reload restores; corrupt `truckly:toolbar-dock` value → falls back to `left` (toolbar never blank).
- [ ] `data-dock` attr + `--tk-toolbar-*` vars update on every change; vars are `0px` for the unused edges (assert left/right report `--tk-toolbar-top/bottom = 0px`).
- [ ] `DockContext` state, DOM attr, and vars never disagree (single-writer assertion).

**Coexistence matrix** — 4 docks × {panel open / closed} × {QuickSidebar / DriverSidebar / DriverBottomBar / AI overlay, each open} at md / lg / xl:
- [ ] AI overlay open on **all 4 docks** → overlay sits above the toolbar (z-48), keyboard menu not buried.
- [ ] `left` + QuickSidebar open → rail beside drawer, no overlap, panel auto-collapsed.
- [ ] `right` + DriverSidebar open → side-by-side, FABs cleared.
- [ ] `bottom` + DriverBottomBar open → bar height shortened by `--tk-toolbar-bottom`; AI FAB shifted up; no overlap.
- [ ] `top` → MapLibre zoom/attribution not covered; mobile-panel & bottom-bar calcs subtract `--tk-toolbar-top`.
- [ ] Vista-rapida + AI FABs clear the rail in every dock (no FAB under the toolbar).
- [ ] Active-indicator on the correct edge per dock; top/bottom panel anchored under/over its trigger item.
- [ ] **Containing-block check:** confirm no transformed/filtered ancestor of the toolbar root; absolute insets == viewport insets.

**Accessibility**
- [ ] Every dock reachable with zero pointer use (menu + arrow map); `Esc` returns focus to handle.
- [ ] `aria-live` announces "Barra strumenti spostata a sinistra/destra/in alto/in basso" once per change (drag and keyboard both funnel through `setDock`).
- [ ] Tab order == visual order in all 4 docks (no reverse-flex).
- [ ] Dock-zone bands ≥ 3:1 non-text contrast on dark map.
- [ ] Handle hit area ≥ 40px (WCAG 2.5.8).
- [ ] `prefers-reduced-motion`: instant snap, no ghost; no dead/conflicting rule vs `style.css:474`.
- [ ] Run `accesslint audit-react-component` on the updated `left-toolbar.tsx` for **each of the 4 orientations** before merge.

**Mobile**
- [ ] Below md: no handle/bands/menu; mobile chrome unchanged; persisted value inert.
- [ ] Dock top/bottom on desktop → narrow below md → toolbar hides cleanly → widen restores dock.

**Drag robustness**
- [ ] 6px threshold: micro-move = menu open, real move = re-dock.
- [ ] `pointercancel`, release-outside-window, cross-below-md-mid-drag → abort, no commit, no stuck ghost/bands.

---

## Brand logo note (vector SVG)

The toolbar currently renders the brand mark as a raster import (`logoWhite`, `<img src={logoWhite} … className="h-6 w-auto">` at `left-toolbar.tsx:172`). On HiDPI displays and when the rail rotates to the horizontal `top`/`bottom` orientation (where the logo sits at the leading end and is more prominent), a low-res PNG will look soft and may show edge fringing. **Recommendation:** replace it with an inlined **SVG** brand logo — ship a `truckly-logo.svg` (single-color, `currentColor`-driven so it inherits the white/brand token without a separate dark/light asset) and render it as a React component or `<img src=…svg>`. Benefits: crisp at any DPI and any rail size, no orientation blur, smaller payload than the multi-resolution raster, and it can recolor via the existing OKLCH brand token instead of being a baked-in white PNG. Drop it in `frontend/src/assets/` and swap the `logoWhite` import. This is independent of the dock feature and can land in PR1.