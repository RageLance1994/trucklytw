import React from "react";

type DriverSidebarProps = {
  isOpen: boolean;
  onClose?: () => void;
  selectedDriverImei?: string | null;
};

type SectionProps = {
  title: string;
  body: React.ReactNode;
};

type CounterBarProps = {
  title: string;
  totalLabel: string;
  remainingLabel: string;
  remainingPct: number;
  accentClass: string;
};

export function DriverSidebar({
  isOpen,
  onClose,
  selectedDriverImei,
}: DriverSidebarProps) {
  const counterBars: CounterBarProps[] = [
    {
      title: "Guida residua",
      totalLabel: "Totale 9h",
      remainingLabel: "Residua 2h",
      remainingPct: 22,
      accentClass: "bg-orange-500",
    },
    {
      title: "Impegno residuo",
      totalLabel: "Totale 13h",
      remainingLabel: "Residua 4h",
      remainingPct: 31,
      accentClass: "bg-sky-700",
    },
    {
      title: "Riposo residuo",
      totalLabel: "Totale 11h",
      remainingLabel: "Residua 7h",
      remainingPct: 64,
      accentClass: "bg-emerald-500",
    },
  ];

  return (
    <aside
      className={`fixed top-0 bottom-0 right-0 z-40 w-[520px] max-w-lg border-l border-white/10 bg-[#0e0f14] text-[#f8fafc] flex flex-col pt-16 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur truckly-sidebar transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isOpen ? "translate-x-0" : "hidden-right"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-start justify-between px-5 py-5 border-b border-white/10">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Pannello</p>
          <h2 className="text-xl font-semibold leading-tight text-white">Autista</h2>
          <p className="text-sm text-white/70">
            Seleziona un autista dal tooltip del mezzo per vedere i dettagli qui.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs h-8 rounded-full border border-white/20 px-3 text-white/75 hover:text-white hover:border-white/50 transition"
          >
            Chiudi
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden px-4 py-5 space-y-4 bg-[#0e0f14]">
        <Section
          title="Stato selezione"
          body={
            selectedDriverImei
              ? `Autista selezionato: ${selectedDriverImei}`
              : "Nessun autista selezionato."
          }
        />
        <div className="rounded-2xl border border-white/10 bg-[#10121a] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">Stato guida</p>
          </div>
          <div className="px-4 pb-4 space-y-4">
            {counterBars.map((bar) => (
              <CounterBar key={bar.title} {...bar} />
            ))}
          </div>
        </div>
        <Section title="Informazioni generali" body="Nome, patente, e anagrafica verranno mostrati qui." />
        <Section title="Contatti" body="Email, telefono e note mostreranno qui." />
        <Section
          title="Stato & disponibilitÇÿ"
          body="Turni, disponibilitÇÿ e eventi recenti compariranno qui."
        />
        <Section
          title="Report attivita"
          body={
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("truckly:bottom-bar-toggle", {
                    detail: { mode: "driver" },
                  }),
                )
              }
              className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition"
            >
              Report Attività
            </button>
          }
        />
      </div>
    </aside>
  );
}

function Section({ title, body }: SectionProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#10121a] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">{title}</p>
      </div>
      <div className="px-4 pb-4">
        <div className="rounded-xl border border-white/8 bg-[#0c0f16] px-3.5 py-3 text-sm text-white/85 shadow-inner shadow-black/40">
          {body}
        </div>
      </div>
    </div>
  );
}

function CounterBar({
  title,
  totalLabel,
  remainingLabel,
  remainingPct,
  accentClass,
}: CounterBarProps) {
  const safeRemaining = Math.min(100, Math.max(0, remainingPct));
  const usedPct = 100 - safeRemaining;

  return (
    <div className="space-y-2">
      <div className="text-base font-medium text-white">{title}</div>
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>{totalLabel}</span>
        <span>{remainingLabel}</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-md bg-white/10">
        <div className="flex h-full w-full">
          <div className="h-full bg-white/10" style={{ width: `${usedPct}%` }} />
          <div className={`h-full ${accentClass}`} style={{ width: `${safeRemaining}%` }} />
        </div>
      </div>
    </div>
  );
}
