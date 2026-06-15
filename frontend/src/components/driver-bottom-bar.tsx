import React from "react";
import { dataManager, resolveBackendBaseUrl } from "../lib/data-manager";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { API_BASE_URL } from "../config";
import { RouteCalculator } from "./route-calculator";
import { sanitizeSvg } from "../lib/sanitize-svg";
import { ComboBox } from "./ui/combo-box";
import { Button } from "./ui/button";
import { TabSwitch } from "./ui/tab-switch";

// ---- Chrome condiviso tabelle (omologato al tab "Utenti" / design system) ----
const TABLE_INPUT =
  "h-9 w-40 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-56";
// Trigger azioni riga: "…" minimal (niente bordo/pill), come nella tabella Utenti.
const ROW_ACTION_TRIGGER =
  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

/** Header tabella uniforme: titolo small-caps + ricerca + azioni (refresh icona + extra). */
function TableHeader({
  title,
  search,
  onSearch,
  searchPlaceholder = "Cerca...",
  onRefresh,
  refreshing,
  children,
}: {
  title: string;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="flex items-center gap-2">
        {onSearch && (
          <input
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className={TABLE_INPUT}
          />
        )}
        {children}
        {onRefresh && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onRefresh}
            aria-label="Aggiorna"
            disabled={refreshing}
          >
            <i className={`fa fa-refresh ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Guscio tabella: card a tutta altezza con header fisso + corpo che scrolla da solo. */
function TableShell({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        <div className="shrink-0 space-y-3 border-b border-border p-3 sm:p-4">{header}</div>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
}

// ---- Tabella generica omologata: celle no-wrap, ordinamento, selettore colonne ----
type DataColumn<T> = {
  key: string;
  label: string;
  width?: string; // CSS grid track, es. "minmax(160px,1.4fr)" o "120px"
  align?: "left" | "right";
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  defaultHidden?: boolean;
};

function loadVisibleCols(id: string, columns: DataColumn<any>[]): string[] {
  const fallback = columns.filter((c) => !c.defaultHidden).map((c) => c.key);
  try {
    const raw = localStorage.getItem(`truckly:cols:${id}`);
    if (!raw) return fallback;
    const stored = JSON.parse(raw);
    if (!Array.isArray(stored)) return fallback;
    const valid = new Set(columns.map((c) => c.key));
    const filtered = stored.filter((k: any) => valid.has(k));
    return filtered.length ? filtered : fallback;
  } catch {
    return fallback;
  }
}

function DataTable<T>({
  id,
  title,
  columns,
  rows,
  getRowKey,
  renderActions,
  actionsLabel = "Azioni",
  search,
  onSearch,
  searchPlaceholder,
  onRefresh,
  refreshing,
  headerActions,
  emptyLabel = "Nessun dato disponibile.",
  initialSort,
  error,
  headerBelow,
}: {
  id: string;
  title: string;
  columns: DataColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  renderActions?: (row: T) => React.ReactNode;
  actionsLabel?: string;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  headerActions?: React.ReactNode;
  emptyLabel?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  error?: string | null;
  headerBelow?: React.ReactNode;
}) {
  const [visible, setVisible] = React.useState<string[]>(() => loadVisibleCols(id, columns));
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ?? null,
  );

  React.useEffect(() => {
    try {
      localStorage.setItem(`truckly:cols:${id}`, JSON.stringify(visible));
    } catch {}
  }, [id, visible]);

  const cols = columns.filter((c) => visible.includes(c.key));
  const gridTemplate = [
    ...cols.map((c) => c.width || "minmax(0,1fr)"),
    renderActions ? "auto" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const sortedRows = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const mult = sort.dir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
      return String(av).localeCompare(String(bv), "it", { sensitivity: "base" }) * mult;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) =>
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" },
    );
  const toggleCol = (key: string) =>
    setVisible((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((k) => k !== key)
          : prev
        : columns.filter((c) => prev.includes(c.key) || c.key === key).map((c) => c.key),
    );

  return (
    <TableShell
      header={
        <>
        <TableHeader
          title={title}
          search={search}
          onSearch={onSearch}
          searchPlaceholder={searchPlaceholder}
          onRefresh={onRefresh}
          refreshing={refreshing}
        >
          {headerActions}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="Seleziona colonne" title="Colonne">
                <i className="fa fa-table-columns" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuLabel>Colonne</DropdownMenuLabel>
              {columns.map((c) => {
                const checked = visible.includes(c.key);
                return (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={checked}
                    disabled={checked && visible.length <= 1}
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleCol(c.key);
                    }}
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableHeader>
        {headerBelow}
        {error && <p className="text-xs text-down">{error}</p>}
        </>
      }
    >
      <div
        style={{ gridTemplateColumns: gridTemplate }}
        className="sticky top-0 z-10 grid gap-3 bg-card px-3 pb-2 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        {cols.map((c) =>
          c.sortValue ? (
            <button
              key={c.key}
              type="button"
              onClick={() => toggleSort(c.key)}
              className={`flex min-w-0 items-center gap-1 transition-colors hover:text-foreground ${
                c.align === "right" ? "justify-end" : ""
              }`}
            >
              <span className="truncate">{c.label}</span>
              {sort?.key === c.key && (
                <i
                  className={`fa ${sort.dir === "asc" ? "fa-sort-up" : "fa-sort-down"} shrink-0`}
                  aria-hidden="true"
                />
              )}
            </button>
          ) : (
            <span key={c.key} className={`truncate ${c.align === "right" ? "text-right" : ""}`}>
              {c.label}
            </span>
          ),
        )}
        {renderActions && <span className="text-right">{actionsLabel}</span>}
      </div>

      {sortedRows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        sortedRows.map((row) => (
          <div
            key={getRowKey(row)}
            style={{ gridTemplateColumns: gridTemplate }}
            className="grid items-center gap-3 border-t border-border px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-accent"
          >
            {cols.map((c) => (
              <div
                key={c.key}
                className={`min-w-0 truncate ${c.align === "right" ? "text-right" : ""}`}
              >
                {c.render(row)}
              </div>
            ))}
            {renderActions && <div className="flex justify-end">{renderActions(row)}</div>}
          </div>
        ))
      )}
    </TableShell>
  );
}

type BottomBarMode = "driver" | "fuel" | "tacho" | "vehicles" | "drivers" | "navigation";

type DriverBottomBarProps = {
  isOpen: boolean;
  onClose?: () => void;
  selectedDriverImei?: string | null;
  selectedVehicleImei?: string | null;
  selectedVehicle?: FuelVehicle | null;
  vehicles: VehicleTableVehicle[];
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

type VehicleTableVehicle = {
  id?: string | null;
  _id?: string | null;
  imei?: string | null;
  nickname?: string | null;
  name?: string | null;
  plate?: string | { v?: string; value?: string } | null;
  status?: string | null;
  company?: string | null;
  customer?: string | null;
  tags?: string[];
  owner?: string[] | null;
};

type AdminCompanyOption = {
  id: string;
  name: string;
};

type OwnerOption = {
  id: string;
  label: string;
};

type DriverTableRow = {
  id?: string | null;
  _id?: string | null;
  name?: string | null;
  surname?: string | null;
  phone?: string | null;
  tachoDriverId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  updatedAt?: string | null;
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

const normalizeVehiclePlate = (plate: VehicleTableVehicle["plate"]) => {
  if (!plate) return "--";
  if (typeof plate === "string") return plate;
  return plate.v || plate.value || "--";
};

const getVehicleStatusMeta = (status?: string | null) => {
  const raw = typeof status === "string" ? status.toLowerCase() : "";
  if (raw === "driving" || raw === "moving") {
    return { label: "In marcia", className: "bg-ok/15 text-ok" };
  }
  if (raw === "working") {
    return { label: "Lavoro", className: "bg-warn/15 text-warn" };
  }
  if (raw === "resting" || raw === "stopped" || raw === "fermo") {
    return { label: "Fermo", className: "bg-down/15 text-down" };
  }
  return { label: status || "Online", className: "bg-accent text-muted-foreground" };
};

const LUL_REPORT_OPTIONS = [
  { code: "D01", label: "D01 - Report di attività e infrazioni" },
  { code: "D02", label: "D02 - Dichiarazione di attività" },
  { code: "D03", label: "D03 - Report dei tempi di attività" },
  { code: "D04", label: "D04 - Rapporto dei tempi di lavoro" },
  { code: "D05", label: "D05 - Report tessere inserite" },
];


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

// ECharts bundlato localmente (dynamic import → chunk separato, niente dipendenza da CDN).
const loadECharts = () => {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!echartsLoader) {
    echartsLoader = import("echarts").catch((err) => {
      console.error("[charts] echarts import failed", err);
      echartsLoader = null; // consenti retry al prossimo render
      return null;
    });
  }
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
  vehicles,
  mode,
}: DriverBottomBarProps) {
  const [effectivePrivilege, setEffectivePrivilege] = React.useState<number | null>(null);
  const canEditVehicles =
    Number.isInteger(effectivePrivilege) && (effectivePrivilege as number) <= 1;
  const canDeleteVehicles = Number.isInteger(effectivePrivilege) && effectivePrivilege === 0;

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
        const privilegeValue = Number.isInteger(data?.user?.effectivePrivilege)
          ? data.user.effectivePrivilege
          : Number.isInteger(data?.user?.privilege)
            ? data.user.privilege
            : Number.isInteger(data?.user?.role)
              ? data.user.role
              : null;
        if (!cancelled) {
          setEffectivePrivilege(privilegeValue);
        }
      } catch (err) {
        console.warn("[DriverBottomBar] session lookup failed", err);
      }
    };
    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);
  const navigationVehicleLabel = React.useMemo(() => {
    if (mode !== "navigation" || !selectedVehicleImei) return null;
    const target = vehicles.find((vehicle) => String(vehicle?.imei || "") === String(selectedVehicleImei));
    if (!target) return selectedVehicleImei;
    const plate = typeof target?.plate === "string"
      ? target.plate
      : target?.plate?.v || target?.plate?.value || "";
    const nickname = target?.nickname || target?.name || "";
    return [nickname, plate].filter(Boolean).join(" | ") || selectedVehicleImei;
  }, [mode, selectedVehicleImei, vehicles]);
  const title =
      mode === "fuel"
        ? "Dashboard carburante"
        : mode === "navigation"
          ? `Navigazione${navigationVehicleLabel ? ` | ${navigationVehicleLabel}` : ""}`
        : mode === "vehicles"
          ? "Tabella veicoli"
        : mode === "drivers"
          ? "Tabella autisti"
        : mode === "tacho"
          ? "Scarico dati"
          : "Attivita autista + tabelle";

  return (
    <aside
      className={`fixed left-0 right-0 bottom-0 z-40 h-[calc(100dvh-var(--truckly-nav-height,64px))] min-h-[calc(100vh-var(--truckly-nav-height,64px))] md:h-[calc(100dvh-var(--truckly-nav-height,64px)-var(--tk-toolbar-bottom,0px))] md:min-h-[calc(100vh-var(--truckly-nav-height,64px)-var(--tk-toolbar-bottom,0px))] border-t border-border bg-background text-foreground flex flex-col pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur truckly-bottom-bar transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:h-[calc(75vh-var(--tk-toolbar-bottom,0px))] ${
        isOpen ? "translate-y-0" : "hidden-bottom"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-start justify-between px-6 py-4 border-b border-border">
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold leading-tight text-foreground">{title}</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs h-8 w-8 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-border transition inline-flex items-center justify-center"
            aria-label="Chiudi"
          >
            <i className="fa fa-close" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-background">
        {mode === "fuel" ? (
          <FuelDashboard
            isOpen={isOpen}
            selectedVehicleImei={selectedVehicleImei}
            selectedVehicle={selectedVehicle}
          />
          ) : mode === "navigation" ? (
            <RouteCalculator selectedVehicleImei={selectedVehicleImei} compact />
          ) : mode === "vehicles" ? (
            <VehicleTableDashboard
              vehicles={vehicles}
              canEdit={canEditVehicles}
              canDelete={canDeleteVehicles}
              canManageOwners={Number.isInteger(effectivePrivilege) && effectivePrivilege === 0}
            />
          ) : mode === "drivers" ? (
            <DriverTableDashboard isOpen={isOpen} />
          ) : mode === "tacho" ? (
            <TachoFilesDashboard isOpen={isOpen} />
          ) : (
            <DriverDashboard selectedDriverImei={selectedDriverImei} />
          )}
      </div>
    </aside>
  );
}

export function VehicleTableDashboard({
  vehicles,
  canEdit,
  canDelete,
  canManageOwners,
}: {
  vehicles: VehicleTableVehicle[];
  canEdit: boolean;
  canDelete: boolean;
  canManageOwners: boolean;
}) {
  const rows = React.useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const aLabel = (a.nickname || a.name || a.imei || "").toString();
      const bLabel = (b.nickname || b.name || b.imei || "").toString();
      return aLabel.localeCompare(bLabel, "it-IT", { sensitivity: "base" });
    });
  }, [vehicles]);

  const [vehicleSearch, setVehicleSearch] = React.useState("");
  const filteredRows = React.useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((v) => {
      const plate = normalizeVehiclePlate(v.plate);
      const hay = [v.nickname, v.name, plate, v.imei, v.company, v.customer, ...(v.tags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, vehicleSearch]);

  const [assignTarget, setAssignTarget] = React.useState<VehicleTableVehicle | null>(
    null,
  );
  const [assignCompanies, setAssignCompanies] = React.useState<AdminCompanyOption[]>([]);
  const [assignCompanyId, setAssignCompanyId] = React.useState("");
  const [assignLoading, setAssignLoading] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);
  const [ownerAssignTarget, setOwnerAssignTarget] = React.useState<VehicleTableVehicle | null>(
    null,
  );
  const [ownerOptions, setOwnerOptions] = React.useState<OwnerOption[]>([]);
  const [ownerSelectedIds, setOwnerSelectedIds] = React.useState<string[]>([]);
  const [ownerSearch, setOwnerSearch] = React.useState("");
  const [ownerLoading, setOwnerLoading] = React.useState(false);
  const [ownerError, setOwnerError] = React.useState<string | null>(null);

  const resolveVehicleId = (vehicle: VehicleTableVehicle) =>
    vehicle.id || vehicle._id || vehicle.imei || null;

  const resolveDevice = (vehicle: VehicleTableVehicle) => {
    if (typeof window === "undefined") return null;
    const imei = vehicle.imei || null;
    if (!imei) return null;
    const raw = (window as any).trucklyGetAvl?.(imei);
    return raw?.data || raw || null;
  };

  const hasDriverAvailable = (vehicle: VehicleTableVehicle) => {
    const device = resolveDevice(vehicle);
    const io = device?.io || device?.data?.io || device?.data?.IOelement || null;
    return Boolean(io?.tachoDriverIds || io?.driver1Id);
  };

  const openDriverReport = (vehicle: VehicleTableVehicle) => {
    const imei = vehicle.imei || null;
    if (!imei) return;
    const device = resolveDevice(vehicle);
    window.dispatchEvent(
      new CustomEvent("truckly:driver-open", {
        detail: { imei, device },
      }),
    );
  };

  const openFuelReport = (vehicle: VehicleTableVehicle) => {
    const imei = vehicle.imei || null;
    if (!imei) return;
    window.dispatchEvent(
      new CustomEvent("truckly:bottom-bar-toggle", {
        detail: { mode: "fuel", imei },
      }),
    );
  };

  const openRoutesReport = (vehicle: VehicleTableVehicle) => {
    const imei = vehicle.imei || null;
    if (!imei) return;
    window.dispatchEvent(
      new CustomEvent("truckly:routes-open", {
        detail: { imei },
      }),
    );
  };

  const handleEdit = (vehicle: VehicleTableVehicle, focus?: "tags") => {
    window.dispatchEvent(
      new CustomEvent("truckly:vehicle-edit-open", {
        detail: { vehicle, focus },
      }),
    );
  };

  const handleDelete = async (vehicle: VehicleTableVehicle) => {
    const id = resolveVehicleId(vehicle);
    if (!id) return;
    const label =
      vehicle.nickname
      || (typeof vehicle.plate === "string" ? vehicle.plate : vehicle.plate?.v)
      || vehicle.imei
      || "veicolo";
    const confirmed = window.confirm(
      `Vuoi eliminare ${label}? Questa azione è definitiva.`,
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/vehicles/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Errore eliminazione veicolo (${res.status})`);
      }
      window.dispatchEvent(new CustomEvent("truckly:vehicles-refresh"));
    } catch (err: any) {
      console.error("[vehicles.delete] failed", err);
      window.alert(err?.message || "Errore durante l'eliminazione.");
    }
  };

  const openAssign = async (vehicle: VehicleTableVehicle) => {
    setAssignTarget(vehicle);
    setAssignCompanyId("");
    setAssignError(null);
    setAssignLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/companies`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Errore caricamento aziende (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.companies) ? data.companies : [];
      const mapped = list
        .map((company: any) => ({
          id: String(company?.id || company?._id || ""),
          name: String(company?.name || ""),
        }))
        .filter((company: AdminCompanyOption) => company.id && company.name);
      setAssignCompanies(mapped);
    } catch (err: any) {
      setAssignError(err?.message || "Errore caricamento aziende.");
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    const vehicleId = resolveVehicleId(assignTarget);
    if (!vehicleId || !assignCompanyId) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vehicles/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: vehicleId, companyId: assignCompanyId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Errore assegnazione (${res.status})`);
      }
      window.dispatchEvent(new CustomEvent("truckly:vehicles-refresh"));
      setAssignTarget(null);
      setAssignCompanyId("");
    } catch (err: any) {
      setAssignError(err?.message || "Errore durante l'assegnazione.");
    } finally {
      setAssignLoading(false);
    }
  };

  const openOwnerAssign = async (vehicle: VehicleTableVehicle) => {
    setOwnerAssignTarget(vehicle);
    setOwnerSearch("");
    setOwnerError(null);
    setOwnerLoading(true);
    setOwnerSelectedIds([]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/companies`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Errore caricamento aziende (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      const companies = Array.isArray(data?.companies) ? data.companies : [];
      const owners = companies.map((company: any) => ({
        id: String(company?.id || company?._id || ""),
        label: String(company?.name || "--"),
      }));
      const unique = new Map<string, OwnerOption>();
      owners.forEach((owner: OwnerOption) => {
        if (!owner.id) return;
        unique.set(owner.id, owner);
      });
      const list = Array.from(unique.values()).sort((a, b) => {
        return a.label.localeCompare(b.label, "it-IT", { sensitivity: "base" });
      });
      setOwnerOptions(list);
    } catch (err: any) {
      setOwnerError(err?.message || "Errore caricamento proprietari.");
    } finally {
      setOwnerLoading(false);
    }
  };

  const filteredOwnerOptions = React.useMemo(() => {
    const query = ownerSearch.trim().toLowerCase();
    if (!query) return ownerOptions;
    return ownerOptions.filter((owner) => {
      return owner.label.toLowerCase().includes(query);
    });
  }, [ownerOptions, ownerSearch]);

  const toggleOwner = (ownerId: string) => {
    setOwnerSelectedIds((prev) =>
      prev.includes(ownerId) ? prev.filter((id) => id !== ownerId) : [...prev, ownerId],
    );
  };

  const handleOwnerAssign = async () => {
    if (!ownerAssignTarget) return;
    const vehicleId = resolveVehicleId(ownerAssignTarget);
    if (!vehicleId) return;
    if (!ownerSelectedIds.length) {
      setOwnerError("Seleziona almeno un proprietario.");
      return;
    }
    setOwnerLoading(true);
    setOwnerError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vehicles/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: vehicleId, companyIds: ownerSelectedIds }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Errore assegnazione proprietari (${res.status})`);
      }
      window.dispatchEvent(new CustomEvent("truckly:vehicles-refresh"));
      setOwnerAssignTarget(null);
      setOwnerSelectedIds([]);
    } catch (err: any) {
      setOwnerError(err?.message || "Errore durante l'assegnazione.");
    } finally {
      setOwnerLoading(false);
    }
  };

  return (
    <>
        {assignTarget && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                Assegna veicolo
              </p>
              <h3 className="text-lg font-semibold text-foreground">
                {assignTarget.nickname
                  || (typeof assignTarget.plate === "string"
                    ? assignTarget.plate
                    : assignTarget.plate?.v)
                  || assignTarget.imei
                  || "Veicolo"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Seleziona l'azienda a cui assegnare questo veicolo.
              </p>
            </div>
            <div className="mt-4 space-y-3">
              <select
                value={assignCompanyId}
                onChange={(e) => setAssignCompanyId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              >
                <option value="">
                  {assignLoading ? "Caricamento aziende..." : "Seleziona azienda"}
                </option>
                {assignCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              {assignError && <p className="text-xs text-down">{assignError}</p>}
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleAssign}
                disabled={!assignCompanyId || assignLoading}
                className="rounded-lg border border-border bg-accent px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {assignLoading ? "Salvataggio..." : "Conferma"}
              </button>
              <button
                type="button"
                onClick={() => setAssignTarget(null)}
                className="rounded-lg border border-border bg-transparent px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
      <DataTable
        id="vehicles"
        title="Veicoli"
        search={vehicleSearch}
        onSearch={setVehicleSearch}
        searchPlaceholder="Cerca veicolo..."
        onRefresh={() => window.dispatchEvent(new CustomEvent("truckly:vehicles-refresh"))}
        rows={filteredRows}
        getRowKey={(vehicle) =>
          String(resolveVehicleId(vehicle) || vehicle.nickname || vehicle.imei || "")
        }
        emptyLabel="Nessun veicolo disponibile."
        columns={[
          {
            key: "name",
            label: "Nome",
            width: "minmax(140px,2fr)",
            sortValue: (v) =>
              (v.nickname || v.name || normalizeVehiclePlate(v.plate) || v.imei || "").toLowerCase(),
            render: (v) => (
              <span className="font-semibold text-foreground">
                {v.nickname || v.name || normalizeVehiclePlate(v.plate) || v.imei || "--"}
              </span>
            ),
          },
          {
            key: "plate",
            label: "Targa",
            width: "minmax(90px,1fr)",
            sortValue: (v) => normalizeVehiclePlate(v.plate).toLowerCase(),
            render: (v) => (
              <span className="text-muted-foreground">{normalizeVehiclePlate(v.plate)}</span>
            ),
          },
          {
            key: "imei",
            label: "IMEI",
            width: "minmax(120px,1.2fr)",
            render: (v) => <span className="text-muted-foreground">{v.imei || "--"}</span>,
          },
          {
            key: "status",
            label: "Stato",
            width: "minmax(90px,1fr)",
            sortValue: (v) => getVehicleStatusMeta(v.status).label,
            render: (v) => {
              const s = getVehicleStatusMeta(v.status);
              return (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${s.className}`}
                >
                  {s.label}
                </span>
              );
            },
          },
          {
            key: "company",
            label: "Azienda",
            width: "minmax(110px,1fr)",
            sortValue: (v) => String(v.company || v.customer || "").toLowerCase(),
            render: (v) => (
              <span className="text-muted-foreground">{v.company || v.customer || "--"}</span>
            ),
          },
          {
            key: "tags",
            label: "Tag",
            width: "minmax(110px,1.2fr)",
            render: (v) => (
              <span className="text-muted-foreground">
                {(v.tags?.length ? v.tags : []).join(", ") || "--"}
              </span>
            ),
          },
        ]}
        renderActions={(vehicle) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={ROW_ACTION_TRIGGER} aria-label="Azioni veicolo">
                <i className="fa fa-ellipsis-h" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {hasDriverAvailable(vehicle) && (
                <DropdownMenuItem onSelect={() => openDriverReport(vehicle)}>
                  <i className="fa fa-id-card-o mr-2 text-[12px]" aria-hidden="true" />
                  Rapporti Autista
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => openFuelReport(vehicle)}>
                <i className="fa fa-tint mr-2 text-[12px]" aria-hidden="true" />
                Rapporti Carburante
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openRoutesReport(vehicle)}>
                <i className="fa fa-road mr-2 text-[12px]" aria-hidden="true" />
                Rapporti percorsi
              </DropdownMenuItem>
              {canEdit && <DropdownMenuSeparator className="bg-border" />}
              {canEdit && (
                <DropdownMenuItem onSelect={() => handleEdit(vehicle)}>
                  <i className="fa fa-pencil mr-2 text-[12px]" aria-hidden="true" />
                  Modifica
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onSelect={() => handleEdit(vehicle, "tags")}>
                  <i className="fa fa-tag mr-2 text-[12px]" aria-hidden="true" />
                  Aggiungi tag
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onSelect={() => openAssign(vehicle)}>
                  <i className="fa fa-building-o mr-2 text-[12px]" aria-hidden="true" />
                  Assegna
                </DropdownMenuItem>
              )}
              {canManageOwners && (
                <DropdownMenuItem onSelect={() => openOwnerAssign(vehicle)}>
                  <i className="fa fa-users mr-2 text-[12px]" aria-hidden="true" />
                  Assegna proprietari
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onSelect={() => handleDelete(vehicle)}
                  className="text-foreground hover:!bg-down/15 hover:text-down"
                >
                  <i className="fa fa-trash mr-2 text-[12px]" aria-hidden="true" />
                  Elimina
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
        {ownerAssignTarget && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                  Assegna proprietari
                </p>
                <h3 className="text-lg font-semibold text-foreground">
                  {ownerAssignTarget.nickname
                    || (typeof ownerAssignTarget.plate === "string"
                      ? ownerAssignTarget.plate
                      : ownerAssignTarget.plate?.v)
                    || ownerAssignTarget.imei
                    || "Veicolo"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Seleziona una o più aziende proprietarie per questo veicolo.
                </p>
              </div>
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  placeholder="Cerca azienda..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
                />
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background">
                  {ownerLoading ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">
                      Caricamento aziende...
                    </div>
                  ) : filteredOwnerOptions.length ? (
                    filteredOwnerOptions.map((owner) => {
                      const isSelected = ownerSelectedIds.includes(owner.id);
                      return (
                        <button
                          key={owner.id}
                          type="button"
                          onClick={() => toggleOwner(owner.id)}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                            isSelected
                              ? "bg-accent text-foreground"
                              : "text-foreground hover:bg-accent"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{owner.label}</div>
                          </div>
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                              isSelected
                                ? "border-ok/50 bg-ok/15 text-ok"
                                : "border-border text-muted-foreground"
                            }`}
                            aria-hidden="true"
                          >
                            <i className="fa fa-check text-[10px]" />
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-3 text-xs text-muted-foreground">
                      Nessuna azienda trovata.
                    </div>
                  )}
                </div>
                {ownerError && <p className="text-xs text-down">{ownerError}</p>}
              </div>
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleOwnerAssign}
                  disabled={ownerLoading || !ownerSelectedIds.length}
                  className="rounded-lg border border-border bg-accent px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ownerLoading ? "Salvataggio..." : "Conferma"}
                </button>
                <button
                  type="button"
                  onClick={() => setOwnerAssignTarget(null)}
                  className="rounded-lg border border-border bg-transparent px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}

export function DriverTableDashboard({ isOpen }: { isOpen: boolean }) {
  const [drivers, setDrivers] = React.useState<DriverTableRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [lulBusyDriverId, setLulBusyDriverId] = React.useState<string | null>(null);
  const [lulModalOpen, setLulModalOpen] = React.useState(false);
  const [lulPreviewLoading, setLulPreviewLoading] = React.useState(false);
  const [lulPreviewError, setLulPreviewError] = React.useState<string | null>(null);
  const [lulPreviewHtml, setLulPreviewHtml] = React.useState<string>("");
  const [lulFormat, setLulFormat] = React.useState<"pdf" | "xlsx">("pdf");
  const [lulReportCode, setLulReportCode] = React.useState<string>("D04");
  const [lulStartDate, setLulStartDate] = React.useState<string>(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return from.toISOString().slice(0, 10);
  });
  const [lulEndDate, setLulEndDate] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [lulDriverSearch, setLulDriverSearch] = React.useState<string>("");
  const [lulSelectedDriverId, setLulSelectedDriverId] = React.useState<string>("");
  const [showLulDriverSuggestions, setShowLulDriverSuggestions] = React.useState(false);

  const openDriverSidebar = (driver: DriverTableRow, readOnly = false) => {
    window.dispatchEvent(
      new CustomEvent("truckly:driver-edit-open", {
        detail: { driver, readOnly },
      }),
    );
  };

  const openDriverReport = (driver: DriverTableRow) => {
    const id = driver.id || driver._id;
    if (!id) return;
    window.dispatchEvent(
      new CustomEvent("truckly:driver-report-open", {
        detail: { driverId: id, tachoDriverId: driver?.tachoDriverId || null },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("truckly:bottom-bar-toggle", {
        detail: { mode: "driver", driverId: id },
      }),
    );
  };

  const handleDeleteDriver = async (driver: DriverTableRow) => {
    const id = driver.id || driver._id;
    if (!id) return;
    const label = `${driver?.name || ""} ${driver?.surname || ""}`.trim() || "autista";
    const confirmed = window.confirm(
      `Vuoi eliminare ${label}? Questa azione è definitiva.`,
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/drivers/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Errore eliminazione autista (${res.status})`);
      }
      window.dispatchEvent(new CustomEvent("truckly:drivers-refresh"));
    } catch (err: any) {
      console.error("[drivers.delete] failed", err);
      window.alert(err?.message || "Errore durante l'eliminazione.");
    }
  };

  const fetchDrivers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/drivers`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.drivers) ? data.drivers : [];
      setDrivers(list);
    } catch (err: any) {
      setDrivers([]);
      setError(err?.message || "Errore durante il caricamento.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    fetchDrivers();
  }, [fetchDrivers, isOpen]);

  const getDriverLabel = React.useCallback((driver: DriverTableRow) => {
    const name = `${driver?.name || ""} ${driver?.surname || ""}`.trim() || "Autista";
    const mongoId = String(driver?.id || driver?._id || "").trim();
    const cardId = String(driver?.tachoDriverId || "").trim();
    const parts = [name];
    if (mongoId) parts.push(`Mongo: ${mongoId}`);
    if (cardId) parts.push(`Carta: ${cardId}`);
    return parts.join(" | ");
  }, []);

  const findDriverByQuery = React.useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return null;
      const exact = drivers.find((driver) => {
        const mongoId = String(driver?.id || driver?._id || "").toLowerCase();
        const cardId = String(driver?.tachoDriverId || "").toLowerCase();
        const name = `${driver?.name || ""} ${driver?.surname || ""}`.trim().toLowerCase();
        return mongoId === q || cardId === q || name === q;
      });
      if (exact) return exact;
      const matches = drivers.filter((driver) => {
        const mongoId = String(driver?.id || driver?._id || "").toLowerCase();
        const cardId = String(driver?.tachoDriverId || "").toLowerCase();
        const name = `${driver?.name || ""} ${driver?.surname || ""}`.trim().toLowerCase();
        return mongoId.includes(q) || cardId.includes(q) || name.includes(q);
      });
      return matches.length ? matches[0] : null;
    },
    [drivers],
  );

  const loadLulPreview = React.useCallback(async () => {
    const selected =
      drivers.find((driver) => String(driver?.id || driver?._id || "") === lulSelectedDriverId) ||
      findDriverByQuery(lulDriverSearch);
    if (!selected) {
      setLulPreviewError("Seleziona un autista valido.");
      return;
    }
    const localDriverId = String(selected?.id || selected?._id || "");
    if (!localDriverId) {
      setLulPreviewError("Autista non valido.");
      return;
    }
    setLulPreviewLoading(true);
    setLulPreviewError(null);
    try {
      const baseUrl = resolveBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/seep/lul/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          localDriverId,
          tachoDriverId: selected?.tachoDriverId || null,
          startDate: `${lulStartDate}T00:00:00.000Z`,
          endDate: `${lulEndDate}T23:59:59.000Z`,
          timezone: "Europe/Rome",
          reportCode: lulReportCode,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || `Errore preview LUL (${res.status})`);
      }
      const data = await res.json();
      setLulPreviewHtml(String(data?.html || ""));
      setLulSelectedDriverId(localDriverId);
      setLulDriverSearch(getDriverLabel(selected));
    } catch (err: any) {
      setLulPreviewError(err?.message || "Errore durante la generazione anteprima.");
      setLulPreviewHtml("");
    } finally {
      setLulPreviewLoading(false);
    }
  }, [drivers, lulSelectedDriverId, findDriverByQuery, lulDriverSearch, lulStartDate, lulEndDate, lulReportCode, getDriverLabel]);

  const openLulModal = async (driver: DriverTableRow) => {
    const id = String(driver?.id || driver?._id || "");
    if (!id) return;
    setLulBusyDriverId(id);
    setLulModalOpen(true);
    setLulFormat("pdf");
    setLulReportCode("D04");
    setLulSelectedDriverId(id);
    setLulDriverSearch(getDriverLabel(driver));
    setShowLulDriverSuggestions(false);
    setLulPreviewHtml("");
    setLulPreviewError(null);
    setTimeout(() => {
      void loadLulPreview();
    }, 0);
    setLulBusyDriverId(null);
  };

  const generateLulOutput = () => {
    if (!lulPreviewHtml) {
      setLulPreviewError("Genera prima l'anteprima.");
      return;
    }
    if (lulFormat === "xlsx") {
      window.alert("Export XLSX non ancora disponibile.");
      return;
    }
    setLulPreviewError(null);

    try {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // fallback handled below
        } finally {
          window.setTimeout(() => {
            iframe.remove();
          }, 1000);
        }
      };

      iframe.srcdoc = lulPreviewHtml;
      document.body.appendChild(iframe);
      return;
    } catch {
      // fall through to popup fallback
    }

    const printWin = window.open("", "_blank", "noopener,noreferrer");
    if (!printWin) {
      setLulPreviewError("Impossibile avviare la stampa: popup bloccato dal browser.");
      return;
    }
    printWin.document.open();
    printWin.document.write(lulPreviewHtml);
    printWin.document.close();
    window.setTimeout(() => {
      try {
        printWin.focus();
        printWin.print();
      } catch {
        setLulPreviewError("Impossibile avviare la stampa.");
      }
    }, 250);
  };

  React.useEffect(() => {
    const handler = () => {
      void fetchDrivers();
    };
    window.addEventListener("truckly:drivers-refresh", handler);
    return () => window.removeEventListener("truckly:drivers-refresh", handler);
  }, [fetchDrivers]);

  React.useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail || {};
      const localDriverId = String(detail?.localDriverId || "").trim();
      const tachoDriverId = String(detail?.tachoDriverId || "").trim();
      let selected =
        drivers.find((driver) => String(driver?.id || driver?._id || "") === localDriverId) ||
        null;
      if (!selected && tachoDriverId) {
        selected =
          drivers.find((driver) => String(driver?.tachoDriverId || "").trim() === tachoDriverId) ||
          null;
      }
      if (selected) {
        void openLulModal(selected);
      }
    };
    window.addEventListener("truckly:lul-open", handler as EventListener);
    return () => window.removeEventListener("truckly:lul-open", handler as EventListener);
  }, [drivers, openLulModal]);

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return drivers;
    return drivers.filter((driver) => {
      const label = `${driver?.name || ""} ${driver?.surname || ""}`.trim();
      const haystack = [
        label,
        driver?.phone || "",
        driver?.tachoDriverId || "",
        driver?.companyName || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [drivers, search]);

  const filteredLulDrivers = React.useMemo(() => {
    const q = lulDriverSearch.trim().toLowerCase();
    if (!q) return drivers.slice(0, 20);
    return drivers
      .filter((driver) => {
        const name = `${driver?.name || ""} ${driver?.surname || ""}`.trim().toLowerCase();
        const mongoId = String(driver?.id || driver?._id || "").toLowerCase();
        const cardId = String(driver?.tachoDriverId || "").toLowerCase();
        return name.includes(q) || mongoId.includes(q) || cardId.includes(q);
      })
      .slice(0, 20);
  }, [drivers, lulDriverSearch]);

  const formatUpdatedAt = (value?: string | null) => {
    if (!value) return "--";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("it-IT");
  };

  return (
    <>
    <DataTable
      id="drivers"
      title="Autisti"
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Cerca autista..."
      onRefresh={fetchDrivers}
      refreshing={loading}
      error={error}
      rows={filtered}
      getRowKey={(d) => String(d.id || d._id || `${d?.name}-${d?.tachoDriverId || ""}`)}
      emptyLabel={loading ? "Caricamento autisti..." : "Nessun autista disponibile."}
      columns={[
        {
          key: "name",
          label: "Autista",
          width: "minmax(140px,1.6fr)",
          sortValue: (d) => `${d?.name || ""} ${d?.surname || ""}`.trim().toLowerCase(),
          render: (d) => (
            <span className="font-medium text-foreground">
              {`${d?.name || ""} ${d?.surname || ""}`.trim() || "--"}
            </span>
          ),
        },
        { key: "phone", label: "Cellulare", width: "minmax(100px,1fr)", render: (d) => d?.phone || "--" },
        {
          key: "card",
          label: "ID Carta",
          width: "minmax(120px,1fr)",
          sortValue: (d) => String(d?.tachoDriverId || ""),
          render: (d) => d?.tachoDriverId || "--",
        },
        {
          key: "company",
          label: "Azienda",
          width: "minmax(120px,1.2fr)",
          sortValue: (d) => String(d?.companyName || "").toLowerCase(),
          render: (d) => d?.companyName || "--",
        },
        {
          key: "updated",
          label: "Aggiornato",
          width: "minmax(140px,1fr)",
          sortValue: (d) => (d?.updatedAt ? new Date(d.updatedAt).getTime() : 0),
          render: (d) => (
            <span className="text-muted-foreground">{formatUpdatedAt(d?.updatedAt)}</span>
          ),
        },
      ]}
      renderActions={(driver) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={ROW_ACTION_TRIGGER} aria-label="Azioni autista">
              <i className="fa fa-ellipsis-h" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem onSelect={() => openDriverSidebar(driver, true)}>
              <i className="fa fa-id-card-o mr-2 text-[12px]" aria-hidden="true" />
              Apri scheda autista
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDriverReport(driver)}>
              <i className="fa fa-line-chart mr-2 text-[12px]" aria-hidden="true" />
              Report autista
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={lulBusyDriverId === String(driver.id || driver._id || "")}
              onSelect={(ev) => {
                ev.preventDefault();
                openLulModal(driver);
              }}
            >
              <i className="fa fa-file-text-o mr-2 text-[12px]" aria-hidden="true" />
              {lulBusyDriverId === String(driver.id || driver._id || "")
                ? "Apro generatore..."
                : "Genera LUL"}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem onSelect={() => openDriverSidebar(driver, false)}>
              <i className="fa fa-pencil mr-2 text-[12px]" aria-hidden="true" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => handleDeleteDriver(driver)}
              className="text-foreground hover:!bg-down/15 hover:text-down"
            >
              <i className="fa fa-trash mr-2 text-[12px]" aria-hidden="true" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    />
    {lulModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-4 md:p-8">
          <div className="mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Generatore LUL</h3>
                <p className="text-xs text-muted-foreground">Compila i parametri e verifica la preview prima di generare il PDF.</p>
              </div>
              <button type="button" onClick={() => setLulModalOpen(false)} className="h-8 w-8 rounded-full border border-border text-muted-foreground hover:border-border hover:text-foreground" aria-label="Chiudi Generatore LUL">
                <i className="fa fa-close" aria-hidden="true" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[380px_1fr]">
              <div className="space-y-4 overflow-y-auto border-r border-border px-5 py-4">
                <div className="flex items-center gap-6">
                  <label className="inline-flex items-center gap-2 text-sm text-foreground"><input type="radio" checked={lulFormat === "pdf"} onChange={() => setLulFormat("pdf")} />PDF</label>
                  <label className="inline-flex items-center gap-2 text-sm text-foreground"><input type="radio" checked={lulFormat === "xlsx"} onChange={() => setLulFormat("xlsx")} />XLSX (Excel)</label>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Autista</label>
                  <div className="relative">
                    <input value={lulDriverSearch} onChange={(e) => { setLulDriverSearch(e.target.value); setLulSelectedDriverId(""); setShowLulDriverSuggestions(true); }} onFocus={() => setShowLulDriverSuggestions(true)} onBlur={() => setTimeout(() => setShowLulDriverSuggestions(false), 120)} placeholder="Cerca per nome, ID mongo o ID carta..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                    {showLulDriverSuggestions && filteredLulDrivers.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover">
                        {filteredLulDrivers.map((driver) => {
                          const id = String(driver?.id || driver?._id || "");
                          const label = getDriverLabel(driver);
                          return <button key={id || label} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => { setLulSelectedDriverId(id); setLulDriverSearch(label); setShowLulDriverSuggestions(false); }} className="w-full px-3 py-2 text-left text-xs text-foreground hover:bg-accent">{label}</button>;
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Tipo di rapporto</label>
                  <select value={lulReportCode} onChange={(e) => setLulReportCode(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                    {LUL_REPORT_OPTIONS.map((opt) => <option key={opt.code} value={opt.code}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Da</label>
                    <input type="date" value={lulStartDate} onChange={(e) => setLulStartDate(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">A</label>
                    <input type="date" value={lulEndDate} onChange={(e) => setLulEndDate(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
                  </div>
                </div>
                {lulPreviewError && <p className="text-sm text-down">{lulPreviewError}</p>}
                <div className="flex flex-wrap gap-2 pt-2">
                  <button type="button" onClick={() => void loadLulPreview()} disabled={lulPreviewLoading} className="rounded-lg border border-border bg-accent px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground disabled:opacity-50">{lulPreviewLoading ? "Genero anteprima..." : "Aggiorna anteprima"}</button>
                  <button type="button" onClick={generateLulOutput} className="rounded-lg border border-transparent bg-brand px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-foreground">Genera LUL</button>
                </div>
              </div>
              <div className="min-h-0 bg-background p-4">
                <div className="h-full overflow-hidden rounded-xl border border-border bg-white">
                  {lulPreviewLoading ? <div className="flex h-full items-center justify-center text-sm text-slate-700">Caricamento preview...</div> : lulPreviewHtml ? <iframe title="Anteprima LUL" className="h-full w-full" srcDoc={lulPreviewHtml} /> : <div className="flex h-full items-center justify-center text-sm text-slate-600">Nessuna anteprima disponibile.</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function TachoFilesDashboard({ isOpen }: { isOpen: boolean }) {
  const [files, setFiles] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [accessDenied, setAccessDenied] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState<"all" | "vehicle" | "driver">("all");

  const fetchFiles = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDenied(false);
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
      if (res.status === 403) {
        setAccessDenied(true);
        setFiles([]);
        return;
      }
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

  const filteredFiles = React.useMemo(
    () =>
      (Array.isArray(files) ? files : []).filter(
        (f) => sourceFilter === "all" || f?.source === sourceFilter,
      ),
    [files, sourceFilter],
  );

  const baseUrl = resolveBackendBaseUrl();

  return (
    <DataTable
      id="tacho"
      title="Scarico dati"
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Filtra per nome file..."
      onRefresh={fetchFiles}
      refreshing={loading}
      error={accessDenied ? "Contatta l'amministratore per accedere a questa pagina" : error}
      rows={filteredFiles}
      getRowKey={(file) => String(file?.id || "")}
      emptyLabel="Nessun file disponibile."
      initialSort={{ key: "downloadTime", dir: "desc" }}
      headerBelow={
        <TabSwitch
          ariaLabel="Filtra per origine file"
          value={sourceFilter}
          onChange={(id) => setSourceFilter(id as "all" | "vehicle" | "driver")}
          tabs={[
            { id: "all", label: "Tutti" },
            { id: "vehicle", label: "Veicolo" },
            { id: "driver", label: "Autista" },
          ]}
        />
      }
      columns={[
        {
          key: "fileName",
          label: "File",
          width: "minmax(160px,2fr)",
          sortValue: (f) => String(f?.fileName || "").toLowerCase(),
          render: (f) => f?.fileName || "file.ddd",
        },
        {
          key: "source",
          label: "Origine",
          width: "minmax(80px,0.8fr)",
          sortValue: (f) => String(f?.source || ""),
          render: (f) => (
            <span className="text-muted-foreground">
              {f?.source === "driver" ? "Autista" : "Veicolo"}
            </span>
          ),
        },
        {
          key: "reference",
          label: "Riferimento",
          width: "minmax(110px,1.2fr)",
          render: (f) => (
            <span className="text-muted-foreground">
              {f?.source === "driver"
                ? f?.driver?.driverName || f?.driver?.cardNumber || "--"
                : f?.vehicle?.number || f?.vehicle?.imei || "--"}
            </span>
          ),
        },
        {
          key: "period",
          label: "Periodo",
          width: "minmax(150px,1.6fr)",
          sortValue: (f) => toTimestamp(f?.periodFrom) || 0,
          render: (f) => {
            const pf = toTimestamp(f?.periodFrom);
            const pt = toTimestamp(f?.periodTo);
            if (!pf && !pt) return <span className="text-muted-foreground">N/D</span>;
            return (
              <span className="text-muted-foreground">
                {pf ? formatShortDateTime(pf) : "--"} → {pt ? formatShortDateTime(pt) : "--"}
              </span>
            );
          },
        },
        {
          key: "company",
          label: "Azienda",
          width: "minmax(100px,1fr)",
          sortValue: (f) => String(f?.company?.name || "").toLowerCase(),
          render: (f) => <span className="text-muted-foreground">{f?.company?.name || "--"}</span>,
        },
        {
          key: "syncState",
          label: "Sync Seep",
          width: "minmax(90px,1fr)",
          sortValue: (f) => String(f?.syncState || ""),
          render: (f) => (
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                f?.syncState === "uploaded"
                  ? "border-ok/50 text-ok"
                  : f?.syncState === "error"
                    ? "border-down/40 text-down"
                    : "border-border text-muted-foreground"
              }`}
              title={f?.error || ""}
            >
              {f?.syncState || "pending"}
            </span>
          ),
        },
        {
          key: "downloadTime",
          label: "Download",
          width: "minmax(110px,1fr)",
          sortValue: (f) => toTimestamp(f?.downloadTime) || 0,
          render: (f) => {
            const ts = toTimestamp(f?.downloadTime);
            return <span className="text-muted-foreground">{ts ? formatShortDateTime(ts) : "N/D"}</span>;
          },
        },
      ]}
      renderActions={(file) => {
        const name = file?.fileName || "file.ddd";
        const url = `${baseUrl}/api/tacho/files/download?source=${encodeURIComponent(
          file?.source || "vehicle",
        )}&id=${encodeURIComponent(file?.id || "")}&name=${encodeURIComponent(name)}`;
        return (
          <a href={url} className={ROW_ACTION_TRIGGER} title="Scarica file" aria-label={`Scarica ${name}`}>
            <i className="fa fa-download" aria-hidden="true" />
          </a>
        );
      }}
    />
  );
}

export function DriverDashboard({
  selectedDriverImei,
  initialDriverId,
}: {
  selectedDriverImei?: string | null;
  initialDriverId?: string | null;
}) {
  const [driverOptions, setDriverOptions] = React.useState<DriverTableRow[]>([]);
  const [driverSearch, setDriverSearch] = React.useState("");
  const [selectedDriverId, setSelectedDriverId] = React.useState("");
  const [startDate, setStartDate] = React.useState("2025-10-25T00:00");
  const [endDate, setEndDate] = React.useState("2025-10-26T23:59");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [driverResolution, setDriverResolution] = React.useState<string | null>(null);
  const [days, setDays] = React.useState<DayGraph[]>([]);
  const [hoveredDay, setHoveredDay] = React.useState<DayGraph | null>(null);
  const [hoverPos, setHoverPos] = React.useState({ x: 0, y: 0 });
  const [hoverBounds, setHoverBounds] = React.useState({ width: 0, height: 0 });
  const [expandedActivityDays, setExpandedActivityDays] = React.useState<Record<string, boolean>>({});

  const getDriverLabel = React.useCallback((driver: DriverTableRow) => {
    const name = `${driver?.name || ""} ${driver?.surname || ""}`.trim() || "--";
    const mongoId = driver?.id || driver?._id || "--";
    const cardId = driver?.tachoDriverId || "--";
    return `${name} - Mongo: ${mongoId} - Carta: ${cardId}`;
  }, []);

  const findDriverById = React.useCallback(
    (id: string) => driverOptions.find((d) => String(d?.id || d?._id || "") === String(id || "")) || null,
    [driverOptions],
  );

  React.useEffect(() => {
    let cancelled = false;
    const fetchDrivers = async () => {
      try {
        const baseUrl = resolveBackendBaseUrl();
        const res = await fetch(`${baseUrl}/api/drivers`, { credentials: "include" });
        if (!res.ok) return;
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        setDriverOptions(Array.isArray(payload?.drivers) ? payload.drivers : []);
      } catch {
        if (cancelled) return;
        setDriverOptions([]);
      }
    };
    fetchDrivers();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!selectedDriverId) return;
    const selected = findDriverById(selectedDriverId);
    if (!selected) return;
    setDriverSearch(getDriverLabel(selected));
  }, [findDriverById, getDriverLabel, selectedDriverId]);

  // Seed dal param URL (report aperto dalla tabella autisti, sopravvive al remount).
  React.useEffect(() => {
    if (initialDriverId) setSelectedDriverId(initialDriverId);
  }, [initialDriverId]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      if (detail?.driverId) {
        const incomingId = String(detail.driverId);
        setSelectedDriverId(incomingId);
        const selected = findDriverById(incomingId);
        if (selected) {
          setDriverSearch(getDriverLabel(selected));
        } else {
          setDriverSearch(incomingId);
        }
      }
    };
    window.addEventListener("truckly:driver-report-open", handler as EventListener);
    return () => window.removeEventListener("truckly:driver-report-open", handler as EventListener);
  }, [findDriverById, getDriverLabel]);

  const runReport = async () => {
    setError(null);
    setDriverResolution(null);

    const query = driverSearch.trim().toLowerCase();
    let selectedDriver = selectedDriverId ? findDriverById(selectedDriverId) : null;
    if (!selectedDriver && query) {
      selectedDriver =
        driverOptions.find((driver) => {
          const mongoId = String(driver?.id || driver?._id || "").toLowerCase();
          const cardId = String(driver?.tachoDriverId || "").toLowerCase();
          return mongoId === query || cardId === query;
        }) || null;
    }
    if (!selectedDriver && query) {
      const matches = driverOptions.filter((driver) => {
        const name = `${driver?.name || ""} ${driver?.surname || ""}`.trim().toLowerCase();
        const mongoId = String(driver?.id || driver?._id || "").toLowerCase();
        const cardId = String(driver?.tachoDriverId || "").toLowerCase();
        return name.includes(query) || mongoId.includes(query) || cardId.includes(query);
      });
      if (matches.length === 1) selectedDriver = matches[0];
    }
    if (!selectedDriver) {
      setError("Seleziona un autista valido dalla ricerca.");
      return;
    }

    const resolvedLocalDriverId = String(selectedDriver?.id || selectedDriver?._id || "");
    const resolvedTachoDriverId = String(selectedDriver?.tachoDriverId || "").trim();

    setLoading(true);
    try {
      const body = {
        localDriverId: resolvedLocalDriverId || undefined,
        tachoDriverId: resolvedTachoDriverId || undefined,
        startDate: toIso(startDate),
        endDate: toIso(endDate),
        timezone: "UTC",
        regulation: 0,
        penalty: 0,
        onlyInfringementsGraphs: false,
        ignoreCountrySelectedInfringements: false,
      };

      const baseUrl = resolveBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/seep/driver-graphs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const flatDays: DayGraph[] = Array.isArray(data?.days)
        ? data.days.filter((d: any) => d && typeof d === "object")
        : [];
      const resolvedDriverId = data?.driver?.resolvedSeepDriverId || "--";
      const strategy = data?.driver?.strategy || "--";
      const selectedName = `${selectedDriver?.name || ""} ${selectedDriver?.surname || ""}`.trim();
      setDriverResolution(`${selectedName || resolvedLocalDriverId} - Seep ID: ${resolvedDriverId} - Strategia: ${strategy}`);
      setSelectedDriverId(resolvedLocalDriverId);
      setDriverSearch(getDriverLabel(selectedDriver));

      setDays(flatDays);
      setExpandedActivityDays({});
      if (!flatDays.length) {
        setError("Nessun grafico SVG restituito per il periodo selezionato.");
      }
    } catch (err: any) {
      setError(err?.message || "Errore nella richiesta report autista.");
    } finally {
      setLoading(false);
    }
  };

  const exportWorkTimesPdf = async () => {
    setError(null);
    const query = driverSearch.trim().toLowerCase();
    let selectedDriver = selectedDriverId ? findDriverById(selectedDriverId) : null;
    if (!selectedDriver && query) {
      selectedDriver =
        driverOptions.find((driver) => {
          const mongoId = String(driver?.id || driver?._id || "").toLowerCase();
          const cardId = String(driver?.tachoDriverId || "").toLowerCase();
          const name = `${driver?.name || ""} ${driver?.surname || ""}`.trim().toLowerCase();
          return mongoId === query || cardId === query || name.includes(query);
        }) || null;
    }
    if (!selectedDriver) {
      setError("Seleziona un autista valido prima di esportare il PDF.");
      return;
    }

    const resolvedLocalDriverId = String(selectedDriver?.id || selectedDriver?._id || "");
    const resolvedTachoDriverId = String(selectedDriver?.tachoDriverId || "").trim();

    try {
      setLoading(true);
      const baseUrl = resolveBackendBaseUrl();
      const res = await fetch(`${baseUrl}/api/seep/driver-graphs/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          localDriverId: resolvedLocalDriverId || undefined,
          tachoDriverId: resolvedTachoDriverId || undefined,
          startDate: toIso(startDate),
          endDate: toIso(endDate),
          timezone: "UTC",
          brand: {
            companyName: "Truckly",
            logoText: "Truckly | Report Ore Lavoro",
            primaryColor: "1f5ecf",
            secondaryColor: "0f172a",
          },
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(`${selectedDriver?.name || ""}_${selectedDriver?.surname || ""}`.trim() || "driver").replace(/\s+/g, "_").toLowerCase()}_work_times.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Errore durante export PDF ore lavoro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
              Grafico attivita autista
            </p>
            <p className="text-sm text-muted-foreground">
              Report attivita e dettagli giornalieri. Contesto veicolo: {selectedDriverImei || "--"}
            </p>
            {driverResolution && (
              <p className="text-xs text-muted-foreground mt-1">{driverResolution}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Autista
          </label>
          <ComboBox
            value={selectedDriverId}
            ariaLabel="Seleziona autista"
            placeholder="Cerca per nome, ID mongo o ID carta..."
            options={driverOptions.map((d) => ({
              value: String(d?.id || d?._id || ""),
              label: getDriverLabel(d),
            }))}
            onChange={(id) => {
              setSelectedDriverId(id);
              const d = driverOptions.find((x) => String(x?.id || x?._id || "") === id);
              setDriverSearch(d ? getDriverLabel(d) : "");
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Inizio
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Fine
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runReport}
            disabled={loading}
            className="rounded-lg bg-accent border border-border px-3 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Caricamento..." : "Aggiorna grafico"}
          </button>
          <button
            onClick={() => {
              const selected = selectedDriverId ? findDriverById(selectedDriverId) : null;
              const localDriverId = selected ? String(selected?.id || selected?._id || "") : "";
              window.dispatchEvent(
                new CustomEvent("truckly:lul-open", {
                  detail: {
                    localDriverId: localDriverId || null,
                    tachoDriverId: selected?.tachoDriverId || null,
                  },
                }),
              );
              window.dispatchEvent(
                new CustomEvent("truckly:bottom-bar-toggle", {
                  detail: { mode: "drivers" },
                }),
              );
            }}
            disabled={loading}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-foreground transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Genera LUL
          </button>
          {error && <p className="text-sm text-down">{error}</p>}
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
                  className="rounded-xl border border-border bg-background p-3 space-y-3"
                >
                  <div
                    className="relative rounded-lg border border-border bg-card p-3 hover:border-border transition overflow-visible"
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
                    <div className="text-xs text-muted-foreground">{formatDateLabel(day.date)}</div>
                    <div
                      className="chart-surface mt-2 w-full overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: sanitizeSvg(day.graph) }}
                    />
                    {isHovered && (
                      <div className="absolute inset-2 border-2 border-black/80 rounded-lg pointer-events-none" />
                    )}
                    {isHovered && (
                      <div
                        className="absolute z-50 w-60 rounded-lg border border-border bg-background text-foreground shadow-xl pointer-events-none"
                        style={{ left, top }}
                      >
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2 text-sm">
                          <span className="font-semibold text-muted-foreground">Attivita</span>
                          <span className="font-semibold text-muted-foreground text-right">Tempo</span>
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
                    <div className="border-t border-border pt-3 space-y-2 text-sm">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedActivityDays((prev) => ({
                            ...prev,
                            [dayKey]: !prev[dayKey],
                          }))
                        }
                        className="flex w-full items-center justify-between text-xs uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition"
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
                              className="flex items-center justify-between text-foreground"
                            >
                              <span>{activity.activityType || "Attivita"}</span>
                              <span className="text-muted-foreground">
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

export function FuelDashboard({
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
    if (!chartFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closeFullscreenChart();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chartFullscreen, closeFullscreenChart]);

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

  const [eventQuery, setEventQuery] = React.useState("");
  const filteredRows = React.useMemo(() => {
    const q = eventQuery.trim().toLowerCase();
    if (!q) return tableRows;
    return tableRows.filter((row) => {
      const label = row.type === "withdrawal" ? "prelievo" : "rifornimento";
      const source = row.source === "manual" ? "manuale" : "rilevato";
      return [label, source, formatShortDateTime(row.start), formatShortDateTime(row.end), formatLiters(row.liters)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [tableRows, eventQuery]);

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
      <div className="space-y-4 min-w-0">
        <div className="rounded-lg border border-border bg-card p-4 space-y-4 shadow-sm min-w-0">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px] flex-1 space-y-1 sm:flex-none">
            <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Da</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Data inizio"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50 sm:w-auto"
            />
          </div>
          <div className="min-w-[150px] flex-1 space-y-1 sm:flex-none">
            <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">A</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Data fine"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50 sm:w-auto"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openFullscreenChart}
              title="Mostra a tutto schermo"
              aria-label="Mostra a tutto schermo"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-accent px-3 text-[11px] uppercase tracking-[0.18em] text-foreground hover:bg-accent transition"
            >
              <i className="fa fa-expand" aria-hidden="true" />
              <span className="hidden sm:inline">Tutto schermo</span>
            </button>
            <button
              type="button"
              onClick={fetchFuelHistory}
              disabled={loading}
              title="Aggiorna"
              aria-label="Aggiorna"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-accent text-foreground hover:bg-accent transition disabled:opacity-50"
            >
              <i className={`fa fa-refresh ${loading ? "fa-spin" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-down">{error}</p>}

        {!error && (
          <div className="rounded-xl border border-border bg-background p-4 overflow-hidden relative">
            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground sm:h-80 lg:h-[420px]">
                Caricamento carburante...
              </div>
            ) : (
              <>
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

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm flex flex-col min-w-0 overflow-x-hidden">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <i className="fa fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={eventQuery}
              onChange={(e) => setEventQuery(e.target.value)}
              placeholder="Cerca evento..."
              aria-label="Cerca evento"
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
            />
          </div>
          <button
            type="button"
            onClick={openNewModal}
            aria-label="Nuovo evento"
            title="Nuovo evento"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-accent text-base text-foreground hover:bg-accent transition"
          >
            <i className="fa fa-plus" aria-hidden="true" />
          </button>
        </div>

        {refuelingsError && (
          <p className="mt-3 text-sm text-down">{refuelingsError}</p>
        )}

        <div className="mt-4 max-w-full min-w-0 overflow-x-hidden">
          {loading ? (
            <div className="rounded-lg border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
              Caricamento eventi carburante...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-lg border border-border bg-background px-3 py-4 text-sm text-muted-foreground">
              {eventQuery ? "Nessun evento corrisponde alla ricerca." : "Nessun evento disponibile per questo intervallo."}
            </div>
          ) : (
            <div className="block w-full max-w-full min-w-0 overflow-x-auto">
              <table className="min-w-[760px] w-full border-separate border-spacing-0 text-sm text-foreground">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
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
                  {filteredRows.map((row) => {
                    const label = row.type === "withdrawal" ? "Prelievo" : "Rifornimento";
                    const tone = row.type === "withdrawal" ? "text-down" : "text-ok";
                    const docs = row.refuelDoc?.attachments?.length || 0;
                    return (
                      <tr key={row.eventId} className="border-t border-border">
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
                              className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:text-foreground hover:border-border transition"
                            >
                              Dettagli
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHideRow(row)}
                              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-border transition"
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
        <div role="dialog" aria-modal="true" aria-label="Grafico carburante a schermo intero" className="fixed inset-0 z-50 bg-black/95 text-foreground">
          <div className="flex h-full w-full flex-col">
            <div className="border-b border-border bg-black/70 px-4 py-3 pt-[env(safe-area-inset-top)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0" />
                <button
                  type="button"
                  onClick={closeFullscreenChart}
                  className="rounded-full border border-border px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-foreground hover:text-foreground hover:border-border transition"
                >
                  Chiudi
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))_auto] md:items-end">
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Da</label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">A</label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
                  />
                </div>
                <button
                  onClick={fetchFuelHistory}
                  disabled={loading}
                  className="h-9 w-full rounded-lg bg-accent border border-border px-3 text-xs font-semibold uppercase tracking-[0.18em] text-foreground hover:bg-accent transition disabled:opacity-50 sm:w-auto"
                >
                  {loading ? "Carico" : "Aggiorna"}
                </button>
              </div>
            </div>
            <div className="flex-1 p-3">
              <div className="h-full w-full rounded-xl border border-border bg-background p-3">
                {loading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
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
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card p-6 pb-0 shadow-sm max-h-[75%]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Gestione evento
            </p>
            <h3 className="text-lg font-semibold text-foreground">Rifornimento / Prelievo</h3>
            <p className="text-sm text-muted-foreground">
              Integra documenti, note e dati dell&apos;evento selezionato.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border h-7 w-7 text-xs text-muted-foreground hover:text-foreground hover:border-border transition inline-flex items-center justify-center"
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
              <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "refuel" | "withdrawal")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              >
                <option value="refuel">Rifornimento</option>
                <option value="withdrawal">Prelievo</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Litri</label>
              <input
                value={litersInput}
                onChange={(e) => setLitersInput(e.target.value)}
                placeholder="Es. 120"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Inizio</label>
              <input
                type="datetime-local"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Fine</label>
              <input
                type="datetime-local"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Stazione</label>
              <input
                value={station}
                onChange={(e) => setStation(e.target.value)}
                placeholder="Nome distributore"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Riferimento fattura</label>
              <input
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="Es. FT-2026-001"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Prezzo/L</label>
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="Es. 1.75"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Serbatoio 1</label>
              <input
                value={tankPrimaryInput}
                onChange={(e) => setTankPrimaryInput(e.target.value)}
                placeholder="Litri"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Serbatoio 2</label>
              <input
                value={tankSecondaryInput}
                onChange={(e) => setTankSecondaryInput(e.target.value)}
                placeholder="Litri"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Note aggiuntive sull'evento"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.1em] text-muted-foreground">Documenti</label>
            <input
              type="file"
              multiple
              onChange={(e) => setAttachments(Array.from(e.target.files || []))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:text-foreground hover:file:bg-accent"
            />
            {attachments.length > 0 && (
              <p className="text-xs text-muted-foreground">{attachments.length} file selezionati</p>
            )}
          </div>

          {error && <p className="text-sm text-down">{error}</p>}

          </div>
        </form>
        <div className="-mx-6 mt-auto border-t border-border bg-card px-6 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground hover:border-border transition"
            >
              Annulla
            </button>
            <button
              type="submit"
              form="refuel-form"
              disabled={loading}
              className="rounded-lg bg-brand border border-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-foreground hover:bg-brand/90 transition disabled:opacity-50"
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
    const tank2HasData =
      Array.isArray(tank2) && tank2.some((p: any) => Number.isFinite(p?.[1]) && p[1] > 0);
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
          boundaryGap: false,
          axisLine: { lineStyle: { color: "rgba(255,255,255,0.10)" } },
          axisLabel: { color: "#9ca3af", fontSize: compact ? 10 : 12, hideOverlap: true },
          axisTick: { show: false },
          splitLine: { show: false },
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
              color: "#ff7a1a",
              fontSize: compact ? 10 : 12,
              padding: [0, 0, compact ? 4 : 8, 0],
            },
            axisLine: { lineStyle: { color: "#ff7a1a" } },
            axisLabel: {
              color: "#ff7a1a",
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
                backgroundColor: "rgba(255,255,255,0.04)",
                fillerColor: "rgba(255,122,26,0.18)",
                borderColor: "transparent",
                handleIcon:
                  "M8.7,11.8v-7.6h2.6v7.6zM13,11.8v-7.6h2.6v7.6z",
                handleSize: "120%",
                handleStyle: { color: "#ff7a1a" },
                textStyle: { color: "#cbd5f5" },
              },
            ]
          : [{ type: "inside", xAxisIndex: 0 }],
        legend: {
          type: "scroll",
          data: ["Livello carburante", "Serbatoio 1", "Serbatoio 2", "Velocita"],
          // Velocità OFF di default (troppo rumorosa); Serbatoio 2 solo se ha dati.
          selected: { Velocita: false, "Serbatoio 2": tank2HasData },
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
            smooth: 0.3,
            showSymbol: false,
            sampling: "lttb",
            symbol: "circle",
            symbolSize: 7,
            emphasis: { focus: "series" },
            lineStyle: { width: 2.6, color: "#ff7a1a" },
            itemStyle: { color: "#ff7a1a" },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(255,122,26,0.30)" },
                { offset: 1, color: "rgba(255,122,26,0.02)" },
              ]),
            },
            data: fuel,
            markArea: spans.length ? { silent: true, data: spans } : undefined,
          },
          {
            name: "Serbatoio 1",
            type: "line",
            smooth: 0.3,
            showSymbol: false,
            sampling: "lttb",
            emphasis: { focus: "series" },
            lineStyle: { width: 1.4, color: "#34d399", type: "dashed" },
            itemStyle: { color: "#34d399" },
            data: tank1,
          },
          {
            name: "Serbatoio 2",
            type: "line",
            smooth: 0.3,
            showSymbol: false,
            sampling: "lttb",
            emphasis: { focus: "series" },
            lineStyle: { width: 1.4, color: "#c084fc", type: "dashed" },
            itemStyle: { color: "#c084fc" },
            data: tank2,
          },
          {
            name: "Velocita",
            type: "line",
            smooth: 0.3,
            showSymbol: false,
            sampling: "lttb",
            emphasis: { focus: "series" },
            lineStyle: { width: 1.2, color: "#60a5fa", opacity: 0.75 },
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
        className={`flex items-center justify-center text-sm text-muted-foreground ${sizeClasses} ${className || ""}`}
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
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground min-w-0"
          >
            <span className="truncate">{label}</span>
            <span className="text-muted-foreground whitespace-nowrap">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}



