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
  const timeoutRef = React.useRef<number | null>(null);

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
      <div className="mx-auto max-w-6xl flex h-16 items-center justify-between px-6">
        {/* Left: Logo */}
        <div className="text-xl font-bold tracking-tight">Truckly</div>

        {/* Center: Search + Menu */}
        <nav className="flex items-center gap-6 text-sm flex-1 justify-center">
          <input
            type="text"
            value={search}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Cerca veicolo…"
            className="h-8 w-60 rounded-md border border-border bg-background/60 px-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1">
                Flotta <span>▾</span>
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
              <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1">
                Analisi <span>▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[160px]">
              <DropdownMenuItem>Carburante</DropdownMenuItem>
              <DropdownMenuItem>Eventi</DropdownMenuItem>
              <DropdownMenuItem>Conformità</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-foreground/90 hover:text-foreground transition font-medium flex items-center gap-1">
                Impostazioni <span>▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[160px]">
              <DropdownMenuItem>Utenti</DropdownMenuItem>
              <DropdownMenuItem>Integrazioni</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Right: User */}
        <div className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
          AB
        </div>
      </div>
    </header>
  );
}
