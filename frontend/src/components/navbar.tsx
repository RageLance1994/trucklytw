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
import { API_BASE_URL } from "../config";

export function Navbar() {
  const [search, setSearch] = React.useState("");
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [companyName, setCompanyName] = React.useState("Account");
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [mobileSection, setMobileSection] = React.useState<
    "flotta" | "analisi" | "mappe" | "impostazioni" | null
  >(null);
  const [mapStyle, setMapStyle] = React.useState<
    "base" | "light" | "dark" | "satellite"
  >("base");
  const [markerStyle, setMarkerStyle] = React.useState<
    "full" | "compact" | "plate" | "name" | "direction"
  >("full");
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

    try {
      const savedMarker = window.localStorage.getItem("truckly:marker-style");
      if (
        savedMarker === "full" ||
        savedMarker === "compact" ||
        savedMarker === "plate" ||
        savedMarker === "name" ||
        savedMarker === "direction"
      ) {
        setMarkerStyle(savedMarker);
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

    const handleMarkerStyle = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const style =
        detail?.style === "full" ||
        detail?.style === "compact" ||
        detail?.style === "plate" ||
        detail?.style === "name" ||
        detail?.style === "direction"
          ? detail.style
          : null;
      if (style) setMarkerStyle(style);
    };

    window.addEventListener("truckly:map-style", handleMapStyle as EventListener);
    window.addEventListener("truckly:marker-style", handleMarkerStyle as EventListener);
    return () => {
      window.removeEventListener(
        "truckly:map-style",
        handleMapStyle as EventListener,
      );
      window.removeEventListener(
        "truckly:marker-style",
        handleMarkerStyle as EventListener,
      );
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/session`, {
          cache: "no-store" as RequestCache,
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.user?.companyName) {
          setCompanyName(data.user.companyName);
        }
        if (!cancelled && Number.isInteger(data?.user?.role)) {
          setIsSuperAdmin(data.user.role <= 1);
        }
      } catch (err) {
        console.warn("[Navbar] session lookup failed", err);
      }
    };

    loadSession();
    return () => {
      cancelled = true;
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

  const applyMarkerStyle = (style: "full" | "compact" | "plate" | "name" | "direction") => {
    if (typeof window === "undefined") return;
    setMarkerStyle(style);
    try {
      window.localStorage.setItem("truckly:marker-style", style);
    } catch {}

    const setter = (window as any).trucklySetMarkerStyle;
    if (typeof setter === "function") {
      setter(style);
    }
    const refresher = (window as any).trucklyApplyAvlCache;
    if (typeof refresher === "function") {
      refresher();
    }
    const refreshMarkers = (window as any).trucklyRefreshMarkers;
    if (typeof refreshMarkers === "function") {
      refreshMarkers(style);
    }
    const forceClass = (window as any).trucklyForceMarkerClass;
    if (typeof forceClass === "function") {
      forceClass(style);
    }
    window.dispatchEvent(
      new CustomEvent("truckly:marker-style", {
        detail: { style },
      }),
    );
  };

  React.useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest("[data-marker-style]") as HTMLElement | null;
      const style = el?.getAttribute("data-marker-style");
      if (!style) return;
      if (
        style === "full" ||
        style === "compact" ||
        style === "plate" ||
        style === "name" ||
        style === "direction"
      ) {
        applyMarkerStyle(style);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-[#0b0b0c]">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="flex items-center gap-3 py-3">
          <a href="/" className="inline-flex items-center">
            <img
              src="/assets/images/logo_white.png"
              alt="Truckly"
              className="h-6 w-auto"
              loading="lazy"
            />
          </a>

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
                    <DropdownMenuSubTrigger>
                      <i className="fa fa-truck mr-2 text-[12px]" aria-hidden="true" />
                      Veicoli
                    </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem
                          onSelect={() =>
                            window.dispatchEvent(
                              new CustomEvent("truckly:vehicle-register-open"),
                            )
                          }
                        >
                          <i className="fa fa-plus mr-2 text-[12px]" aria-hidden="true" />
                          Registra nuovo
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <i className="fa fa-table mr-2 text-[12px]" aria-hidden="true" />
                          Tabelle
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <i className="fa fa-id-card-o mr-2 text-[12px]" aria-hidden="true" />
                      Autisti
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem>
                        <i className="fa fa-plus mr-2 text-[12px]" aria-hidden="true" />
                        Registra nuovo
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <i className="fa fa-table mr-2 text-[12px]" aria-hidden="true" />
                        Tabelle
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem disabled className="flex flex-col items-start">
                    <span>
                      <i className="fa fa-road mr-2 text-[12px]" aria-hidden="true" />
                      Rotte
                    </span>
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
                <DropdownMenuItem>
                  <i className="fa fa-tint mr-2 text-[12px]" aria-hidden="true" />
                  Carburante
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <i className="fa fa-bell mr-2 text-[12px]" aria-hidden="true" />
                  Eventi
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <i className="fa fa-shield mr-2 text-[12px]" aria-hidden="true" />
                  Conformita
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    window.dispatchEvent(
                      new CustomEvent("truckly:bottom-bar-toggle", {
                        detail: { mode: "tacho" },
                      }),
                    )
                  }
                >
                  <i className="fa fa-download mr-2 text-[12px]" aria-hidden="true" />
                  Scarico dati
                </DropdownMenuItem>
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
                  <DropdownMenuSubTrigger>
                    <i className="fa fa-map mr-2 text-[12px]" aria-hidden="true" />
                    Tipo
                  </DropdownMenuSubTrigger>
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
                      <i className="fa fa-globe mr-1 text-[12px]" aria-hidden="true" />
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          mapStyle === "satellite" ? "bg-orange-400" : "opacity-0"
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
                      <i className="fa fa-map-o mr-1 text-[12px]" aria-hidden="true" />
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          mapStyle === "base" ? "bg-orange-400" : "opacity-0"
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
                      <i className="fa fa-sun-o mr-1 text-[12px]" aria-hidden="true" />
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          mapStyle === "light" ? "bg-orange-400" : "opacity-0"
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
                      <i className="fa fa-moon-o mr-1 text-[12px]" aria-hidden="true" />
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          mapStyle === "dark" ? "bg-orange-400" : "opacity-0"
                        }`}
                        aria-hidden="true"
                      />
                      Scuro
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <i className="fa fa-car mr-2 text-[12px]" aria-hidden="true" />
                    Veicoli
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    onClickCapture={(event) => {
                      const target = event.target as HTMLElement | null;
                      const el = target?.closest("[data-marker-style]") as HTMLElement | null;
                      const style = el?.getAttribute("data-marker-style");
                      if (
                        style === "full" ||
                        style === "compact" ||
                        style === "plate" ||
                        style === "name" ||
                        style === "direction"
                      ) {
                        applyMarkerStyle(style);
                      }
                    }}
                  >
                    <DropdownMenuItem asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
                        onMouseDown={() => applyMarkerStyle("full")}
                        data-marker-style="full"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            markerStyle === "full" ? "bg-orange-400" : "opacity-0"
                          }`}
                          aria-hidden="true"
                        />
                        Completo
                      </button>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
                        onMouseDown={() => applyMarkerStyle("compact")}
                        data-marker-style="compact"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            markerStyle === "compact" ? "bg-orange-400" : "opacity-0"
                          }`}
                          aria-hidden="true"
                        />
                        Compatto
                      </button>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
                        onMouseDown={() => applyMarkerStyle("plate")}
                        data-marker-style="plate"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            markerStyle === "plate" ? "bg-orange-400" : "opacity-0"
                          }`}
                          aria-hidden="true"
                        />
                        Solo targa
                      </button>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
                        onMouseDown={() => applyMarkerStyle("name")}
                        data-marker-style="name"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            markerStyle === "name" ? "bg-orange-400" : "opacity-0"
                          }`}
                          aria-hidden="true"
                        />
                        Targa e direzione
                      </button>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm"
                        onMouseDown={() => applyMarkerStyle("direction")}
                        data-marker-style="direction"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            markerStyle === "direction" ? "bg-orange-400" : "opacity-0"
                          }`}
                          aria-hidden="true"
                        />
                        Solo Direzione
                      </button>
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
                  {isSuperAdmin && (
                    <DropdownMenuItem
                      onSelect={() =>
                        window.dispatchEvent(new CustomEvent("truckly:admin-open"))
                      }
                    >
                      <i className="fa fa-users mr-2 text-[12px]" aria-hidden="true" />
                      Utenti
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem>
                    <i className="fa fa-plug mr-2 text-[12px]" aria-hidden="true" />
                    Integrazioni
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hidden md:inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/70 hover:text-white hover:border-white/30 transition">
                <span className="max-w-[160px] truncate">{companyName}</span>
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 text-white/50"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M5.5 7.5L10 12l4.5-4.5-1.4-1.4L10 9.2 6.9 6.1 5.5 7.5z" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem>
                <i className="fa fa-user-circle mr-2 text-[12px]" aria-hidden="true" />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <i className="fa fa-cog mr-2 text-[12px]" aria-hidden="true" />
                Impostazioni
              </DropdownMenuItem>
              <DropdownMenuItem>
                <i className="fa fa-file-text-o mr-2 text-[12px]" aria-hidden="true" />
                Fatture
              </DropdownMenuItem>
              <DropdownMenuItem>
                <i className="fa fa-line-chart mr-2 text-[12px]" aria-hidden="true" />
                Report Fiscali
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  window.location.href = `${API_BASE_URL}/logout`;
                }}
                className="text-white/80 hover:text-red-100 hover:!bg-red-500/35"
              >
                <i className="fa fa-sign-out mr-2 text-[12px]" aria-hidden="true" />
                Esci
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
        className={`fixed top-0 bottom-0 right-0 z-50 w-[86vw] max-w-sm border-l border-border bg-[#0b0b0c] text-foreground flex flex-col pt-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden ${
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
            className="h-8 w-8 rounded-full border border-white/20 text-xs text-white/70 hover:text-white hover:border-white/50 transition inline-flex items-center justify-center"
            aria-label="Chiudi"
          >
            <i className="fa fa-close" aria-hidden="true" />
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
              <button
                className="w-full px-2 py-1 text-left hover:text-white transition"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("truckly:bottom-bar-toggle", {
                      detail: { mode: "tacho" },
                    }),
                  );
                  setIsMenuOpen(false);
                }}
              >
                Scarico dati
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
                    mapStyle === "base" ? "bg-orange-400" : "opacity-0"
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
                    mapStyle === "satellite" ? "bg-orange-400" : "opacity-0"
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
                    mapStyle === "light" ? "bg-orange-400" : "opacity-0"
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
                    mapStyle === "dark" ? "bg-orange-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Scuro
              </button>

              <div className="pt-2 mt-2 border-t border-white/10 text-[11px] uppercase tracking-[0.2em] text-white/50">
                Veicoli
              </div>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:text-white transition"
                onClick={() => applyMarkerStyle("full")}
                data-marker-style="full"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    markerStyle === "full" ? "bg-orange-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Completo
              </button>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:text-white transition"
                onClick={() => applyMarkerStyle("compact")}
                data-marker-style="compact"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    markerStyle === "compact" ? "bg-orange-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Compatto
              </button>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:text-white transition"
                onClick={() => applyMarkerStyle("plate")}
                data-marker-style="plate"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    markerStyle === "plate" ? "bg-orange-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Solo targa
              </button>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:text-white transition"
                onClick={() => applyMarkerStyle("name")}
                data-marker-style="name"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    markerStyle === "name" ? "bg-orange-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Targa e direzione
              </button>
              <button
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:text-white transition"
                onClick={() => applyMarkerStyle("direction")}
                data-marker-style="direction"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    markerStyle === "direction" ? "bg-orange-400" : "opacity-0"
                  }`}
                  aria-hidden="true"
                />
                Solo Direzione
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
              {isSuperAdmin && (
                <button
                  className="w-full px-2 py-1 text-left hover:text-white transition"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("truckly:admin-open"));
                    setIsMenuOpen(false);
                  }}
                >
                  Utenti
                </button>
              )}
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

