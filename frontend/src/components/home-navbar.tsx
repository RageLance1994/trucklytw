import React from "react";
import { Button } from "./ui/button";

type HomeNavbarProps = {
  compact?: boolean;
};

export function HomeNavbar({ compact = false }: HomeNavbarProps) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-3">
        <img
          src="/assets/images/logo_white.png"
          alt="Truckly"
          className="h-7 w-auto"
          loading="lazy"
        />
        <span className="text-xs uppercase tracking-[0.28em] text-white/60">
          Fleet OS
        </span>
      </div>
      {!compact && (
        <nav className="hidden items-center gap-6 text-xs uppercase tracking-[0.24em] text-white/60 md:flex">
          <a href="#piattaforma" className="hover:text-white transition">
            Piattaforma
          </a>
          <a href="#funzioni" className="hover:text-white transition">
            Funzioni
          </a>
          <a href="#integrazioni" className="hover:text-white transition">
            Agent
          </a>
          <a href="#sicurezza" className="hover:text-white transition">
            Sicurezza
          </a>
        </nav>
      )}
      <div className="flex items-center gap-3">
        <a
          href="/login"
          className="text-xs uppercase tracking-[0.24em] text-white/70 hover:text-white transition"
        >
          Accedi
        </a>
        {!compact && (
          <Button className="h-9 px-4 text-xs uppercase tracking-[0.2em]">
            Richiedi accesso
          </Button>
        )}
      </div>
    </header>
  );
}
