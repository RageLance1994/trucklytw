import * as React from "react";
import { cn } from "../../lib/utils";

export type TabItem = { id: string; label: React.ReactNode; icon?: React.ReactNode };

/**
 * TabSwitch — tab switch "underline" omologato alla pagina calcolo IVA di htsmedcms.
 * Standard del progetto per tutti i tab switch (vedi knowledge-map/Tab-Switch.md).
 *
 * L'underline è un singolo "cursore" assoluto che scivola (transform) e cambia
 * larghezza (width) tra i tab — porting dello slider-menu di
 * piplabs-prod/.../v5/assets/js/menus.js (cursor.style.left = offsetLeft,
 * cursor.style.width = computedWidth, mantenuto in sync da un ResizeObserver).
 * Niente box/ring/sfondo: l'unico segno dell'attivo è la lineetta brand.
 */
export function TabSwitch({
  tabs,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const btnRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [cursor, setCursor] = React.useState({ left: 0, width: 0 });
  // La transizione si attiva solo dopo la prima misura, così al mount il
  // cursore non "vola" da sinistra ma appare già sotto il tab attivo.
  const [animate, setAnimate] = React.useState(false);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === value),
  );

  const measure = React.useCallback(() => {
    const btn = btnRefs.current[activeIndex];
    if (!btn) return;
    const next = { left: btn.offsetLeft, width: btn.offsetWidth };
    setCursor((prev) =>
      prev.left === next.left && prev.width === next.width ? prev : next,
    );
  }, [activeIndex]);

  // Misura sincrona prima del paint ad ogni cambio attivo / set di tab.
  React.useLayoutEffect(() => {
    measure();
  }, [measure, tabs.length]);

  // Riferimento sempre fresco per i callback async (RO / fonts).
  const measureRef = React.useRef(measure);
  React.useEffect(() => {
    measureRef.current = measure;
  }, [measure]);

  // Riallinea il cursore su resize del rail (reflow, dock, viewport).
  React.useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Le label cambiano larghezza quando il font custom finisce di caricare.
  React.useEffect(() => {
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } })
      .fonts;
    if (!fonts?.ready) return;
    fonts.ready.then(() => measureRef.current()).catch(() => {});
  }, []);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    btnRefs.current[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative flex gap-5 overflow-x-auto border-b border-border sm:gap-7",
        className,
      )}
    >
      {tabs.map((tab, i) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            // Nessun border/box sul bottone: l'underline è il cursore qui sotto.
            className={cn(
              "inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-0.5 pb-2.5 pt-2 text-sm font-medium outline-none transition-colors",
              active ? "text-brand" : "text-muted-foreground hover:text-foreground",
              "focus-visible:text-brand",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
      {/* Cursore underline animato (transito + widening).
          Sta a bottom-0 (DENTRO il box): con overflow-x-auto il browser calcola
          overflow-y:auto, quindi un cursore a -bottom-px sporgerebbe di 1px e
          genererebbe una scrollbar verticale fantasma (bug "tabswitch-orribile"). */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-brand",
          animate &&
            "transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        )}
        style={{ width: cursor.width, transform: `translateX(${cursor.left}px)` }}
      />
    </div>
  );
}
