import { useCallback, useEffect, useState } from "react";
import {
  type Dock,
  DOCK_EVENT,
  DOCK_STORAGE_KEY,
  RAIL_INSET,
  isDockEnabled,
  readDock,
} from "./dock";

/**
 * Scrive gli output DERIVATI dal dock (attr DOM + CSS vars geometriche).
 * Unico writer: la fonte in-React resta lo state di useDock (vedi DockContext).
 */
function writeDockSideEffects(dock: Dock) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-dock", dock);
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  const px = `${RAIL_INSET}px`;
  set("--tk-toolbar-left", dock === "left" ? px : "0px");
  set("--tk-toolbar-right", dock === "right" ? px : "0px");
  set("--tk-toolbar-top", dock === "top" ? px : "0px");
  set("--tk-toolbar-bottom", dock === "bottom" ? px : "0px");
}

/**
 * Hook proprietario del valore di dock: read/persist/broadcast + side effects derivati.
 * Listener interni fanno solo setState (niente re-write storage → niente feedback loop).
 */
export function useDock() {
  const [dock, setDockState] = useState<Dock>(() =>
    typeof window === "undefined" ? "left" : readDock(),
  );

  // Applica side effects su mount e a ogni cambio.
  useEffect(() => {
    writeDockSideEffects(dock);
  }, [dock]);

  // Sincronizza con cambi esterni (altre istanze / multi-tab opzionale).
  useEffect(() => {
    const onEvent = (e: Event) => {
      const side = (e as CustomEvent).detail?.side;
      if (isDockEnabled(side)) setDockState(side as Dock);
    };
    window.addEventListener(DOCK_EVENT, onEvent as EventListener);
    return () => window.removeEventListener(DOCK_EVENT, onEvent as EventListener);
  }, []);

  const setDock = useCallback((side: Dock) => {
    if (!isDockEnabled(side)) return; // ignora dock non implementati (PR1)
    setDockState(side);
    try {
      localStorage.setItem(DOCK_STORAGE_KEY, side);
    } catch {}
    writeDockSideEffects(side);
    window.dispatchEvent(new CustomEvent(DOCK_EVENT, { detail: { side } }));
  }, []);

  return { dock, setDock };
}
