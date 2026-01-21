import React from "react";
import { Button } from "../components/ui/button";
import { HomeNavbar } from "../components/home-navbar";

const highlights = [
  {
    title: "Interfaccia intuitiva",
    body: `Niente più drammi per trovare pulsanti.
    Costruita da trasportatori per trasportatori. `,
  },
  {
    title: "Niente più sprechi.",
    body: "Analizza i consumi, ottimizza le tratte, rileva rifornimenti e prelievi tutto in tempo reale. ",
  },
  {
    title: "Niente più carte volanti",
    body: "Con Truckly tutti i tuoi documenti sono in ordine.",
  },
  {
    title: "Personalizza, dormi sereno.",
    body: "Con gli alert personalizzati, potenziati ad intelligenza artificiale, porterai il tuo fleet management ad un livello successivo.",
  },
];

export function HomePage() {
  return (
    <div className="truckly-home min-h-screen bg-[#0a0a0a] text-white">
      <div className="relative overflow-hidden">
        <div className="truckly-home__glow" aria-hidden="true" />
        <div className="truckly-home__grid" aria-hidden="true" />

        <HomeNavbar />

        <section
          className="relative z-10 mx-auto grid w-full max-w-6xl gap-12 px-6 pb-16 pt-10 md:grid-cols-[1.2fr_0.8fr]"
          id="piattaforma"
        >
          <div className="space-y-6">
            <h1 className="truckly-hero-title truckly-fade-up">
              La piattaforma semplice per gestire la tua flotta.
            </h1>            
            <div className="flex flex-wrap gap-3 truckly-fade-up">
              <Button className="h-10 px-5 text-xs uppercase tracking-[0.2em]">
                Richiedi accesso
              </Button>
              <a
                href="/login"
                className="inline-flex h-10 items-center rounded-full border border-white/15 px-5 text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white hover:border-white/40 transition"
              >
                Entra ora
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="truckly-hero-art truckly-fade-up">
              <div className="truckly-hero-art__glow" />
              <div className="truckly-hero-art__orbit truckly-hero-art__orbit--one" />
              <div className="truckly-hero-art__orbit truckly-hero-art__orbit--two" />
              <div className="truckly-hero-art__ring" />
              <div className="truckly-hero-art__ring truckly-hero-art__ring--alt" />
              <div className="truckly-hero-art__satellite">
                <span className="truckly-hero-art__satellite-dot" />
                <span className="truckly-hero-art__satellite-label">Orbita live</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16" id="funzioni">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/50">
              Funzioni chiave
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold mt-2">
              Tutto quello che serve, a portata di mano.
            </h2>
          </div>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {highlights.map((item, index) => (
            <div
              key={item.title}
              className="truckly-card truckly-fade-up"
              style={{ animationDelay: `${index * 0.08}s` }}
            >
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="text-sm text-white/60">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16" id="integrazioni">
        <div className="truckly-slab">
          <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
            <div className="truckly-agent-copy">
              <div className="truckly-agent-phrase-wrap" aria-hidden="true">
                <div className="truckly-agent-phrase">
                  <span className="truckly-agent-phrase__lead">Chiedi</span>
                  <span className="truckly-agent-phrase__accent">e ti sar&agrave; dato.</span>
                </div>
              </div>
            </div>
            <div className="truckly-agent">
              <h3 className="truckly-agent__title">Piacere, Nate.</h3>
              <p className="truckly-agent__text">
                Nate risponde alle tue domande e ti guida nelle azioni. Report,
                audit, eventi e attivita: basta chiedere.
              </p>
              <div className="truckly-agent__bubble">
                <span className="truckly-agent__label">Tu:</span>
                <span>Fammi il report della settimana</span>
              </div>
              <div className="truckly-agent__bubble truckly-agent__bubble--accent">
                <span className="truckly-agent__label">Nate:</span>
                <span>Fatto. Ho preparato il riepilogo e le anomalie.</span>
              </div>
              <Button className="h-10 px-5 text-xs uppercase tracking-[0.2em]">
                Chiedi a Nate
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-20" id="sicurezza">
        <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr]">
          <div className="truckly-card">
            <p className="text-xs uppercase tracking-[0.28em] text-white/50">
              Sicurezza
            </p>
            <h3 className="text-xl font-semibold mt-2">
              Accessi semplici, tutto al sicuro.
            </h3>
            <p className="text-sm text-white/60 mt-3">
              Decidi chi puo vedere cosa, con tracciamenti chiari e cronologia
              pronta quando serve.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-white/50">
              <span className="truckly-chip">Ruoli</span>
              <span className="truckly-chip">Audit</span>
              <span className="truckly-chip">Report</span>
            </div>
          </div>
          <div className="truckly-card truckly-card--accent">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.28em] text-white/60">
                Operativita 24/7
              </p>
              <span className="truckly-dot truckly-dot--accent" />
            </div>
            <h3 className="text-xl font-semibold mt-3">
              Veloce, stabile, pensato per chi lavora sul campo.
            </h3>
            <p className="text-sm text-white/70 mt-3">
              Meno clic, piu tempo alla flotta. Tutto risponde subito e si
              capisce al primo sguardo.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 text-sm text-white/70">
              <div className="truckly-stat">
                <span>Risposte rapide</span>
                <strong>Immediato</strong>
              </div>
              <div className="truckly-stat">
                <span>Aggiornamento live</span>
                <strong>Continuo</strong>
              </div>
              <div className="truckly-stat">
                <span>Visibilita mezzi</span>
                <strong>Sempre chiara</strong>
              </div>
              <div className="truckly-stat">
                <span>Eventi critici</span>
                <strong>In tempo reale</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-8 text-xs text-white/50">
          <div className="flex items-center gap-3">
            <img
              src="/assets/images/logo_white.png"
              alt="Truckly"
              className="h-6 w-auto"
              loading="lazy"
            />
            <span>Truckly (c) 2026</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/login" className="hover:text-white transition">
              Accesso piattaforma
            </a>
            <a href="#" className="hover:text-white transition">
              Privacy
            </a>
            <a href="#" className="hover:text-white transition">
              Contatti
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
