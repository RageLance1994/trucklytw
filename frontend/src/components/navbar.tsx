"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function Navbar() {
  const [search, setSearch] = React.useState("");
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [mobileSection, setMobileSection] = React.useState<
    "flotta" | "analisi" | "mappe" | "impostazioni" | null
  >(null);
  const [mapStyle, setMapStyle] = React.useState<
    "base" | "light" | "dark" | "satellite"
  >("base");
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem("truckly:map-style");
      if (
        saved === "base" ||
        saved === "light" ||
        saved === "dark" ||
        saved === "satellite"
      ) {
        setMapStyle(saved);
      }
    } catch {}

    const handleMapStyle = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const mode =
        detail?.mode === "base" ||
        detail?.mode === "light" ||
        detail?.mode === "dark" ||
        detail?.mode === "satellite"
          ? detail.mode
          : null;
      if (mode) setMapStyle(mode);
    };

    window.addEventListener("truckly:map-style", handleMapStyle as EventListener);
    return () => {
      window.removeEventListener(
        "truckly:map-style",
        handleMapStyle as EventListener,
      );
    };
  }, []);

  const runSearch = React.useCallback((value: string) => {
    const query = value.trim();

    if (typeof window === "undefined") return;
    const globalSearch = (window as any).trucklySearchVehicles;
    if (typeof globalSearch !== "function") return;

    globalSearch(query);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      runSearch(value);
    }, 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      runSearch(search);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-[#0a0a0d]">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="flex items-center gap-3 py-3">
          <div className="text-xl font-bold tracking-tight">Truckly</div>

          <div className="flex flex-1 items-center justify-center gap-6">
            <div className="flex w-full items-center md:w-auto">
              <input
                type="text"
                value={search}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Cerca veicolo..."
                className="h-10 w-full md:w-[200px] rounded-md border border-border bg-background/60 px-3 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <nav className="hidden items-center gap-5 text-sm md:flex">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1 outline-none focus-visible:outline-none">
                  Flotta
                </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-[180px]">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Veicoli</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem>Registra nuovo</DropdownMenuItem>
                      <DropdownMenuItem>Tabelle</DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Autisti</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem>Registra nuovo</DropdownMenuItem>
                      <DropdownMenuItem>Tabelle</DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem disabled className="flex flex-col items-start">
                    <span>Rotte</span>
                    <span className="text-xs text-muted-foreground">
                      Disponibile a breve
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1 outline-none focus-visible:outline-none">
                  Analisi
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-[160px]">
                <DropdownMenuItem>Carburante</DropdownMenuItem>
                <DropdownMenuItem>Eventi</DropdownMenuItem>
                <DropdownMenuItem>Conformita</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1 outline-none focus-visible:outline-none">
                  Mappe
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-[160px]">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Tipo</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      className="flex items-center gap-2"
                      onSelect={() =>
                        window.dispatchEvent(
                          new CustomEvent("truckly:map-style", {
                            detail: { mode: "satellite" },
                          }),
                        )
                      }
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          mapStyle === "satellite" ? "bg-emerald-400" : "opacity-0"
                        }`}
                        aria-hidden="true"
                      />
                      Satellite
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex items-center gap-2"
                      onSelect={() =>
                        window.dispatchEvent(
                          new CustomEvent("truckly:map-style", {
                            detail: { mode: "base" },
                          }),
                        )
                      }
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          mapStyle === "base" ? "bg-emerald-400" : "opacity-0"
                        }`}
                        aria-hidden="true"
                      />
                      Base
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex items-center gap-2"
                      onSelect={() =>
                        window.dispatchEvent(
                          new CustomEvent("truckly:map-style", {
                            detail: { mode: "light" },
                          }),
                        )
                      }
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          mapStyle === "light" ? "bg-emerald-400" : "opacity-0"
                        }`}
                        aria-hidden="true"
                      />
                      Chiaro
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex items-center gap-2"
                      onSelect={() =>
                        window.dispatchEvent(
                          new CustomEvent("truckly:map-style", {
                            detail: { mode: "dark" },
                          }),
                        )
                      }
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          mapStyle === "dark" ? "bg-emerald-400" : "opacity-0"
                        }`}
                        aria-hidden="true"
                      />
                      Scuro
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1 outline-none focus-visible:outline-none">
                  Impostazioni
                </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-[160px]">
                  <DropdownMenuItem>Utenti</DropdownMenuItem>
                  <DropdownMenuItem>Integrazioni</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>

          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="md:hidden h-9 w-9 rounded-md border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 transition inline-flex items-center justify-center"
            aria-label="Apri menu"
            aria-haspopup="dialog"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        id="mobile-menu"
        className={`fixed top-0 bottom-0 right-0 z-50 w-[86vw] max-w-sm border-l border-border bg-[#0a0a0d] text-foreground flex flex-col pt-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!isMenuOpen}
      >
        <div className="flex items-center justify-between px-4 pb-4 border-b border-white/10">
          <div className="text-xs font-semibold tracking-[0.28em] uppercase text-white/70">
            Menu
          </div>
          <button
            type="button"
            onClick={() => setIsMenuOpen(false)}
            className="h-8 px-3 rounded-full border border-white/20 text-xs text-white/70 hover:text-white hover:border-white/50 transition"
          >
            Chiudi
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-white">
          <details
            className="group border-b border-white/10 pb-3"
            open={mobileSection === "flotta"}
          >
            <summary
              className="flex items-center justify-between text-sm font-semibold text-white/90 cursor-pointer outline-none focus-visible:outline-none"
              onClick={(event) => {
                event.preventDefault();
                setMobileSection((current) => (current === "flotta" ? null : "flotta"));
              }}
            >
              Flotta
              <svg
                viewBox="0 0 320 512"
                className="h-3 w-3 text-white/50 transition-transform duration-200 group-open:rotate-90"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M96 64L256 256 96 448V64z" />
              </svg>
            </summary>
            <div className="mt-0 space-y-2 text-sm text-white/80 overflow-hidden max-h-0 transition-[max-height] duration-200 group-open:mt-3 group-open:max-h-80">
              <button className="w-full px-2 py-1 text-left hover:text-white transition">
                Veicoli
              </button>
              <button className="w-full px-2 py-1 text-left hover:text-white transition">
                Autisti
              </button>
              <div className="px-2 py-1 text-white/40">
                Rotte
                <div className="text-[11px] text-white/40">Disponibile a breve</div>
              </div>
            </div>
          </details>

          <details
            className="group border-b border-white/10 pb-3"
            open={mobileSection === "analisi"}
          >
            <summary
              className="flex items-center justify-between text-sm font-semibold text-white/90 cursor-pointer outline-none focus-visible:outline-none"
              onClick={(event) => {
                event.preventDefault();
                setMobileSection((current) => (current === "analisi" ? null : "analisi"));
              }}
            >
              Analisi
              <svg
                viewBox="0 0 320 512"
                className="h-3 w-3 text-white/50 transition-transform duration-200 group-open:rotate-90"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M96 64L256 256 96 448V64z" />
              </svg>
            </summary>
            <div className="mt-0 space-y-2 text-sm text-white/80 overflow-hidden max-h-0 transition-[max-height] duration-200 group-open:mt-3 group-open:max-h-80">
              <button className="w-full px-2 py-1 text-left hover:text-white transition">
                Carburante
              </button>
              <button className="w-full px-2 py-1 text-left hover:text-white transition">
                Eventi
              </button>
              <button className="w-full px-2 py-1 text-left hover:text-white transition">
                Conformita
              </button>
            </div>
          </details>

          <details
            className="group border-b border-white/10 pb-3"
            open={mobileSection === "mappe"}
          >
            <summary
              className="flex items-center justify-between text-sm font-semibold text-white/90 cursor-pointer outline-none focus-visible:outline-none"
              onClick={(event) => {
                event.preventDefault();
                setMobileSection((current) => (current === "mappe" ? null : "mappe"));
              }}
            >
              Mappe
              <svg
                viewBox="0 0 320 512"
                className="h-3 w-3 text-white/50 transition-transform duration-200 group-open:rotate-90"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M96 64L256 256 96 448V64z" />
              </svg>
            </summary>
            <div className="mt-0 space-y-2 text-sm text-white/80 overflow-hidden max-h-0 transition-[max-height] duration-200 group-open:mt-3 group-open:max-h-80">
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:text-white transition"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("truckly:map-style", {
                      detail: { mode: "base" },
                    }),
                  )
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    mapStyle === "base" ? "bg-emerald-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Base
              </button>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:text-white transition"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("truckly:map-style", {
                      detail: { mode: "satellite" },
                    }),
                  )
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    mapStyle === "satellite" ? "bg-emerald-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Satellite
              </button>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:text-white transition"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("truckly:map-style", {
                      detail: { mode: "light" },
                    }),
                  )
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    mapStyle === "light" ? "bg-emerald-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Chiaro
              </button>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:text-white transition"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("truckly:map-style", {
                      detail: { mode: "dark" },
                    }),
                  )
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    mapStyle === "dark" ? "bg-emerald-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Scuro
              </button>
            </div>
          </details>

          <details className="group" open={mobileSection === "impostazioni"}>
            <summary
              className="flex items-center justify-between text-sm font-semibold text-white/90 cursor-pointer outline-none focus-visible:outline-none"
              onClick={(event) => {
                event.preventDefault();
                setMobileSection((current) =>
                  current === "impostazioni" ? null : "impostazioni",
                );
              }}
            >
              Impostazioni
              <svg
                viewBox="0 0 320 512"
                className="h-3 w-3 text-white/50 transition-transform duration-200 group-open:rotate-90"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M96 64L256 256 96 448V64z" />
              </svg>
            </summary>
            <div className="mt-0 space-y-2 text-sm text-white/80 overflow-hidden max-h-0 transition-[max-height] duration-200 group-open:mt-3 group-open:max-h-80">
              <button className="w-full px-2 py-1 text-left hover:text-white transition">
                Utenti
              </button>
              <button className="w-full px-2 py-1 text-left hover:text-white transition">
                Integrazioni
              </button>
            </div>
          </details>
        </div>
      </aside>
    </header>
  );
}
