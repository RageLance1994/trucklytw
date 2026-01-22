import React from "react";
import { Button } from "./ui/button";

type HomeNavbarProps = {
  compact?: boolean;
};

export function HomeNavbar({ compact = false }: HomeNavbarProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  const handleMenuToggle = () => {
    setMenuOpen((prev) => !prev);
  };

  const handleMenuClose = () => {
    setMenuOpen(false);
  };

  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <a href="/" className="flex items-center gap-3">
        <img
          src="/assets/images/logo_white.png"
          alt="Truckly"
          className="h-7 w-auto"
          loading="lazy"
        />
      </a>
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
        <button
          type="button"
          onClick={handleMenuToggle}
          aria-expanded={menuOpen}
          aria-controls="home-menu"
          className="flex h-10 w-10 items-center justify-center text-white/80 transition hover:text-white"
        >
          <span className="sr-only">Apri menu</span>
          <span className="flex h-5 w-6 flex-col justify-between">
            <span className="h-[2px] w-full rounded bg-current" />
            <span className="h-[2px] w-full rounded bg-current" />
            <span className="h-[2px] w-4 rounded bg-current" />
          </span>
        </button>
      </div>
      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Chiudi menu"
            onClick={handleMenuClose}
            className="absolute inset-0 bg-slate-950/70"
          />
          <div
            id="home-menu"
            className="absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col gap-8 bg-[#0b1220] px-8 py-8 text-white shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.32em] text-white/60">
                Menu
              </span>
              <button
                type="button"
                onClick={handleMenuClose}
                className="text-white/70 transition hover:text-white"
              >
                Chiudi
              </button>
            </div>
            <nav className="flex flex-col gap-4 text-sm uppercase tracking-[0.22em] text-white/80">
              <a href="#piattaforma" onClick={handleMenuClose} className="hover:text-white transition">
                Piattaforma
              </a>
              <a href="#funzioni" onClick={handleMenuClose} className="hover:text-white transition">
                Funzioni
              </a>
              <a href="#integrazioni" onClick={handleMenuClose} className="hover:text-white transition">
                Agent
              </a>
              <a href="#sicurezza" onClick={handleMenuClose} className="hover:text-white transition">
                Sicurezza
              </a>
            </nav>
            <div className="mt-auto flex flex-col gap-3">
              <a
                href="/login"
                onClick={handleMenuClose}
                className="text-xs uppercase tracking-[0.24em] text-white/70 hover:text-white transition"
              >
                Accedi
              </a>
              {!compact && (
                <Button
                  asChild
                  className="h-10 px-4 text-xs uppercase tracking-[0.2em]"
                >
                  <a href="/accesso" onClick={handleMenuClose}>
                    Richiedi accesso
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
