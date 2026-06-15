"use client";

import React from "react";
import { useLocation } from "react-router-dom";
import {
  Truck,
  BarChart3,
  Map as MapIcon,
  Settings,
  Search,
  LogOut,
  Fuel,
  Bell,
  ShieldCheck,
  Download,
  Users,
  Plug,
  Globe,
  Sun,
  Moon,
  MapPinned,
  X,
  GripVertical,
  GripHorizontal,
  Check,
} from "lucide-react";
import { VehiclesMenu } from "./vehicles-menu";
import { cn } from "../lib/utils";
import { API_BASE_URL } from "../config";
import { BrandMark } from "./brand-mark";
import { useDock } from "../lib/use-dock";
import { DockProvider, useDockValue } from "./dock-context";
import {
  type Dock,
  DOCKS,
  ENABLED_DOCKS,
  dockLabel,
  isDockEnabled,
  isVertical,
} from "../lib/dock";

type MapStyle = "base" | "light" | "dark" | "satellite";
type MarkerStyle = "pin" | "full" | "compact" | "plate" | "name" | "direction";
type Section = "fleet" | "analysis" | "maps" | "settings" | null;

const MAP_STYLES: { value: MapStyle; label: string; icon: React.ReactNode }[] = [
  { value: "base", label: "Base", icon: <MapIcon className="size-4" /> },
  { value: "satellite", label: "Satellite", icon: <Globe className="size-4" /> },
  { value: "light", label: "Chiaro", icon: <Sun className="size-4" /> },
  { value: "dark", label: "Scuro", icon: <Moon className="size-4" /> },
];

const MARKER_STYLES: { value: MarkerStyle; label: string }[] = [
  { value: "pin", label: "Pin" },
  { value: "full", label: "Completo" },
  { value: "compact", label: "Compatto" },
  { value: "plate", label: "Solo targa" },
  { value: "name", label: "Targa e direzione" },
  { value: "direction", label: "Solo direzione" },
];

const dispatch = (name: string, detail?: unknown) =>
  window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));

/**
 * LeftToolbar — barra strumenti che sovrasta la mappa (desktop), stile erp-piplabsim.
 * Spostabile dall'utente: PR1 supporta dock sinistra/destra (top/bottom = PR2).
 * Riusa gli eventi globali truckly:*.
 */
export function LeftToolbar() {
  const { dock, setDock } = useDock();
  const location = useLocation();
  // La "Vista rapida" (fly-to) ha senso solo dove c'è la mappa (/dashboard).
  // Fuori dalla mappa (es. WorkspacePage) non funziona → la nascondiamo.
  const onMap = location.pathname === "/dashboard";
  const [section, setSection] = React.useState<Section>(null);
  const [search, setSearch] = React.useState("");
  const [companyName, setCompanyName] = React.useState("Account");
  const [canManageUsers, setCanManageUsers] = React.useState(false);
  const [canManageVehicles, setCanManageVehicles] = React.useState(false);
  const [mapStyle, setMapStyle] = React.useState<MapStyle>("base");
  const [markerStyle, setMarkerStyle] = React.useState<MarkerStyle>("pin");
  const searchTimer = React.useRef<number | null>(null);
  const [anchorLeft, setAnchorLeft] = React.useState<number | null>(null);

  // Stato handle/drag
  const [dragging, setDragging] = React.useState(false);
  const [armed, setArmed] = React.useState<Dock | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Sessione + privilegi
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/session`, {
          cache: "no-store" as RequestCache,
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled || !data?.user) return;
        if (data.user.companyName) setCompanyName(data.user.companyName);
        const priv = [
          data.user.effectivePrivilege,
          data.user.privilege,
          data.user.role,
        ].find((v) => Number.isInteger(v));
        setCanManageUsers(Number.isInteger(priv) && priv <= 2);
        setCanManageVehicles(Number.isInteger(priv) && priv === 0);
      } catch (err) {
        console.warn("[LeftToolbar] session lookup failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Stato stile mappa/marker (localStorage + eventi)
  React.useEffect(() => {
    try {
      const m = localStorage.getItem("truckly:map-style") as MapStyle | null;
      if (m && MAP_STYLES.some((s) => s.value === m)) setMapStyle(m);
      const mk = localStorage.getItem("truckly:marker-style") as MarkerStyle | null;
      if (mk && MARKER_STYLES.some((s) => s.value === mk)) setMarkerStyle(mk);
    } catch {}

    const onMap = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode;
      if (MAP_STYLES.some((s) => s.value === mode)) setMapStyle(mode);
    };
    const onMarker = (e: Event) => {
      const style = (e as CustomEvent).detail?.style;
      if (MARKER_STYLES.some((s) => s.value === style)) setMarkerStyle(style);
    };
    window.addEventListener("truckly:map-style", onMap as EventListener);
    window.addEventListener("truckly:marker-style", onMarker as EventListener);
    return () => {
      window.removeEventListener("truckly:map-style", onMap as EventListener);
      window.removeEventListener("truckly:marker-style", onMarker as EventListener);
    };
  }, []);

  const runSearch = React.useCallback((value: string) => {
    const fn = (window as any).trucklySearchVehicles;
    if (typeof fn === "function") fn(value.trim());
  }, []);

  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearch(v);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => runSearch(v), 400);
  };

  const applyMapStyle = (value: MapStyle) => {
    setMapStyle(value);
    try {
      localStorage.setItem("truckly:map-style", value);
    } catch {}
    const fn = (window as any).trucklySetMapStyle;
    if (typeof fn === "function") fn(value);
    dispatch("truckly:map-style", { mode: value });
  };

  const applyMarkerStyle = (value: MarkerStyle) => {
    setMarkerStyle(value);
    try {
      localStorage.setItem("truckly:marker-style", value);
    } catch {}
    for (const fn of ["trucklySetMarkerStyle", "trucklyApplyAvlCache", "trucklyForceMarkerClass", "trucklyRefreshMarkers"]) {
      const f = (window as any)[fn];
      if (typeof f === "function") f(value);
    }
    dispatch("truckly:marker-style", { style: value });
  };

  const commitDock = React.useCallback(
    (side: Dock) => {
      if (!isDockEnabled(side)) return;
      const msg =
        side === dock
          ? `Barra strumenti già a ${dockLabel(side)}`
          : `Barra strumenti spostata a ${dockLabel(side)}`;
      if (side !== dock) setDock(side);
      // clear-then-set forza la ri-lettura di un messaggio polite identico
      setAnnounce("");
      requestAnimationFrame(() => setAnnounce(msg));
    },
    [dock, setDock],
  );

  // Chiude il pannello sezione quando si clicca fuori dalla toolbar.
  React.useEffect(() => {
    if (!section) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setSection(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [section]);

  const toggle = (s: Exclude<Section, null>, e?: React.MouseEvent) => {
    if (e?.currentTarget) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setAnchorLeft(r.left); // bordo sinistro del pannello allineato al pulsante
    }
    setSection((cur) => (cur === s ? null : s));
  };

  const railItems: { key: Exclude<Section, null>; label: string; icon: React.ReactNode }[] = [
    { key: "fleet", label: "Veicoli", icon: <Truck className="size-5" /> },
    { key: "analysis", label: "Analisi", icon: <BarChart3 className="size-5" /> },
    { key: "maps", label: "Mappe", icon: <MapIcon className="size-5" /> },
    { key: "settings", label: "Impostazioni", icon: <Settings className="size-5" /> },
  ];

  const isRight = dock === "right";
  const horizontal = !isVertical(dock); // top/bottom = rail orizzontale
  const panelBefore = dock === "right" || dock === "bottom";
  // Il menu Veicoli ha tab + lista: gli serve più larghezza (niente overflow-x sui tab).
  const wide = section === "fleet";
  // Su top/bottom il pannello è ancorato (assoluto) sotto/sopra il pulsante che l'ha aperto.
  const panelLeft =
    horizontal && anchorLeft != null
      ? Math.max(
          8,
          Math.min(
            anchorLeft,
            (typeof window !== "undefined" ? window.innerWidth : 1280) - (wide ? 400 : 328),
          ),
        )
      : null;
  const panel = section ? (
    <section
      style={panelLeft != null ? { left: panelLeft } : undefined}
      className={cn(
        "erp-panel pointer-events-auto flex flex-col rounded-xl border",
        horizontal
          ? `absolute ${wide ? "w-96" : "w-80"} max-h-[min(60vh,460px)] ${dock === "bottom" ? "bottom-[76px]" : "top-[76px]"}`
          : `my-3 ${wide ? "w-96" : "w-64"} ${isRight ? "-mr-1" : "-ml-1"}`,
      )}
      aria-label="Pannello sezione"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">
          {section === "fleet" && "Veicoli"}
          {section === "analysis" && "Analisi"}
          {section === "maps" && "Mappe"}
          {section === "settings" && "Impostazioni"}
        </span>
        <button
          type="button"
          onClick={() => setSection(null)}
          aria-label="Chiudi pannello"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        {section === "fleet" && (
          <VehiclesMenu onMap={onMap} canManageVehicles={canManageVehicles} />
        )}

        {section === "analysis" && (
          <div className="flex flex-col gap-1">
            <PanelItem icon={<Fuel className="size-4" />} onClick={() => dispatch("truckly:bottom-bar-toggle", { mode: "fuel" })}>
              Carburante
            </PanelItem>
            <PanelItem icon={<Bell className="size-4" />} disabled>
              Eventi
            </PanelItem>
            <PanelItem icon={<ShieldCheck className="size-4" />} disabled>
              Conformità
            </PanelItem>
            <PanelItem icon={<Download className="size-4" />} onClick={() => dispatch("truckly:bottom-bar-toggle", { mode: "tacho" })}>
              Scarico dati
            </PanelItem>
          </div>
        )}

        {section === "maps" && (
          <div className="flex flex-col gap-1">
            <SectionLabel>Tipo mappa</SectionLabel>
            {MAP_STYLES.map((s) => (
              <PanelItem
                key={s.value}
                icon={s.icon}
                active={mapStyle === s.value}
                onClick={() => applyMapStyle(s.value)}
              >
                {s.label}
              </PanelItem>
            ))}
            <SectionLabel>Marker veicoli</SectionLabel>
            {MARKER_STYLES.map((s) => (
              <PanelItem
                key={s.value}
                icon={<MapPinned className="size-4" />}
                active={markerStyle === s.value}
                onClick={() => applyMarkerStyle(s.value)}
              >
                {s.label}
              </PanelItem>
            ))}
          </div>
        )}

        {section === "settings" && (
          <div className="flex flex-col gap-1">
            <div className="mb-2 truncate rounded-md bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {companyName}
            </div>
            {canManageUsers && (
              <PanelItem
                icon={<Users className="size-4" />}
                onClick={() => dispatch("truckly:bottom-bar-toggle", { mode: "users" })}
              >
                Utenti
              </PanelItem>
            )}
            <PanelItem icon={<Plug className="size-4" />} disabled>
              Integrazioni
            </PanelItem>
            <PanelItem icon={<LogOut className="size-4" />} onClick={() => { window.location.href = `${API_BASE_URL}/logout`; }}>
              Esci
            </PanelItem>
          </div>
        )}
      </div>
    </section>
  ) : null;

  const rail = (
    <nav
      aria-label="Barra strumenti"
      className={cn(
        "erp-panel pointer-events-auto m-3 flex items-center gap-1 rounded-xl border",
        horizontal ? "h-16 flex-row px-3" : "w-16 flex-col py-3",
      )}
    >
      <DockHandle
        dock={dock}
        dragging={dragging}
        onCommit={commitDock}
        onDragChange={setDragging}
        onArm={setArmed}
      />

      <a
        href="/"
        className={cn("inline-flex size-9 shrink-0 items-center justify-center", horizontal ? "mr-2" : "mb-2")}
        aria-label="Truckly — home"
      >
        <BrandMark className="size-9 rounded-[10px]" />
      </a>

      {/* In orizzontale la search resta inline; in verticale la ricerca vive
          dentro il menu Veicoli (niente doppia icona per lo stesso pannello). */}
      {horizontal && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={onSearchChange}
            onKeyDown={(e) => e.key === "Enter" && runSearch(search)}
            placeholder="Cerca veicolo..."
            aria-label="Cerca veicolo"
            className="h-9 w-44 rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 xl:w-56"
          />
        </div>
      )}

      {railItems.map((item) => (
        <RailButton
          key={item.key}
          label={item.label}
          icon={item.icon}
          active={section === item.key}
          onClick={(e) => toggle(item.key, e)}
        />
      ))}

      <div className={cn("flex items-center gap-1", horizontal ? "ml-auto flex-row" : "mt-auto flex-col")}>
        <RailButton
          label="Esci"
          icon={<LogOut className="size-5" />}
          onClick={() => {
            window.location.href = `${API_BASE_URL}/logout`;
          }}
        />
      </div>
    </nav>
  );

  return (
    <DockProvider value={dock}>
      <div
        ref={rootRef}
        className={cn(
          "pointer-events-none absolute z-[41] hidden md:flex",
          dock === "left" && "inset-y-0 left-0 flex-row",
          dock === "right" && "inset-y-0 right-0 flex-row",
          dock === "top" && "inset-x-0 top-0 flex-col",
          dock === "bottom" && "inset-x-0 bottom-0 flex-col",
        )}
      >
        {panelBefore && panel}
        {rail}
        {!panelBefore && panel}
      </div>

      {/* Bande di drop (solo durante il drag) */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[45] hidden md:block" aria-hidden="true">
          <DockBand side="left" armed={armed} current={dock} />
          <DockBand side="right" armed={armed} current={dock} />
          <DockBand side="top" armed={armed} current={dock} />
          <DockBand side="bottom" armed={armed} current={dock} />
        </div>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
    </DockProvider>
  );
}

/* ---------------- Handle (drag + menu tastiera) ---------------- */

function DockHandle({
  dock,
  dragging,
  onCommit,
  onDragChange,
  onArm,
}: {
  dock: Dock;
  dragging: boolean;
  onCommit: (side: Dock) => void;
  onDragChange: (v: boolean) => void;
  onArm: (side: Dock | null) => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const handleRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const startRef = React.useRef<{ x: number; y: number } | null>(null);
  const didDragRef = React.useRef(false);

  const horizontal = !isVertical(dock);
  const sideFromPointer = (x: number, y: number): Dock | null => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const d = { left: x, right: w - x, top: y, bottom: h - y };
    const min = Math.min(d.left, d.right, d.top, d.bottom);
    if (min > 140) return null; // lontano da ogni bordo: nessun re-dock
    if (min === d.left) return "left";
    if (min === d.right) return "right";
    if (min === d.top) return "top";
    return "bottom";
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (!didDragRef.current && Math.hypot(dx, dy) > 6) {
      didDragRef.current = true;
      onDragChange(true);
      setMenuOpen(false);
    }
    if (didDragRef.current) onArm(sideFromPointer(e.clientX, e.clientY));
  };

  const finishDrag = (commit: boolean, clientX?: number, clientY?: number) => {
    startRef.current = null;
    if (didDragRef.current) {
      onDragChange(false);
      const target =
        commit && clientX != null && clientY != null ? sideFromPointer(clientX, clientY) : null;
      onArm(null);
      if (target && target !== dock) onCommit(target);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    finishDrag(true, e.clientX, e.clientY);
  };

  const onPointerCancel = () => {
    finishDrag(false);
    didDragRef.current = false; // niente click dopo pointercancel: azzera qui
  };

  const onClick = () => {
    // se è stato un drag, il click successivo va ignorato (no toggle menu)
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setMenuOpen((o) => !o);
  };

  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onCommit("left");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onCommit("right");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onCommit("top");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onCommit("bottom");
    }
  };

  const focusMenuItem = (index: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']:not([aria-disabled='true'])");
    if (!items || !items.length) return;
    const i = ((index % items.length) + items.length) % items.length;
    items[i]?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']:not([aria-disabled='true'])") || [],
    );
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusMenuItem(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusMenuItem(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusMenuItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusMenuItem(items.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMenuOpen(false);
      handleRef.current?.focus();
    } else if (e.key === "Tab") {
      // chiudi il menu e torna all'handle: niente popup orfano
      setMenuOpen(false);
      handleRef.current?.focus();
    }
  };

  // Chiudi il menu su click esterno
  React.useEffect(() => {
    if (!menuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !handleRef.current?.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [menuOpen]);

  // All'apertura sposta il focus nel menu (item attivo o primo) — WAI-ARIA menu button.
  React.useEffect(() => {
    if (!menuOpen) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitemradio']:not([aria-disabled='true'])",
      ) || [],
    );
    if (!items.length) return;
    const checkedIdx = items.findIndex((el) => el.getAttribute("aria-checked") === "true");
    items[checkedIdx >= 0 ? checkedIdx : 0]?.focus();
  }, [menuOpen]);

  return (
    <div className={cn("relative flex items-center justify-center", horizontal ? "mr-1" : "mb-1 w-full")}>
      <button
        ref={handleRef}
        type="button"
        title="Sposta barra strumenti"
        aria-label="Sposta barra strumenti"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
        onKeyDown={onHandleKeyDown}
        className={cn(
          "inline-flex size-10 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:cursor-grabbing",
          dragging && "bg-accent text-accent-foreground",
        )}
      >
        {horizontal ? <GripHorizontal className="size-5" /> : <GripVertical className="size-5" />}
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Posizione barra strumenti"
          onKeyDown={onMenuKeyDown}
          className={cn(
            "erp-panel absolute z-[46] w-44 rounded-lg border p-1 shadow-lg",
            dock === "left" && "left-[calc(100%+0.5rem)] top-0",
            dock === "right" && "right-[calc(100%+0.5rem)] top-0",
            dock === "top" && "left-0 top-[calc(100%+0.5rem)]",
            dock === "bottom" && "left-0 bottom-[calc(100%+0.5rem)]",
          )}
        >
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Posizione
          </div>
          {DOCKS.map((d) => {
            const enabled = ENABLED_DOCKS.includes(d);
            const checked = d === dock;
            return (
              <button
                key={d}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                aria-disabled={!enabled}
                tabIndex={-1}
                onClick={() => {
                  if (!enabled) return;
                  onCommit(d);
                  setMenuOpen(false);
                  handleRef.current?.focus();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm capitalize",
                  !enabled && "cursor-not-allowed opacity-40",
                  enabled && checked && "bg-brand/10 text-brand",
                  enabled && !checked && "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="inline-flex size-4 items-center justify-center">
                  {checked && <Check className="size-3.5" />}
                </span>
                <span className="flex-1">{dockLabel(d)}</span>
                {!enabled && <span className="text-[10px] text-muted-foreground">presto</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Bande di drop ---------------- */

function DockBand({
  side,
  armed,
  current,
}: {
  side: Dock;
  armed: Dock | null;
  current: Dock;
}) {
  const isArmed = armed === side;
  const isCurrent = current === side;
  const horiz = side === "top" || side === "bottom";
  return (
    <div
      className={cn(
        "absolute border-2 transition-colors",
        side === "left" && "inset-y-0 left-0 w-24 border-l-0",
        side === "right" && "inset-y-0 right-0 w-24 border-r-0",
        side === "top" && "inset-x-0 top-0 h-20 border-t-0",
        side === "bottom" && "inset-x-0 bottom-0 h-20 border-b-0",
        isArmed
          ? "border-brand bg-brand/20 border-solid"
          : isCurrent
            ? "border-transparent bg-muted/20"
            : "border-dashed border-brand/60 bg-brand/12",
      )}
    >
      <span
        className={cn(
          "absolute text-xs font-semibold",
          horiz ? "left-1/2 -translate-x-1/2" : "top-1/2 -translate-y-1/2",
          side === "left" && "left-2",
          side === "right" && "right-2",
          side === "top" && "top-2",
          side === "bottom" && "bottom-2",
          isArmed ? "text-brand" : "text-muted-foreground",
        )}
      >
        {isCurrent ? "qui ora" : dockLabel(side)}
      </span>
    </div>
  );
}

/* ---------------- Primitive rail/panel ---------------- */

function RailButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick: (e?: React.MouseEvent) => void;
}) {
  const dock = useDockValue();
  return (
    <div className="relative flex items-center justify-center">
      {active && (
        <span
          className={cn(
            "absolute rounded-full bg-brand",
            dock === "left" && "left-0 top-1/2 h-5 w-0.5 -translate-y-1/2",
            dock === "right" && "right-0 top-1/2 h-5 w-0.5 -translate-y-1/2",
            dock === "top" && "left-1/2 top-0 h-0.5 w-5 -translate-x-1/2",
            dock === "bottom" && "bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2",
          )}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-brand/10 text-brand ring-1 ring-brand/30"
            : "text-sidebar-foreground/70 hover:bg-accent hover:text-accent-foreground",
        )}
      >
        {icon}
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function PanelItem({
  children,
  icon,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        !disabled && active && "bg-brand/10 font-medium text-brand ring-1 ring-brand/25",
        !disabled && !active && "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}
