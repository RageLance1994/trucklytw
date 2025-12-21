import React from "react";

type DriverBottomBarProps = {
  isOpen: boolean;
  onClose?: () => void;
  selectedDriverImei?: string | null;
};

type DayGraph = {
  date?: string;
  graph?: string;
  metrics?: Record<string, any>;
  activities?: Array<Record<string, any>>;
  infringements?: Array<Record<string, any>>;
};

const formatDateLabel = (value?: string) => {
  if (!value) return "Data non disponibile";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const toDurationLabel = (value: any) => {
  if (value == null) return "00h00";
  if (typeof value === "string") return value;
  const num = Number(value);
  if (!Number.isFinite(num)) return "00h00";
  const minutes = num > 1000 ? Math.round(num / 60) : Math.round(num);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}h${pad(mins)}`;
};

export function DriverBottomBar({
  isOpen,
  onClose,
  selectedDriverImei,
}: DriverBottomBarProps) {
  const [driverId, setDriverId] = React.useState("196301e2-2010-4f42-a405-5e6ce839c101");
  const [startDate, setStartDate] = React.useState("2025-10-25T00:00");
  const [endDate, setEndDate] = React.useState("2025-10-26T23:59");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [days, setDays] = React.useState<DayGraph[]>([]);
  const [hoveredDay, setHoveredDay] = React.useState<DayGraph | null>(null);
  const [hoverPos, setHoverPos] = React.useState({ x: 0, y: 0 });
  const [hoverBounds, setHoverBounds] = React.useState({ width: 0, height: 0 });
  const [expandedActivityDays, setExpandedActivityDays] = React.useState<Record<string, boolean>>({});

  const runTest = async () => {
    setError(null);
    setLoading(true);
    try {
      const toIso = (value: string) => {
        if (!value) return value;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
      };

      const body = {
        driverId,
        startDate: toIso(startDate),
        endDate: toIso(endDate),
        timezone: "UTC",
        regulation: 0,
        penalty: 0,
        onlyInfringementsGraphs: false,
        ignoreCountrySelectedInfringements: false,
      };

      const res = await fetch("/api/seep/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const weeks = data?.analysis?.activityAnalysis?.weeks || [];
      const flatDays: DayGraph[] = [];
      weeks.forEach((week: any) => {
        (week?.days || []).forEach((day: any) => {
          if (day?.graph) {
            flatDays.push({
              date: day.date,
              graph: day.graph,
              metrics: day.metrics,
              activities: day.activities,
              infringements: day.infringements,
            });
          }
        });
      });

      setDays(flatDays);
      setExpandedActivityDays({});
      if (!flatDays.length) {
        setError("Nessun grafico SVG restituito (verifica driverId e date).");
      }
    } catch (err: any) {
      setError(err?.message || "Errore nella richiesta SeepTrucker");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      className={`fixed left-0 right-0 bottom-0 z-40 h-[75vh] border-t border-white/10 bg-[#0e0f14] text-[#f8fafc] flex flex-col shadow-[0_-24px_60px_rgba(0,0,0,0.45)] backdrop-blur truckly-bottom-bar transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isOpen ? "translate-y-0" : "hidden-bottom"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-start justify-between px-6 py-4 border-b border-white/10">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Bottom bar</p>
          <h2 className="text-lg font-semibold leading-tight text-white">
            Driver activity + tables
          </h2>
          <p className="text-sm text-white/70">
            Tabella driver e report attivita. Selezione attuale:{" "}
            {selectedDriverImei || "nessuna"}
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

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-[#0e0f14]">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
                  Driver activity chart
                </p>
                <p className="text-sm text-white/60">
                  Report attivita e dettagli giornalieri.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.08em] text-white/65">
                  Driver ID
                </label>
                <input
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  placeholder="UUID del driver (es. da /api/drivers)"
                  className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.08em] text-white/65">
                  Start
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.08em] text-white/65">
                  End
                </label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={runTest}
                disabled={loading}
                className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm font-medium hover:bg-white/15 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Caricamento..." : "Genera grafico di test"}
              </button>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>

            {days.length > 0 && (
              <div className="space-y-4">
                {days.map((day) => {
                  const isHovered = hoveredDay?.date === day.date;
                  const tooltipWidth = 240;
                  const tooltipHeight = 220;
                  const left = Math.min(
                    Math.max(hoverPos.x + 16, 16),
                    Math.max(16, hoverBounds.width - tooltipWidth - 16),
                  );
                  const top = Math.min(
                    Math.max(hoverPos.y + 16, 16),
                    Math.max(16, hoverBounds.height - tooltipHeight - 16),
                  );

                  const dayKey = day.date || "day-0";
                  const isExpanded = !!expandedActivityDays[dayKey];

                  return (
                    <div
                      key={dayKey}
                      className="rounded-xl border border-white/10 bg-[#0c0f16] p-3 space-y-3"
                    >
                      <div
                        className="relative rounded-lg border border-white/10 bg-[#0b0d14] p-3 hover:border-white/30 transition"
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                        onMouseMove={(e) => {
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                          setHoverBounds({ width: rect.width, height: rect.height });
                          setHoverPos({
                            x: e.clientX - rect.left,
                            y: e.clientY - rect.top,
                          });
                        }}
                      >
                        <div className="text-xs text-white/60">{formatDateLabel(day.date)}</div>
                        <div
                          className="mt-2 w-full overflow-hidden"
                          dangerouslySetInnerHTML={{ __html: day.graph || "" }}
                        />
                        {isHovered && (
                          <div className="absolute inset-2 border-2 border-black/80 rounded-lg pointer-events-none" />
                        )}
                        {isHovered && (
                          <div
                            className="absolute z-50 w-60 rounded-lg border border-white/10 bg-[#0e0f14] text-[#f8fafc] shadow-xl pointer-events-none"
                            style={{ left, top }}
                          >
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2 text-sm">
                              <span className="font-semibold text-white/70">Attivita</span>
                              <span className="font-semibold text-white/70 text-right">Tempo</span>
                              <span>Guida</span>
                              <span className="text-right">{toDurationLabel(day.metrics?.totalDriving)}</span>
                              <span>Altri lavori</span>
                              <span className="text-right">{toDurationLabel(day.metrics?.totalWork)}</span>
                              <span>Disponibilita</span>
                              <span className="text-right">{toDurationLabel(day.metrics?.totalAvailable)}</span>
                              <span>Riposo</span>
                              <span className="text-right">{toDurationLabel(day.metrics?.totalBreak)}</span>
                              <span>Sconosciuto</span>
                              <span className="text-right">{toDurationLabel(day.metrics?.totalUnknown)}</span>
                              <span>Ampiezza</span>
                              <span className="text-right">{toDurationLabel(day.metrics?.totalAmplitude)}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {day.activities && day.activities.length > 0 && (
                        <div className="border-t border-white/10 pt-3 space-y-2 text-sm">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedActivityDays((prev) => ({
                                ...prev,
                                [dayKey]: !prev[dayKey],
                              }))
                            }
                            className="flex w-full items-center justify-between text-xs uppercase tracking-[0.08em] text-white/70 hover:text-white transition"
                          >
                            <span>Elenco attivita</span>
                            <span className="text-[10px] tracking-[0.2em]">
                              {isExpanded ? "CHIUDI" : "APRI"}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="space-y-1">
                              {day.activities.map((activity, idx) => (
                                <div
                                  key={`${activity.startDateTime || idx}`}
                                  className="flex items-center justify-between text-white/80"
                                >
                                  <span>{activity.activityType || "Attivita"}</span>
                                  <span className="text-white/60">
                                    {toDurationLabel(activity.duration)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            <TableCard
              title="Tables baseline"
              subtitle="Sezione base per report tabellari."
              rows={[
                ["Driver status", "Da definire"],
                ["Ultimo evento", "Da definire"],
                ["Allarmi attivi", "Da definire"],
              ]}
            />
            <TableCard
              title="Table-like info"
              subtitle="Metriche e riepiloghi rapidi."
              rows={[
                ["Km oggi", "--"],
                ["Guida", "--"],
                ["Riposo", "--"],
                ["Disponibilita", "--"],
              ]}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}

function TableCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="space-y-1">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">{title}</p>
        <p className="text-sm text-white/60">{subtitle}</p>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-sm text-white/80 min-w-0"
          >
            <span className="truncate">{label}</span>
            <span className="text-white/60 whitespace-nowrap">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
