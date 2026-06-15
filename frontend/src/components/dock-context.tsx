import { createContext, useContext } from "react";
import type { Dock } from "../lib/dock";

/**
 * Unica source-of-truth in-React per il dock corrente, letta dai figli
 * (RailButton, pannello) senza prop drilling. L'attributo DOM e le CSS vars
 * sono output derivati (vedi use-dock.ts), mai riletti dentro React.
 */
const DockContext = createContext<Dock>("left");

export const DockProvider = DockContext.Provider;

export function useDockValue(): Dock {
  return useContext(DockContext);
}
