import * as React from "react";
import { cn } from "../../lib/utils";

export type ComboOption = { value: string; label: string };

/**
 * ComboBox — input testuale + dropdown di suggerimenti filtrati (mix select/autocomplete),
 * ispirato a piplabs-prod comboBox.js. Overlay assoluto che non sposta il layout (AGENTS.md).
 */
export function ComboBox({
  options,
  value,
  onChange,
  placeholder = "Seleziona...",
  className,
  ariaLabel,
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const fieldId = React.useId();
  const listboxId = `${fieldId}-listbox`;

  const selected = React.useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value],
  );

  // Mostra la query mentre è aperto/si digita, altrimenti la label selezionata.
  const displayValue = open ? query : selected?.label ?? "";

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const openDropdown = () => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  };

  const commit = (opt: ComboOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openDropdown();
      else setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openDropdown();
      else setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        commit(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={
          open && filtered[activeIndex] ? `${fieldId}-opt-${activeIndex}` : undefined
        }
        aria-label={ariaLabel}
        value={displayValue}
        placeholder={placeholder}
        onFocus={openDropdown}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      {open && (
        <div
          role="listbox"
          id={listboxId}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">Nessun risultato</div>
          ) : (
            filtered.map((opt, i) => {
              const isActive = i === activeIndex;
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  id={`${fieldId}-opt-${i}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(opt);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm",
                    isActive ? "bg-accent text-accent-foreground" : "text-foreground",
                    isSelected && "font-medium text-brand",
                  )}
                >
                  {opt.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
