/**
 * Dock model per la toolbar spostabile.
 * Vedi knowledge-map/Dockable-Toolbar-Plan.md. PR1 = solo left/right + infra.
 */
export type Dock = "left" | "right" | "top" | "bottom";

/** Tutti i dock previsti (anche futuri). */
export const DOCKS = ["left", "right", "top", "bottom"] as const;

/** Dock effettivamente implementati. */
export const ENABLED_DOCKS: Dock[] = ["left", "right", "top", "bottom"];

export const DEFAULT_DOCK: Dock = "left";
export const DOCK_STORAGE_KEY = "truckly:toolbar-dock";
export const DOCK_EVENT = "truckly:toolbar-dock";

/** v1 è overlay-only: la mappa resta full-bleed, niente push/map.resize(). */
export const DOCK_PUSHES_MAP = false;

/** Spazio (px) riservato dal rail + margine quando ancorato a sinistra/destra. */
export const RAIL_INSET = 88;

export function isVertical(d: Dock): boolean {
  return d === "left" || d === "right";
}

export function isDockEnabled(d: unknown): d is Dock {
  return typeof d === "string" && (ENABLED_DOCKS as string[]).includes(d);
}

/** Legge il dock persistito, clampando ai dock abilitati (mai un dock non implementato). */
export function readDock(): Dock {
  try {
    const raw = localStorage.getItem(DOCK_STORAGE_KEY);
    return isDockEnabled(raw) ? (raw as Dock) : DEFAULT_DOCK;
  } catch {
    return DEFAULT_DOCK;
  }
}

export function dockLabel(d: Dock): string {
  switch (d) {
    case "left":
      return "sinistra";
    case "right":
      return "destra";
    case "top":
      return "in alto";
    case "bottom":
      return "in basso";
  }
}
