---
title: Tab Switch — standard di progetto
tags: [frontend, design-system, convention]
---

# Tab Switch (standard omologato)

**Istruzione (dall'utente):** tutti i tab switch di Truckly vanno omologati allo stile della pagina **calcolo IVA** di `htsmedcms` — un tab switch **underline** (niente pill/segmented).

Riferimento sorgente: `htsmedcms/frontend/src/pages/IvaCalc.jsx` (tabs inline, righe ~438-454).

## Componente
`frontend/src/components/ui/tab-switch.tsx` → `<TabSwitch tabs value onChange ariaLabel className />`.

Pattern (token Truckly, brand = arancione) — **underline puro, NIENTE box/ring/sfondo**:
- Container: `flex gap-5 overflow-x-auto border-b border-border sm:gap-7` (la baseline 1px del container è la riga grigia sotto i tab).
- Tab: `-mb-px border-b-2 px-0.5 pb-2.5 pt-2 text-sm font-medium transition-colors` (il `-mb-px` fa combaciare l'underline 2px dell'attivo con la baseline).
- **Inattivo**: `border-transparent text-muted-foreground hover:text-foreground`.
- **Attivo**: `border-brand text-brand`.
- **Focus tastiera**: `focus-visible:border-brand focus-visible:text-brand` — si riusa la stessa underline brand, **mai** un `ring`/box (era il bug "tabswitch-orribile": `focus-visible:ring-2 ring-ring` + `rounded-sm` disegnavano un riquadro arancione attorno al tab attivo).
- ⛔ Vietati su `<TabSwitch>`: `rounded-*`, `ring-*`, `bg-*` sull'attivo. L'unico segno dell'attivo è il border-bottom arancione.
- Supporta `icon` opzionale + ruoli ARIA (`tablist`/`tab`/`aria-selected`) + roving tabindex (frecce).

## Applicato
- [[Restyle-Plan]] · WorkspacePage (`/dashboard/workspace`).

> TODO: convertire eventuali altri tab switch interni (es. in `quick-sidebar.tsx`, dashboard interni) a `TabSwitch` man mano che si toccano quelle UI. Collegato a [[Sidebar-BottomBar]].
