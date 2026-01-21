import React from "react";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { HomeNavbar } from "../components/home-navbar";

export function AccessRequestPage() {
  const [fleetRange, setFleetRange] = React.useState<[number, number]>([50, 1000]);

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-[#f4f4f5]">
      <HomeNavbar />
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center px-4 pb-16 pt-6">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#121212] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">
              Richiesta accesso
            </p>
            <h1 className="text-2xl font-semibold text-white">
              Parliamo della tua flotta.
            </h1>
            <p className="text-sm text-white/60">
              Raccontaci della tua impresa.
            </p>
          </div>

          <form className="mt-6 grid gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">
                Nome o ragione sociale
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">
                Numero di telefono
              </label>
              <input
                type="tel"
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">
                Email di lavoro
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-3">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">
                Totale mezzi
              </label>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Min: {fleetRange[0]}</span>
                <span>Max: {fleetRange[1]}</span>
              </div>
              <Slider
                min={50}
                max={1000}
                step={1}
                value={fleetRange}
                onValueChange={(value) => setFleetRange(value as [number, number])}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">
                Tipologia flotta
              </label>
              <select className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30">
                <option value="">Seleziona...</option>
                <option value="autonoleggio">Autonoleggio</option>
                <option value="trattori">Trattori stradali</option>
                <option value="furgonoleggio">Furgonoleggio</option>
                <option value="altro">Altro</option>
              </select>
            </div>
            <Button className="mt-2 h-10 text-xs uppercase tracking-[0.2em]">
              Invia richiesta
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
