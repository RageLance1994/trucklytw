import React from "react";
import { dataManager, resolveBackendBaseUrl } from "../lib/data-manager";

type BottomBarMode = "driver" | "fuel" | "tacho";

type DriverBottomBarProps = {
  isOpen: boolean;
  onClose?: () => void;
  selectedDriverImei?: string | null;
  selectedVehicleImei?: string | null;
  selectedVehicle?: FuelVehicle | null;
  mode: BottomBarMode;
};

type DayGraph = {
  date?: string;
  graph?: string;
  metrics?: Record<string, any>;
  activities?: Array<Record<string, any>>;
  infringements?: Array<Record<string, any>>;
};

type FuelEvent = {
  eventId?: string;
  start?: number;
  end?: number;
  liters?: number | null;
  delta?: number | null;
  normalizedType?: string;
  type?: string;
  startFuel?: number | null;
  endFuel?: number | null;
  isRefuel?: boolean;
  isWithdrawal?: boolean;
};

type RefuelingDoc = {
  eventId: string;
  eventStart?: string | number | Date;
  eventEnd?: string | number | Date;
  liters?: number | null;
  pricePerUnit?: number | null;
  tankPrimary?: number | null;
  tankSecondary?: number | null;
  station?: string | null;
  invoiceRef?: string | null;
  metadata?: Record<string, any>;
  attachments?: Array<{ name: string; mimeType: string; size: number }>;
};

type FuelTableRow = {
  eventId: string;
  start: number;
  end: number;
  liters: number | null;
  type: "refuel" | "withdrawal";
  source: "detected" | "manual";
  refuelDoc?: RefuelingDoc;
  detectedEvent?: FuelEvent;
};

type RefuelSavePayload = {
  eventId: string;
  start: number;
  end: number;
  liters: number | null;
  type: "refuel" | "withdrawal";
  station: string;
  invoiceRef: string;
  pricePerUnit: number | null;
  tankPrimary: number | null;
  tankSecondary: number | null;
  notes: string;
  source: "detected" | "manual";
  hidden?: boolean;
  attachments: File[];
};

type FuelSample = {
  ts: number;
  liters: number | null;
  tank1: number | null;
  tank2: number | null;
  speed: number | null;
};

type FuelVehicle = {
  details?: {
    tanks?: {
      primary?: { capacity?: number | null };
      secondary?: { capacity?: number | null };
      unit?: string;
    };
  };
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
  if (value == null) return "0 ore e 0 minuti";
  let minutes: number | null = null;

  if (typeof value === "number") {
    minutes = value > 1000 ? Math.round(value / 60) : Math.round(value);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    const hmMatch = trimmed.match(/^(\d+)\s*h\s*(\d+)?/i);
    const colonMatch = trimmed.match(/^(\d+)\s*:\s*(\d+)\s*$/);

    if (hmMatch) {
      const hours = Number(hmMatch[1] || 0);
      const mins = Number(hmMatch[2] || 0);
      minutes = hours * 60 + mins;
    } else if (colonMatch) {
      const hours = Number(colonMatch[1] || 0);
      const mins = Number(colonMatch[2] || 0);
      minutes = hours * 60 + mins;
    } else if (/^\d+$/.test(trimmed)) {
      minutes = Number(trimmed);
    } else {
      return value;
    }
  } else {
    return "0 ore e 0 minuti";
  }

  if (!Number.isFinite(minutes)) return "0 ore e 0 minuti";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const hourLabel = hours === 1 ? "ora" : "ore";
  const minLabel = mins === 1 ? "minuto" : "minuti";
  return `${hours} ${hourLabel} e ${mins} ${minLabel}`;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const toLocalInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toIso = (value: string) => {
  if (!value) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const toFiniteNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toTimestamp = (value: unknown) => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const formatShortDateTime = (value?: number) => {
  if (!Number.isFinite(value)) return "N/D";
  return new Date(value as number).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatLiters = (value?: number | null) => {
  if (!Number.isFinite(value)) return "--";
  const abs = Math.abs(value as number);
  const precision = abs >= 100 ? 0 : 1;
  return `${(value as number).toFixed(precision)} L`;
};

const getTankCapacity = (vehicle?: FuelVehicle | null) => {
  const primary = Number(vehicle?.details?.tanks?.primary?.capacity) || 0;
  const secondary = Number(vehicle?.details?.tanks?.secondary?.capacity) || 0;
  const total = primary + secondary;
  return total > 0 ? total : null;
};

const buildManualEventId = () =>
  `manual-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const normalizeRefuelings = (items: any[] = []): RefuelingDoc[] => {
  return items
    .map((doc) => {
      const eventId = String(doc?.eventId || "").trim();
      if (!eventId) return null;
      return {
        eventId,
        eventStart: doc?.eventStart,
        eventEnd: doc?.eventEnd,
        liters: toFiniteNumber(doc?.liters),
        pricePerUnit: toFiniteNumber(doc?.pricePerUnit),
        tankPrimary: toFiniteNumber(doc?.tankPrimary),
        tankSecondary: toFiniteNumber(doc?.tankSecondary),
        station: typeof doc?.station === "string" ? doc.station : null,
        invoiceRef: typeof doc?.invoiceRef === "string" ? doc.invoiceRef : null,
        metadata: doc?.metadata && typeof doc.metadata === "object" ? doc.metadata : {},
        attachments: Array.isArray(doc?.attachments) ? doc.attachments : [],
      } as RefuelingDoc;
    })
    .filter(Boolean) as RefuelingDoc[];
};

const resolveRefuelType = (doc?: RefuelingDoc, evt?: FuelEvent) => {
  const metaType = String(doc?.metadata?.type || "").toLowerCase().trim();
  if (metaType === "withdrawal" || metaType === "prelievo") return "withdrawal";
  if (metaType === "refuel" || metaType === "rifornimento") return "refuel";
  if (evt?.isWithdrawal) return "withdrawal";
  if (evt?.isRefuel) return "refuel";
  const liters = doc?.liters ?? evt?.liters ?? evt?.delta;
  if (Number.isFinite(liters) && (liters as number) < 0) return "withdrawal";
  return "refuel";
};


const normalizeFuelEvents = (events: any[] = []): FuelEvent[] => {
  return events
    .map((evt, idx) => {
      const start = toTimestamp(evt?.start ?? evt?.startMs ?? evt?.startTs);
      const end = toTimestamp(evt?.end ?? evt?.endMs ?? evt?.endTs ?? start);
      if (!Number.isFinite(start)) return null;
      const normalizedTypeRaw = String(evt?.normalizedType ?? evt?.type ?? "")
        .toLowerCase()
        .trim();
      const normalizedType =
        normalizedTypeRaw === "rifornimento" ? "refuel" : normalizedTypeRaw;
      const isRefuel = normalizedType === "refuel";
      const isWithdrawal =
        normalizedType === "withdrawal" ||
        normalizedType === "fuel_withdrawal" ||
        normalizedType === "prelievo" ||
        normalizedType === "fuel-theft" ||
        normalizedType === "theft";

      return {
        eventId: evt?.eventId || evt?._id || `evt-${idx}`,
        start: start as number,
        end: Number.isFinite(end) ? (end as number) : (start as number),
        liters: toFiniteNumber(evt?.liters ?? evt?.delta),
        delta: toFiniteNumber(evt?.delta),
        startFuel: toFiniteNumber(evt?.startFuel),
        endFuel: toFiniteNumber(evt?.endFuel),
        normalizedType,
        type: evt?.type,
        isRefuel,
        isWithdrawal,
      } as FuelEvent;
    })
    .filter(Boolean)
    .sort((a, b) => (a?.start || 0) - (b?.start || 0)) as FuelEvent[];
};

let echartsLoader: Promise<any> | null = null;

const loadECharts = () => {
  if (typeof window === "undefined") return Promise.resolve(null);
  const win = window as any;
  if (win.echarts) return Promise.resolve(win.echarts);
  if (echartsLoader) return echartsLoader;
  echartsLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-echarts]");
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).echarts));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js";
    script.async = true;
    script.defer = true;
    script.dataset.echarts = "true";
    script.onload = () => resolve((window as any).echarts);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return echartsLoader;
};

const extractSamples = (history: any): FuelSample[] => {
  const source = Array.isArray(history?.raw)
    ? history.raw
    : Array.isArray(history?.data)
      ? history.data
      : Array.isArray(history)
        ? history
        : [];

  const samples = source
    .map((entry: any) => {
      const io = entry?.io || entry;
      const ts = toTimestamp(entry?.timestamp ?? entry?.ts ?? io?.timestamp ?? io?.ts);
      if (!Number.isFinite(ts)) return null;

      const litersCandidates = [
        io.current_fuel,
        io.currentFuel,
        io.fuel_total,
        io.fuel,
        io.tank,
        io.tankLiters,
        io.value,
        io.liters,
      ];
      let liters: number | null = null;
      for (const cand of litersCandidates) {
        const n = toFiniteNumber(cand);
        if (Number.isFinite(n)) {
          liters = n;
          break;
        }
      }

      const tank1 = toFiniteNumber(
        io.tank1 ?? io.tank_1 ?? io.tankPrimary ?? io.primaryTankCapacity,
      );
      const tank2 = toFiniteNumber(
        io.tank2 ?? io.tank_2 ?? io.tankSecondary ?? io.secondaryTankCapacity,
      );
      const speedCandidates = [
        io.vehicleSpeed,
        io.speed,
        io.vehicle_speed,
        entry?.gps?.Speed,
        entry?.gps?.speed,
      ];
      let speed: number | null = null;
      for (const cand of speedCandidates) {
        const n = toFiniteNumber(cand);
        if (Number.isFinite(n)) {
          speed = n;
          break;
        }
      }

      if (
        !Number.isFinite(liters)
        && !Number.isFinite(tank1)
        && !Number.isFinite(tank2)
        && !Number.isFinite(speed)
      ) {
        return null;
      }

      return {
        ts: ts as number,
        liters: Number.isFinite(liters) ? liters : null,
        tank1: Number.isFinite(tank1) ? tank1 : null,
        tank2: Number.isFinite(tank2) ? tank2 : null,
        speed: Number.isFinite(speed) ? speed : null,
      };
    })
    .filter(Boolean)
    .sort((a: FuelSample, b: FuelSample) => a.ts - b.ts) as FuelSample[];

  return samples;
};

const smoothSeriesArray = (series: Array<[number, number]>, windowSize = 5) => {
  if (!Array.isArray(series) || series.length <= 2) return series;
  const w = Math.max(1, Math.floor(windowSize));
  const half = Math.floor(w / 2);
  return series.map((point, idx) => {
    const start = Math.max(0, idx - half);
    const end = Math.min(series.length - 1, idx + half);
    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i += 1) {
      const v = series[i][1];
      if (Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    const avg = count ? sum / count : point[1];
    return [point[0], avg] as [number, number];
  });
};

const buildFuelSeries = (samples: FuelSample[]) => {
  const fuel = samples
    .map((s) => [s.ts, toFiniteNumber(s.liters)] as [number, number | null])
    .filter(([, v]) => Number.isFinite(v))
    .map(([ts, v]) => [ts, v as number] as [number, number]);
  const tank1 = samples
    .map((s) => [s.ts, toFiniteNumber(s.tank1)] as [number, number | null])
    .filter(([, v]) => Number.isFinite(v))
    .map(([ts, v]) => [ts, v as number] as [number, number]);
  const tank2 = samples
    .map((s) => [s.ts, toFiniteNumber(s.tank2)] as [number, number | null])
    .filter(([, v]) => Number.isFinite(v))
    .map(([ts, v]) => [ts, v as number] as [number, number]);
  const speed = samples
    .map((s) => [s.ts, toFiniteNumber(s.speed)] as [number, number | null])
    .filter(([, v]) => Number.isFinite(v))
    .map(([ts, v]) => [ts, v as number] as [number, number]);
  const smoothedFuel = smoothSeriesArray(fuel, Math.max(3, Math.round(fuel.length / 200)));
  return { fuel: smoothedFuel, tank1, tank2, speed };
};

export function DriverBottomBar({
  isOpen,
  onClose,
  selectedDriverImei,
  selectedVehicleImei,
  selectedVehicle,
  mode,
}: DriverBottomBarProps) {
  const title =
    mode === "fuel"
      ? "Dashboard carburante"
      : mode === "tacho"
        ? "Scarico dati"
        : "Attivita autista + tabelle";
  const subtitle =
    mode === "fuel"
      ? `Veicolo attivo: ${selectedVehicleImei || "nessuno"}`
      : mode === "tacho"
        ? "Elenco file .ddd disponibili dal servizio Teltonika."
        : `Tabella autisti e report attivita. Selezione attuale: ${
            selectedDriverImei || "nessuna"
          }`;

  return (
    <aside
      className={`fixed left-0 right-0 bottom-0 z-40 h-[calc(100dvh-64px)] min-h-[calc(100vh-64px)] border-t border-white/10 bg-[#0a0a0a] text-[#f8fafc] flex flex-col pt-[env(safe-area-inset-top)] shadow-[0_-24px_60px_rgba(0,0,0,0.45)] backdrop-blur truckly-bottom-bar transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:h-[75vh] ${
        isOpen ? "translate-y-0" : "hidden-bottom"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-start justify-between px-6 py-4 border-b border-white/10">
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold leading-tight text-white">{title}</h2>
          <p className="text-sm text-white/70">{subtitle}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs h-8 w-8 rounded-full border border-white/20 text-white/75 hover:text-white hover:border-white/50 transition inline-flex items-center justify-center"
            aria-label="Chiudi"
          >
            <i className="fa fa-close" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-[#0a0a0a]">
        {mode === "fuel" ? (
          <FuelDashboard
            isOpen={isOpen}
            selectedVehicleImei={selectedVehicleImei}
            selectedVehicle={selectedVehicle}
          />
        ) : mode === "tacho" ? (
          <TachoFilesDashboard isOpen={isOpen} />
        ) : (
          <DriverDashboard selectedDriverImei={selectedDriverImei} />
        )}
      </div>
    </aside>
  );
}

function TachoFilesDashboard({ isOpen }: { isOpen: boolean }) {
  const [files, setFiles] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const fetchFiles = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = resolveBackendBaseUrl();
      const query = new URLSearchParams();
      if (search.trim().length >= 3) {
        query.set("contains", search.trim());
      }
      const res = await fetch(
        `${baseUrl}/api/tacho/files${query.toString() ? `?${query}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFiles(Array.isArray(data?.items) ? data.items : []);
    } catch (err: any) {
      setError(err?.message || "Errore durante il caricamento.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    if (!isOpen) return;
    fetchFiles();
  }, [fetchFiles, isOpen]);

  const baseUrl = resolveBackendBaseUrl();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#121212] p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
              File disponibili
            </p>
            <p className="text-sm text-white/60">
              Scarica i file .ddd da Teltonika per autisti e veicoli.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchFiles}
            className="h-8 rounded-full border border-white/15 bg-white/5 px-4 text-[11px] uppercase tracking-[0.2em] text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            {loading ? "Aggiorno..." : "Aggiorna"}
          </button>
        </div>

        <div className="flex items-center justify-end">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtra per nome file..."
            className="w-full sm:w-56 rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="rounded-xl border border-white/10 bg-[#0d0d0f] overflow-hidden">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/55">
            <span>File</span>
            <span>Origine</span>
            <span>Riferimento</span>
            <span>Azienda</span>
            <span>Download</span>
            <span className="text-right">Azioni</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {files.length === 0 && !loading ? (
              <div className="px-3 py-3 text-xs text-white/60">
                Nessun file disponibile.
              </div>
            ) : (
              files.map((file) => {
                const sourceLabel = file?.source === "driver" ? "Autista" : "Veicolo";
                const refLabel =
                  file?.source === "driver"
                    ? file?.driver?.driverName || file?.driver?.cardNumber || "--"
                    : file?.vehicle?.number || file?.vehicle?.imei || "--";
                const companyLabel = file?.company?.name || "--";
                const name = file?.fileName || "file.ddd";
                const downloadTs = toTimestamp(file?.downloadTime);
                const downloadUrl = `${baseUrl}/api/tacho/files/download?source=${encodeURIComponent(
                  file?.source || "vehicle",
                )}&id=${encodeURIComponent(file?.id || "")}&name=${encodeURIComponent(name)}`;
                return (
                  <div
                    key={file?.id}
                    className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] gap-2 px-3 py-2 text-xs text-white/80 border-t border-white/10"
                  >
                    <span className="truncate">{name}</span>
                    <span className="text-white/60">{sourceLabel}</span>
                    <span className="truncate text-white/70">{refLabel}</span>
                    <span className="truncate text-white/60">{companyLabel}</span>
                    <span className="text-white/60">
                      {downloadTs ? formatShortDateTime(downloadTs) : "N/D"}
                    </span>
                    <div className="text-right">
                      <a
                        href={downloadUrl}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 hover:bg-white/10 hover:text-white transition"
                      >
                        Scarica
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverDashboard({
  selectedDriverImei,
}: {
  selectedDriverImei?: string | null;
}) {
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
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-2xl border border-white/10 bg-[#121212] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
              Grafico attivita autista
            </p>
            <p className="text-sm text-white/60">
              Report attivita e dettagli giornalieri. Selezione: {selectedDriverImei || "--"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.08em] text-white/65">
              ID autista
            </label>
            <input
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              placeholder="UUID autista (es. da /api/drivers)"
              className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.08em] text-white/65">
              Inizio
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.08em] text-white/65">
              Fine
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runTest}
            disabled={loading}
            className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm font-medium hover:bg-white/15 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Caricamento..." : "Genera grafico di prova"}
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
                  className="rounded-xl border border-white/10 bg-[#0d0d0f] p-3 space-y-3"
                >
                  <div
                    className="relative rounded-lg border border-white/10 bg-[#0b0d14] p-3 hover:border-white/30 transition overflow-visible"
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
                      className="chart-surface mt-2 w-full overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: day.graph || "" }}
                    />
                    {isHovered && (
                      <div className="absolute inset-2 border-2 border-black/80 rounded-lg pointer-events-none" />
                    )}
                    {isHovered && (
                      <div
                        className="absolute z-50 w-60 rounded-lg border border-white/10 bg-[#0a0a0a] text-[#f8fafc] shadow-xl pointer-events-none"
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
          title="Tabelle base"
          subtitle="Sezione base per report tabellari."
          rows={[
            ["Stato autista", "Da definire"],
            ["Ultimo evento", "Da definire"],
            ["Allarmi attivi", "Da definire"],
          ]}
        />
        <TableCard
          title="Riepilogo"
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
  );
}

function FuelDashboard({
  isOpen,
  selectedVehicleImei,
  selectedVehicle,
}: {
  isOpen: boolean;
  selectedVehicleImei?: string | null;
  selectedVehicle?: FuelVehicle | null;
}) {
  const now = React.useMemo(() => new Date(), []);
  const [startDate, setStartDate] = React.useState(
    toLocalInputValue(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
  );
  const [endDate, setEndDate] = React.useState(toLocalInputValue(now));
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [historyRaw, setHistoryRaw] = React.useState<any[]>([]);
  const [events, setEvents] = React.useState<FuelEvent[]>([]);
  const [refuelings, setRefuelings] = React.useState<RefuelingDoc[]>([]);
  const [refuelingsError, setRefuelingsError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalLoading, setModalLoading] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [activeRow, setActiveRow] = React.useState<FuelTableRow | null>(null);
  const [chartFullscreen, setChartFullscreen] = React.useState(false);

  React.useEffect(() => {
    setHistoryRaw([]);
    setEvents([]);
    setRefuelings([]);
    setError(null);
    setRefuelingsError(null);
    setModalError(null);
    setModalOpen(false);
    setActiveRow(null);
    if (isOpen && selectedVehicleImei) {
      void fetchFuelHistory();
    }
  }, [selectedVehicleImei]);

  const fetchRefuelings = React.useCallback(async () => {
    if (!selectedVehicleImei) {
      setRefuelings([]);
      setRefuelingsError(null);
      return;
    }
    try {
      setRefuelingsError(null);
      const baseUrl = resolveBackendBaseUrl();
      const res = await fetch(`${baseUrl}/dashboard/refuelings/${selectedVehicleImei}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        const txt = await res.text();
        if (txt && txt.trim().startsWith("<")) {
          throw new Error("Sessione non valida o endpoint non disponibile.");
        }
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const payload = await res.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setRefuelings(normalizeRefuelings(items));
    } catch (err: any) {
      setRefuelings([]);
      setRefuelingsError(err?.message || "Errore nel recupero rifornimenti");
    }
  }, [selectedVehicleImei]);

  const fetchFuelHistory = React.useCallback(async () => {
    if (!selectedVehicleImei) {
      setError("Seleziona un veicolo per vedere il carburante.");
      setHistoryRaw([]);
      setEvents([]);
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError("Intervallo non valido.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const data = await dataManager.getHistory(
        selectedVehicleImei,
        toIso(startDate),
        toIso(endDate),
      );
      const raw = Array.isArray(data?.raw) ? data.raw : [];
      const fuelEvents = Array.isArray(data?.fuelEvents) ? data.fuelEvents : [];
      setHistoryRaw(raw);
      setEvents(normalizeFuelEvents(fuelEvents));
      await fetchRefuelings();
    } catch (err: any) {
      setError(err?.message || "Errore nel recupero carburante");
      setHistoryRaw([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedVehicleImei, startDate, endDate, fetchRefuelings]);

  React.useEffect(() => {
    if (!isOpen) return;
    void fetchFuelHistory();
  }, [isOpen, fetchFuelHistory]);

  const openFullscreenChart = React.useCallback(async () => {
    setChartFullscreen(true);
    const docEl = document.documentElement as any;
    if (docEl?.requestFullscreen) {
      try {
        await docEl.requestFullscreen();
      } catch (err) {
        // Ignore fullscreen errors and keep modal open.
      }
    }
    const orientation = (window.screen as any)?.orientation;
    if (orientation?.lock) {
      try {
        await orientation.lock("landscape");
      } catch (err) {
        // Some browsers/devices block orientation lock without user gesture.
      }
    }
  }, []);

  const closeFullscreenChart = React.useCallback(async () => {
    setChartFullscreen(false);
    const orientation = (window.screen as any)?.orientation;
    if (orientation?.unlock) {
      try {
        orientation.unlock();
      } catch (err) {
        // Ignore unlock errors.
      }
    }
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (err) {
        // Ignore exit errors.
      }
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen && chartFullscreen) {
      void closeFullscreenChart();
    }
  }, [isOpen, chartFullscreen, closeFullscreenChart]);

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && chartFullscreen) {
        setChartFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [chartFullscreen]);

  const tableRows = React.useMemo(() => {
    const rows: FuelTableRow[] = [];
    const refuelMap = new Map(refuelings.map((doc) => [doc.eventId, doc]));
    const hiddenIds = new Set(
      refuelings
        .filter((doc) => doc.metadata?.hidden)
        .map((doc) => doc.eventId),
    );

    events.forEach((evt) => {
      const eventId = String(evt.eventId || "").trim();
      if (!eventId || hiddenIds.has(eventId)) return;
      const doc = refuelMap.get(eventId);
      const type = resolveRefuelType(doc, evt);
      const liters = doc?.liters ?? evt.liters ?? evt.delta ?? null;
      rows.push({
        eventId,
        start: evt.start || 0,
        end: evt.end || evt.start || 0,
        liters: Number.isFinite(liters) ? (liters as number) : null,
        type,
        source: "detected",
        refuelDoc: doc,
        detectedEvent: evt,
      });
    });

    refuelings.forEach((doc) => {
      if (doc.metadata?.hidden) return;
      if (events.some((evt) => evt.eventId === doc.eventId)) return;
      const start = toTimestamp(doc.eventStart) || 0;
      const end = toTimestamp(doc.eventEnd) || start;
      rows.push({
        eventId: doc.eventId,
        start,
        end,
        liters: Number.isFinite(doc.liters) ? (doc.liters as number) : null,
        type: resolveRefuelType(doc),
        source: "manual",
        refuelDoc: doc,
      });
    });

    return rows.sort((a, b) => b.start - a.start);
  }, [events, refuelings]);

  const openNewModal = () => {
    const start = toTimestamp(toIso(startDate)) || Date.now();
    const end = toTimestamp(toIso(endDate)) || start;
    setActiveRow({
      eventId: buildManualEventId(),
      start,
      end,
      liters: null,
      type: "refuel",
      source: "manual",
    });
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (row: FuelTableRow) => {
    setActiveRow(row);
    setModalError(null);
    setModalOpen(true);
  };

  const handleSaveRefueling = async (payload: RefuelSavePayload) => {
    if (!selectedVehicleImei) return;
    if (!Number.isFinite(payload.start) || !Number.isFinite(payload.end) || payload.end < payload.start) {
      setModalError("Intervallo evento non valido.");
      return;
    }
    setModalLoading(true);
    setModalError(null);
    try {
      const baseUrl = resolveBackendBaseUrl();
      const formData = new FormData();
      formData.append("imei", selectedVehicleImei);
      formData.append("eventId", payload.eventId);
      formData.append("eventStart", new Date(payload.start).toISOString());
      formData.append("eventEnd", new Date(payload.end).toISOString());
      if (Number.isFinite(payload.liters)) formData.append("liters", String(payload.liters));
      if (Number.isFinite(payload.pricePerUnit)) formData.append("pricePerUnit", String(payload.pricePerUnit));
      if (Number.isFinite(payload.tankPrimary)) formData.append("tankPrimary", String(payload.tankPrimary));
      if (Number.isFinite(payload.tankSecondary)) formData.append("tankSecondary", String(payload.tankSecondary));
      if (payload.station) formData.append("station", payload.station);
      if (payload.invoiceRef) formData.append("invoiceRef", payload.invoiceRef);
      const eventMeta = {
        type: payload.type,
        notes: payload.notes,
        hidden: payload.hidden || false,
      };
      formData.append("eventMeta", JSON.stringify(eventMeta));
      formData.append("source", payload.source);
      payload.attachments.forEach((file) => formData.append("attachments", file));

      const res = await fetch(`${baseUrl}/dashboard/refuelings`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        const txt = await res.text();
        if (txt && txt.trim().startsWith("<")) {
          throw new Error("Sessione non valida o endpoint non disponibile.");
        }
        throw new Error(txt || `HTTP ${res.status}`);
      }
      await fetchRefuelings();
      setModalOpen(false);
      setActiveRow(null);
    } catch (err: any) {
      setModalError(err?.message || "Errore nel salvataggio rifornimento");
    } finally {
      setModalLoading(false);
    }
  };

  const handleHideRow = async (row: FuelTableRow) => {
    if (!selectedVehicleImei) return;
    await handleSaveRefueling({
      eventId: row.eventId,
      start: row.start,
      end: row.end,
      liters: row.liters,
      type: row.type,
      station: row.refuelDoc?.station || "",
      invoiceRef: row.refuelDoc?.invoiceRef || "",
      pricePerUnit: row.refuelDoc?.pricePerUnit ?? null,
      tankPrimary: row.refuelDoc?.tankPrimary ?? null,
      tankSecondary: row.refuelDoc?.tankSecondary ?? null,
      notes: String(row.refuelDoc?.metadata?.notes || ""),
      source: row.source,
      hidden: true,
      attachments: [],
    });
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] min-w-0">
        <div className="rounded-2xl border border-white/10 bg-[#121212] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)] min-w-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
              Grafico carburante
            </p>

            <button
              type="button"
              onClick={openFullscreenChart}
              className="relative mt-3 flex w-full items-center justify-center rounded-lg border border-orange-400/50 bg-orange-500/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-orange-100 transition hover:bg-orange-500/30 sm:hidden"
            >
              <i className="fa fa-chart-bar absolute left-3" aria-hidden="true" />
              Mostra grafico
            </button>
          </div>
          <div className="hidden w-full gap-3 sm:grid sm:w-auto sm:grid-cols-[repeat(2,minmax(0,1fr))_auto] sm:items-end">
            <div className="space-y-1 min-w-0">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Da</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">A</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <button
              onClick={fetchFuelHistory}
              disabled={loading}
              className="h-9 w-full rounded-lg bg-white/10 border border-white/20 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:bg-white/15 transition disabled:opacity-50 sm:w-auto"
            >
              {loading ? "Carico" : "Aggiorna"}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {!error && (
          <div className="hidden rounded-xl border border-white/10 bg-[#0d0d0f] p-4 overflow-hidden relative sm:block">
            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-white/60 sm:h-80 lg:h-[420px]">
                Caricamento carburante...
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openFullscreenChart}
                  className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 backdrop-blur hover:text-white hover:border-white/40 transition"
                >
                  Mostra a tutto schermo
                </button>
                <FuelEChart
                  key={selectedVehicleImei || "no-vehicle"}
                  historyRaw={historyRaw}
                  events={events}
                  tankCapacity={getTankCapacity(selectedVehicle)}
                />
              </>
            )}
          </div>
        )}
      </div>

        <div className="rounded-2xl border border-white/10 bg-[#121212] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)] flex flex-col min-w-0 overflow-x-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
              Eventi rifornimento / prelievo
            </p>
            <p className="text-sm text-white/60">
              {tableRows.length} eventi nel periodo selezionato.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewModal}
            className="h-9 w-full rounded-lg bg-white/10 border border-white/20 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:bg-white/15 transition sm:w-auto"
          >
            Nuovo evento
          </button>
        </div>

        {refuelingsError && (
          <p className="mt-3 text-sm text-red-400">{refuelingsError}</p>
        )}

        <div className="mt-4 max-w-full min-w-0 overflow-x-hidden">
          {loading ? (
            <div className="rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-4 text-sm text-white/60">
              Caricamento eventi carburante...
            </div>
          ) : tableRows.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-4 text-sm text-white/60">
              Nessun evento disponibile per questo intervallo.
            </div>
          ) : (
            <div className="block w-full max-w-full min-w-0 overflow-x-auto">
              <table className="min-w-[760px] w-full border-separate border-spacing-0 text-sm text-white/80">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-white/45">
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">Inizio</th>
                    <th className="text-left px-3 py-2">Fine</th>
                    <th className="text-left px-3 py-2">Litri</th>
                    <th className="text-left px-3 py-2">Origine</th>
                    <th className="text-left px-3 py-2">Documenti</th>
                    <th className="text-right px-3 py-2">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => {
                    const label = row.type === "withdrawal" ? "Prelievo" : "Rifornimento";
                    const tone = row.type === "withdrawal" ? "text-red-300" : "text-emerald-300";
                    const docs = row.refuelDoc?.attachments?.length || 0;
                    return (
                      <tr key={row.eventId} className="border-t border-white/5">
                        <td className={`px-3 py-2 font-semibold ${tone}`}>{label}</td>
                        <td className="px-3 py-2">{formatShortDateTime(row.start)}</td>
                        <td className="px-3 py-2">{formatShortDateTime(row.end)}</td>
                        <td className="px-3 py-2">{formatLiters(row.liters)}</td>
                        <td className="px-3 py-2">
                          {row.source === "manual" ? "Manuale" : "Rilevato"}
                        </td>
                        <td className="px-3 py-2">{docs ? `${docs} file` : "--"}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(row)}
                              className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/80 hover:text-white hover:border-white/40 transition"
                            >
                              Dettagli
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHideRow(row)}
                              className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/60 hover:text-white hover:border-white/30 transition"
                            >
                              {row.source === "manual" ? "Elimina" : "Nascondi"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </div>
      {chartFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/95 text-white">
          <div className="flex h-full w-full flex-col">
            <div className="border-b border-white/10 bg-black/70 px-4 py-3 pt-[env(safe-area-inset-top)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/60">
                    Grafico carburante
                  </p>
                  <p className="text-xs text-white/60">
                    Modalita schermo intero. Ruota il dispositivo per avere piu spazio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeFullscreenChart}
                  className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 hover:text-white hover:border-white/50 transition"
                >
                  Chiudi
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))_auto] md:items-end">
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Da</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">A</label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
                  />
                </div>
                <button
                  onClick={fetchFuelHistory}
                  disabled={loading}
                  className="h-9 w-full rounded-lg bg-white/10 border border-white/20 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:bg-white/15 transition disabled:opacity-50 sm:w-auto"
                >
                  {loading ? "Carico" : "Aggiorna"}
                </button>
              </div>
            </div>
            <div className="flex-1 p-3">
              <div className="h-full w-full rounded-xl border border-white/10 bg-[#0d0d0f] p-3">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-sm text-white/60">
                    Caricamento carburante...
                  </div>
                ) : (
                  <FuelEChart
                    key={`${selectedVehicleImei || "no-vehicle"}-fullscreen`}
                    historyRaw={historyRaw}
                    events={events}
                    tankCapacity={getTankCapacity(selectedVehicle)}
                    isFullscreen
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <RefuelModal
        open={modalOpen}
        loading={modalLoading}
        error={modalError}
        row={activeRow}
        onClose={() => {
          setModalOpen(false);
          setActiveRow(null);
          setModalError(null);
        }}
        onSave={handleSaveRefueling}
      />
    </>
  );
}

function RefuelModal({
  open,
  loading,
  error,
  row,
  onClose,
  onSave,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  row: FuelTableRow | null;
  onClose: () => void;
  onSave: (payload: RefuelSavePayload) => void;
}) {
  const [type, setType] = React.useState<"refuel" | "withdrawal">("refuel");
  const [startInput, setStartInput] = React.useState("");
  const [endInput, setEndInput] = React.useState("");
  const [litersInput, setLitersInput] = React.useState("");
  const [station, setStation] = React.useState("");
  const [invoiceRef, setInvoiceRef] = React.useState("");
  const [priceInput, setPriceInput] = React.useState("");
  const [tankPrimaryInput, setTankPrimaryInput] = React.useState("");
  const [tankSecondaryInput, setTankSecondaryInput] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [attachments, setAttachments] = React.useState<File[]>([]);

  React.useEffect(() => {
    if (!row) {
      setType("refuel");
      setStartInput("");
      setEndInput("");
      setLitersInput("");
      setStation("");
      setInvoiceRef("");
      setPriceInput("");
      setTankPrimaryInput("");
      setTankSecondaryInput("");
      setNotes("");
      setAttachments([]);
      return;
    }
    setType(row.type || resolveRefuelType(row.refuelDoc, row.detectedEvent));
    setStartInput(row.start ? toLocalInputValue(new Date(row.start)) : "");
    setEndInput(row.end ? toLocalInputValue(new Date(row.end)) : "");
    setLitersInput(
      Number.isFinite(row.liters) ? String(row.liters) : "",
    );
    setStation(row.refuelDoc?.station || "");
    setInvoiceRef(row.refuelDoc?.invoiceRef || "");
    setPriceInput(
      Number.isFinite(row.refuelDoc?.pricePerUnit) ? String(row.refuelDoc?.pricePerUnit) : "",
    );
    setTankPrimaryInput(
      Number.isFinite(row.refuelDoc?.tankPrimary) ? String(row.refuelDoc?.tankPrimary) : "",
    );
    setTankSecondaryInput(
      Number.isFinite(row.refuelDoc?.tankSecondary) ? String(row.refuelDoc?.tankSecondary) : "",
    );
    setNotes(String(row.refuelDoc?.metadata?.notes || ""));
    setAttachments([]);
  }, [row]);

  if (!open || !row) return null;

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const start = toTimestamp(startInput);
    const end = toTimestamp(endInput) || start;
    const liters = toFiniteNumber(litersInput);
    const pricePerUnit = toFiniteNumber(priceInput);
    const tankPrimary = toFiniteNumber(tankPrimaryInput);
    const tankSecondary = toFiniteNumber(tankSecondaryInput);

    onSave({
      eventId: row.eventId,
      start: Number.isFinite(start) ? (start as number) : 0,
      end: Number.isFinite(end) ? (end as number) : 0,
      liters: Number.isFinite(liters) ? (liters as number) : null,
      type,
      station: station.trim(),
      invoiceRef: invoiceRef.trim(),
      pricePerUnit: Number.isFinite(pricePerUnit) ? (pricePerUnit as number) : null,
      tankPrimary: Number.isFinite(tankPrimary) ? (tankPrimary as number) : null,
      tankSecondary: Number.isFinite(tankSecondary) ? (tankSecondary as number) : null,
      notes: notes.trim(),
      source: row.source,
      attachments,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex h-[100svh] max-h-[100vh] items-stretch justify-center bg-black/90 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121212] p-6 pb-0 shadow-[0_24px_60px_rgba(0,0,0,0.55)] max-h-[75%]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">
              Gestione evento
            </p>
            <h3 className="text-lg font-semibold text-white">Rifornimento / Prelievo</h3>
            <p className="text-sm text-white/60">
              Integra documenti, note e dati dell&apos;evento selezionato.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 h-7 w-7 text-xs text-white/70 hover:text-white hover:border-white/40 transition inline-flex items-center justify-center"
            aria-label="Chiudi"
          >
            <i className="fa fa-close" aria-hidden="true" />
          </button>
        </div>

        <form
          id="refuel-form"
          onSubmit={onSubmit}
          className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 truckly-modal-scrollbar"
        >
          <div className="space-y-4 pb-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "refuel" | "withdrawal")}
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              >
                <option value="refuel">Rifornimento</option>
                <option value="withdrawal">Prelievo</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">Litri</label>
              <input
                value={litersInput}
                onChange={(e) => setLitersInput(e.target.value)}
                placeholder="Es. 120"
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">Inizio</label>
              <input
                type="datetime-local"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">Fine</label>
              <input
                type="datetime-local"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">Stazione</label>
              <input
                value={station}
                onChange={(e) => setStation(e.target.value)}
                placeholder="Nome distributore"
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">Riferimento fattura</label>
              <input
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="Es. FT-2026-001"
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">Prezzo/L</label>
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="Es. 1.75"
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">Serbatoio 1</label>
              <input
                value={tankPrimaryInput}
                onChange={(e) => setTankPrimaryInput(e.target.value)}
                placeholder="Litri"
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-white/60">Serbatoio 2</label>
              <input
                value={tankSecondaryInput}
                onChange={(e) => setTankSecondaryInput(e.target.value)}
                placeholder="Litri"
                className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.1em] text-white/60">Note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Note aggiuntive sull'evento"
              className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.1em] text-white/60">Documenti</label>
            <input
              type="file"
              multiple
              onChange={(e) => setAttachments(Array.from(e.target.files || []))}
              className="w-full rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-xs text-white/70 file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:text-white/80 hover:file:bg-white/20"
            />
            {attachments.length > 0 && (
              <p className="text-xs text-white/60">{attachments.length} file selezionati</p>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          </div>
        </form>
        <div className="-mx-6 mt-auto border-t border-white/10 bg-[#121212] px-6 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.18em] text-white/70 hover:text-white hover:border-white/40 transition"
            >
              Annulla
            </button>
            <button
              type="submit"
              form="refuel-form"
              disabled={loading}
              className="rounded-lg bg-orange-500/20 border border-orange-400/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-100 hover:bg-orange-500/30 transition disabled:opacity-50"
            >
              {loading ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FuelEChart({
  historyRaw,
  events,
  tankCapacity,
  className,
  isFullscreen = false,
}: {
  historyRaw: any[];
  events: FuelEvent[];
  tankCapacity?: number | null;
  className?: string;
  isFullscreen?: boolean;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<any>(null);
  const [hostSize, setHostSize] = React.useState({ width: 0, height: 0 });

  const renderChart = React.useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    const echarts = await loadECharts();
    if (!echarts) return;

    if (!chartRef.current) {
      chartRef.current = echarts.init(host, null, {
        renderer: "canvas",
        useDirtyRect: true,
        locale: "it",
      });
    }

    const samples = extractSamples({ raw: historyRaw });
    if (samples.length < 10) {
      chartRef.current.setOption({ series: [{ type: "line", data: [] }] }, true);
      return;
    }

    const { fuel, tank1, tank2, speed } = buildFuelSeries(samples);
    const maxCapacity =
      Number.isFinite(tankCapacity) && (tankCapacity as number) > 0
        ? (tankCapacity as number)
        : null;
    const fuelValues = fuel.map(([, v]) => v).filter((v) => Number.isFinite(v));
    const positiveFuel = fuelValues.filter((v) => v > 0);
    let fuelMin = null as number | null;
    if (positiveFuel.length) {
      fuelMin = Math.min(...positiveFuel);
    } else if (fuelValues.length) {
      fuelMin = Math.min(...fuelValues);
    }
    if (Number.isFinite(fuelMin) && Number.isFinite(maxCapacity) && (fuelMin as number) >= (maxCapacity as number)) {
      fuelMin = (maxCapacity as number) - 1;
    }
    const spans = events
      .filter((evt) => evt.isRefuel || evt.isWithdrawal)
      .map((evt) => {
        const start = evt.start;
        const end = Number.isFinite(evt.end) ? evt.end : evt.start;
        const color = evt.isWithdrawal ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)";
        const labelText = evt.isWithdrawal ? "Prelievo" : "Rifornimento";
        return [
          {
            xAxis: start,
            itemStyle: { color, opacity: 0.25 },
            label: {
              show: true,
              formatter: labelText,
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: evt.isWithdrawal ? "rgba(239,68,68,0.85)" : "rgba(16,185,129,0.85)",
              padding: [2, 6],
              borderRadius: 6,
            },
          },
          { xAxis: end },
        ];
      });

    const compact =
      hostSize.height > 0
        ? hostSize.height < (isFullscreen ? 420 : 320) || hostSize.width < 560
        : false;
    const gridTop = compact ? 56 : 84;
    const gridBottom = compact ? 32 : 48;
    const showSlider = !compact;

    chartRef.current.setOption(
      {
        backgroundColor: "transparent",
        animation: true,
        grid: { left: 56, right: 36, top: gridTop, bottom: gridBottom, containLabel: true },
        tooltip: {
          trigger: "axis",
          confine: true,
          axisPointer: { type: "cross" },
          formatter: (params: any[]) => {
            if (!Array.isArray(params) || !params.length) return "";
            const ts = params[0]?.value?.[0];
            const date = ts ? new Date(ts).toLocaleString("it-IT") : "";
            const lines = params
              .filter((p) => p && p.seriesName)
              .map((p) => {
                const val = Array.isArray(p.value) ? p.value[1] : p.value;
                if (p.seriesName === "Velocita") {
                  const speedValue = Number.isFinite(val) ? `${Math.round(val)} km/h` : "--";
                  return `${p.marker} ${p.seriesName}: ${speedValue}`;
                }
                return `${p.marker} ${p.seriesName}: ${formatLiters(val)}`;
              });
            return [date, ...lines].join("<br/>");
          },
          backgroundColor: "rgba(10,12,18,0.92)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          textStyle: { color: "#f8fafc" },
        },
        xAxis: {
          type: "time",
          axisLine: { lineStyle: { color: "#666" } },
          axisLabel: { color: "#9ca3af", fontSize: compact ? 10 : 12 },
          axisTick: { show: false },
          splitLine: { show: true, lineStyle: { color: "rgba(148,163,184,0.12)" } },
        },
        yAxis: [
          {
            type: "value",
            name: "Carburante (L)",
            min: Number.isFinite(fuelMin) ? (fuelMin as number) : "dataMin",
            max: maxCapacity ?? "dataMax",
            nameLocation: "end",
            nameGap: compact ? 10 : 18,
            nameTextStyle: {
              color: "#fbbf24",
              fontSize: compact ? 10 : 12,
              padding: [0, 0, compact ? 4 : 8, 0],
            },
            axisLine: { lineStyle: { color: "#fbbf24" } },
            axisLabel: {
              color: "#fbbf24",
              fontSize: compact ? 10 : 12,
              formatter: (value: number) => Math.round(value),
            },
            splitLine: { show: true, lineStyle: { color: "rgba(148,163,184,0.12)" } },
          },
          {
            type: "value",
            name: "Velocita (km/h)",
            position: "right",
            axisLine: { lineStyle: { color: "#60a5fa" } },
            axisLabel: { color: "#60a5fa", fontSize: compact ? 10 : 12 },
            splitLine: { show: false },
          },
        ],
        dataZoom: showSlider
          ? [
              { type: "inside", xAxisIndex: 0 },
              {
                type: "slider",
                xAxisIndex: 0,
                height: 16,
                bottom: 10,
                backgroundColor: "rgba(255,255,255,0.06)",
                fillerColor: "rgba(251,191,36,0.15)",
                borderColor: "rgba(255,255,255,0.1)",
                handleIcon:
                  "M8.7,11.8v-7.6h2.6v7.6zM13,11.8v-7.6h2.6v7.6z",
                handleSize: "120%",
                handleStyle: { color: "#fbbf24" },
                textStyle: { color: "#cbd5f5" },
              },
            ]
          : [{ type: "inside", xAxisIndex: 0 }],
        legend: {
          type: "scroll",
          data: ["Livello carburante", "Serbatoio 1", "Serbatoio 2", "Velocita"],
          top: 8,
          left: "center",
          textStyle: { color: "#e5e7eb", fontSize: compact ? 10 : 12 },
          itemWidth: compact ? 12 : 16,
          itemHeight: compact ? 6 : 8,
          inactiveColor: "rgba(229,231,235,0.35)",
        },
        series: [
          {
            name: "Livello carburante",
            type: "line",
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2.4, color: "#fbbf24" },
            itemStyle: { color: "#fbbf24" },
            data: fuel,
            markArea: spans.length ? { data: spans } : undefined,
          },
          {
            name: "Serbatoio 1",
            type: "line",
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.6, color: "#34d399" },
            itemStyle: { color: "#34d399" },
            data: tank1,
          },
          {
            name: "Serbatoio 2",
            type: "line",
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.6, color: "#c084fc" },
            itemStyle: { color: "#c084fc" },
            data: tank2,
          },
          {
            name: "Velocita",
            type: "line",
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 1.2, color: "#60a5fa" },
            itemStyle: { color: "#60a5fa" },
            data: speed,
            yAxisIndex: 1,
          },
        ],
      },
      true,
    );
  }, [historyRaw, events, tankCapacity, hostSize, isFullscreen]);

  React.useEffect(() => {
    renderChart();
  }, [renderChart]);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width && rect.height) {
      setHostSize({ width: rect.width, height: rect.height });
    }
  }, [isFullscreen]);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !window.ResizeObserver) return;
    const observer = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect();
      if (rect.width && rect.height) {
        setHostSize({ width: rect.width, height: rect.height });
      }
      chartRef.current?.resize?.();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    return () => {
      chartRef.current?.dispose?.();
      chartRef.current = null;
    };
  }, []);

  const samples = extractSamples({ raw: historyRaw });
  const sizeClasses = isFullscreen
    ? "h-full w-full"
    : "h-64 w-full sm:h-80 lg:h-[420px]";

  if (samples.length < 10) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-white/60 ${sizeClasses} ${className || ""}`}
      >
        Dati non disponibili, verifica o installa la sonda carburante.
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={`min-w-0 overflow-hidden ${sizeClasses} ${className || ""}`}
    />
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
    <div className="rounded-2xl border border-white/10 bg-[#121212] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="space-y-1">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">{title}</p>
        <p className="text-sm text-white/60">{subtitle}</p>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-sm text-white/80 min-w-0"
          >
            <span className="truncate">{label}</span>
            <span className="text-white/60 whitespace-nowrap">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

