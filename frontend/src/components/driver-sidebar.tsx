import React from "react";
import { createPortal } from "react-dom";
import { API_BASE_URL } from "../config";
import { dataManager, resolveBackendBaseUrl } from "../lib/data-manager";
import { TagInput } from "./tag-input";
import { RouteCalculator } from "./route-calculator";
import { TabSwitch } from "./ui/tab-switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type DriverSidebarProps = {
  isOpen: boolean;
  onClose?: () => void;
  selectedDriverImei?: string | null;
  selectedRouteImei?: string | null;
  selectedDriverDevice?: any | null;
  mode?: "driver" | "routes" | "navigation" | "geofence" | "vehicle" | "driver-register";
  driverEditTarget?: DriverEditTarget | null;
  driverEditReadOnly?: boolean;
  vehicleEditTarget?: VehicleEditTarget | null;
  vehicleEditFocus?: "tags" | null;
  geofenceDraft?: {
    geofenceId: string;
    imei: string;
    center: { lng: number; lat: number };
    radiusMeters: number;
  } | null;
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

type RoutePoint = {
  timestamp: number;
  gps: {
    Latitude: number;
    Longitude: number;
    Speed: number;
  };
  io: {
    ignition: number;
    totalOdometer?: number | null;
    odometer?: number | null;
    fuelLevel?: number | null;
    driver1Id?: string | null;
    tachoDriverIds?: string | null;
  };
};

type RouteTimelineEvent = {
  id: string;
  kind: "pause" | "rest" | "refuel" | "withdrawal" | "driver-change";
  label: string;
  start: number;
  end: number;
  durationMin: number | null;
  liters?: number | null;
  driverFrom?: string | null;
  driverTo?: string | null;
  lat: number | null;
  lng: number | null;
};

type RouteRefuelingDoc = {
  eventId: string;
  eventStart?: string | number | Date;
  eventEnd?: string | number | Date;
  liters?: number | null;
  metadata?: Record<string, any>;
};

type RouteEventKind = RouteTimelineEvent["kind"];

type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: number | null;
  privilege: number | null;
  createdAt: string | number | null;
};

type AdminCompany = {
  id: string;
  name: string;
  createdAt: string | number | null;
  updatedAt?: string | number | null;
  userCount: number;
  users: AdminUser[];
};

type TachoDriverOption = {
  id: string;
  name: string;
  surname: string;
  cardName?: string | null;
  cardNumber?: string | null;
  phone?: string | null;
};

type DriverEditTarget = {
  id?: string | null;
  _id?: string | null;
  name?: string | null;
  surname?: string | null;
  phone?: string | null;
  tachoDriverId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
};


type VehicleEditTarget = {
  id?: string | null;
  _id?: string | null;
  imei?: string | null;
  nickname?: string | null;
  plate?: string | { v?: string; value?: string } | null;
  brand?: string | null;
  model?: string | null;
  vehicleType?: string | null;
  deviceModel?: string | null;
  codec?: string | null;
  tags?: string[];
  details?: {
    tanks?: {
      primary?: { capacity?: number | null; unit?: string | null };
      secondary?: { capacity?: number | null; unit?: string | null };
    };
    sim?: {
      prefix?: string | null;
      number?: string | null;
      iccid?: string | null;
    };
  };
};



const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

const BASE_DRIVING_H = 9;
const BASE_WORK_H = 13;
const WEEK_DRIVE_H = 56;
const BIWEEK_DRIVE_H = 90;

const EXTRA_DRIVE_H = 1;
const EXTRA_WORK_H = 2;

const CONT_DRIVE_LIMIT_H = 4.5;
const BREAK_FULL_MIN = 45;
const BREAK_SPLIT_A_MIN = 15;
const BREAK_SPLIT_B_MIN = 30;

const STATE_MAP: Record<string | number, "resting" | "working" | "driving"> = {
  0: "resting",
  2: "working",
  3: "driving",
  5: "resting",
  resting: "resting",
  working: "working",
  driving: "driving",
  unlogged: "resting",
};

type DriverMetricsBucket = {
  drive_hours: number;
  work_hours: number;
  rest_hours: number;
  extra_drive_hours: number;
  extra_work_hours: number;
  continuous_rest_hours?: number;
  drive_extensions_used_before_today?: number;
  drive_extensions_used?: number;
  drive_since_break_hours?: number;
  break_credit_min?: number;
  break_ok?: boolean;
  break_needed_min?: number;
  break_remaining_min?: number;
  drive_until_break_remaining_min?: number;
  valid?: boolean;
};

type DriverMetrics = {
  biweekly: DriverMetricsBucket;
  weekly: DriverMetricsBucket;
  daily: DriverMetricsBucket;
  session: DriverMetricsBucket & { valid?: boolean };
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

const getDefaultRouteRange = () => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const hoursSinceMidnight = (now.getTime() - midnight.getTime()) / 3_600_000;
  const from = new Date(midnight.getTime() - (hoursSinceMidnight > 4 ? 0 : 86_400_000));
  return { from, to: now };
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

const normalizeRouteHistory = (raw: any[] = []): RoutePoint[] => {
  const toFinite = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const toDriverText = (value: unknown) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length ? text : null;
  };
  const normalized = raw
    .map((entry) => {
      const gps = entry?.gps || entry?.data?.gps || entry?.data || {};
      const io = entry?.io || entry?.data?.io || {};
      const ts = toTimestamp(entry?.timestamp ?? entry?.ts ?? gps?.timestamp ?? io?.timestamp);
      const lat = Number(gps?.Latitude ?? gps?.latitude ?? gps?.lat);
      const lon = Number(gps?.Longitude ?? gps?.longitude ?? gps?.lon);
      if (!Number.isFinite(ts) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const speed = Number(gps?.Speed ?? gps?.speed ?? io?.speed ?? 0);
      const ignition = Number(
        io?.ignition ?? io?.ignitionStatus ?? io?.Ignition ?? io?.ign ?? 0,
      );
      const totalOdometer = toFinite(io?.totalOdometer ?? io?.total_odometer);
      const odometerIo = toFinite(io?.odometer ?? io?.Odometer ?? io?.vehicleOdometer);
      // Livello carburante per-punto in litri: CAN-bus (current_fuel/fuel_total) o sonde gia in litri (tank*).
      const fuelLevel = toFinite(
        io?.current_fuel ?? io?.currentFuel ?? io?.fuel_total ?? io?.fuelTotal ??
        io?.fuel ?? io?.tank ?? io?.tank1 ?? io?.tank_1 ?? io?.tankPrimary ?? io?.tankLiters,
      );
      return {
        timestamp: ts as number,
        gps: {
          Latitude: lat,
          Longitude: lon,
          Speed: Number.isFinite(speed) ? speed : 0,
        },
        io: {
          ignition: Number.isFinite(ignition) ? ignition : 0,
          totalOdometer,
          odometer: odometerIo,
          fuelLevel,
          driver1Id: toDriverText(io?.driver1Id),
          tachoDriverIds: toDriverText(io?.tachoDriverIds),
        },
      };
    })
    .filter(Boolean) as RoutePoint[];

  normalized.sort((a, b) => a.timestamp - b.timestamp);
  return normalized;
};

const downsampleRoute = (history: RoutePoint[], maxPoints = 2000) => {
  if (history.length <= maxPoints) return history;
  const step = Math.ceil(history.length / maxPoints);
  const sampled = history.filter((_, idx) => idx % step === 0);
  const last = history[history.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
};

const getVehicleStateClass = (speed = 0, ignition = 0) => {
  const v = Number(speed) || 0;
  const ig = Number(ignition) || 0;
  if (v > 5) return "success";
  if (v <= 5 && ig === 0) return "danger";
  if (v <= 5 && ig === 1) return "warning";
  return "";
};

const normalizeFuelEvent = (raw: any = {}) => {
  const toNumber = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const eventId = raw.eventId || raw._id;
  const start = toNumber(raw.startMs ?? raw.start ?? raw.eventStart);
  const end = toNumber(raw.endMs ?? raw.end ?? raw.eventEnd ?? start);
  if (!eventId || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  const normalizedTypeRaw = String(raw.normalizedType || raw.type || "refuel")
    .toLowerCase()
    .trim();
  const normalizedType = normalizedTypeRaw === "rifornimento" ? "refuel" : normalizedTypeRaw;
  return {
    eventId: String(eventId),
    normalizedType,
    start: start as number,
    end: Number.isFinite(end) ? (end as number) : (start as number),
    liters: toNumber(raw.liters ?? raw.delta),
    delta: toNumber(raw.delta),
    lat: toNumber(raw.lat ?? raw.latitude),
    lng: toNumber(raw.lng ?? raw.lon ?? raw.longitude),
  };
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

const formatDurationMinutes = (value: number | null) => {
  if (!Number.isFinite(value as number)) return "N/D";
  const total = Math.max(0, Math.round(value as number));
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (hh <= 0) return `${mm} min`;
  return `${hh}h ${String(mm).padStart(2, "0")}m`;
};

const escapeReportHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeRouteRefuelings = (items: any[] = []): RouteRefuelingDoc[] => {
  return items
    .map((doc) => {
      const eventId = String(doc?.eventId || "").trim();
      if (!eventId) return null;
      return {
        eventId,
        eventStart: doc?.eventStart,
        eventEnd: doc?.eventEnd,
        liters: Number.isFinite(Number(doc?.liters)) ? Number(doc.liters) : null,
        metadata: doc?.metadata && typeof doc.metadata === "object" ? doc.metadata : {},
      } as RouteRefuelingDoc;
    })
    .filter(Boolean) as RouteRefuelingDoc[];
};

const resolveRouteFuelType = (doc?: RouteRefuelingDoc, evt?: any) => {
  const metaType = String(doc?.metadata?.type || "").toLowerCase().trim();
  if (metaType === "withdrawal" || metaType === "prelievo") return "withdrawal";
  if (metaType === "refuel" || metaType === "rifornimento") return "refuel";
  const normalized = String(evt?.normalizedType || "").toLowerCase().trim();
  if (normalized === "withdrawal" || normalized === "fuel_withdrawal" || normalized === "fuel-theft" || normalized === "theft") {
    return "withdrawal";
  }
  return "refuel";
};

const mergeRouteFuelEvents = (
  events: any[],
  refuelings: RouteRefuelingDoc[],
  fromMs: number,
  toMs: number,
) => {
  const list = Array.isArray(events) ? events : [];
  const docs = Array.isArray(refuelings) ? refuelings : [];
  const hiddenIds = new Set(
    docs
      .filter((doc) => doc?.metadata?.hidden)
      .map((doc) => doc.eventId),
  );
  const refuelById = new Map(docs.map((doc) => [doc.eventId, doc]));
  const merged: any[] = [];

  list.forEach((evt) => {
    const eventId = String(evt?.eventId || "").trim();
    if (!eventId || hiddenIds.has(eventId)) return;
    const start = Number(evt?.start);
    if (!Number.isFinite(start) || start < fromMs || start > toMs) return;
    const doc = refuelById.get(eventId);
    const liters = Number.isFinite(Number(doc?.liters))
      ? Number(doc?.liters)
      : Number.isFinite(Number(evt?.liters))
        ? Number(evt?.liters)
        : Number.isFinite(Number(evt?.delta))
          ? Number(evt?.delta)
          : null;
    merged.push({
      ...evt,
      eventId,
      normalizedType: resolveRouteFuelType(doc, evt),
      liters,
    });
  });

  docs.forEach((doc) => {
    if (!doc?.eventId || hiddenIds.has(doc.eventId)) return;
    if (list.some((evt) => String(evt?.eventId || "").trim() === doc.eventId)) return;
    const start = toTimestamp(doc.eventStart);
    const end = toTimestamp(doc.eventEnd) ?? start;
    if (!Number.isFinite(start) || start! < fromMs || start! > toMs) return;
    merged.push({
      eventId: doc.eventId,
      start: start as number,
      end: Number.isFinite(end) ? (end as number) : (start as number),
      liters: Number.isFinite(Number(doc?.liters)) ? Number(doc?.liters) : null,
      delta: Number.isFinite(Number(doc?.liters)) ? Number(doc?.liters) : null,
      normalizedType: resolveRouteFuelType(doc),
      lat: null,
      lng: null,
    });
  });

  return merged.sort((a, b) => Number(a?.start || 0) - Number(b?.start || 0));
};

const STATIONARY_SPEED_THRESHOLD = 5;
const MIN_STOP_EVENT_MS = 5 * 60 * 1000;

const resolveMotionState = (point: RoutePoint) => {
  const speed = Number(point?.gps?.Speed) || 0;
  const ignition = Number(point?.io?.ignition) || 0;
  if (speed > STATIONARY_SPEED_THRESHOLD) return "driving";
  if (ignition === 1) return "pause";
  return "rest";
};

const findNearestHistoryPoint = (history: RoutePoint[], timestamp: number) => {
  if (!history.length || !Number.isFinite(timestamp)) return null;
  let nearest: RoutePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  history.forEach((point) => {
    const distance = Math.abs((point?.timestamp || 0) - timestamp);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = point;
    }
  });
  return nearest;
};

const buildStopEvents = (history: RoutePoint[]): RouteTimelineEvent[] => {
  if (!Array.isArray(history) || history.length < 2) return [];
  const events: RouteTimelineEvent[] = [];
  let segmentStart = 0;
  let segmentState = resolveMotionState(history[0]);

  const closeSegment = (endIndex: number) => {
    if (segmentState === "driving") return;
    const from = history[segmentStart];
    const to = history[endIndex];
    if (!from || !to) return;
    const durationMs = Math.max(0, (to.timestamp || 0) - (from.timestamp || 0));
    if (durationMs < MIN_STOP_EVENT_MS) return;
    const midIndex = Math.floor((segmentStart + endIndex) / 2);
    const anchor = history[midIndex] || from;
    events.push({
      id: `${segmentState}-${from.timestamp}-${to.timestamp}`,
      kind: segmentState === "pause" ? "pause" : "rest",
      label: segmentState === "pause" ? "Pausa" : "Riposo",
      start: from.timestamp,
      end: to.timestamp,
      durationMin: Number((durationMs / 60000).toFixed(1)),
      lat: Number.isFinite(anchor?.gps?.Latitude) ? anchor.gps.Latitude : null,
      lng: Number.isFinite(anchor?.gps?.Longitude) ? anchor.gps.Longitude : null,
    });
  };

  for (let i = 1; i < history.length; i += 1) {
    const currentState = resolveMotionState(history[i]);
    if (currentState !== segmentState) {
      closeSegment(i - 1);
      segmentStart = i;
      segmentState = currentState;
    }
  }
  closeSegment(history.length - 1);
  return events;
};

const normalizeDriverToken = (value: unknown) => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const first = raw.split(/[,\s;|/]+/).map((part) => part.trim()).find(Boolean);
  return first || null;
};

const extractDriverIdFromPoint = (point: RoutePoint) => {
  const fromDriver1 = normalizeDriverToken(point?.io?.driver1Id);
  if (fromDriver1) return fromDriver1;
  return normalizeDriverToken(point?.io?.tachoDriverIds);
};

const buildDriverChangeEvents = (history: RoutePoint[]): RouteTimelineEvent[] => {
  if (!Array.isArray(history) || history.length < 2) return [];
  const events: RouteTimelineEvent[] = [];
  let prevDriver = extractDriverIdFromPoint(history[0]);
  for (let i = 1; i < history.length; i += 1) {
    const point = history[i];
    const currentDriver = extractDriverIdFromPoint(point);
    const isDriverSwap =
      Boolean(prevDriver) &&
      Boolean(currentDriver) &&
      currentDriver !== prevDriver;
    if (isDriverSwap) {
      const previousPoint = history[i - 1] || point;
      events.push({
        id: `driver-change-${point.timestamp}-${i}`,
        kind: "driver-change",
        label: "Cambio autista",
        start: point.timestamp,
        end: point.timestamp,
        durationMin: null,
        driverFrom: prevDriver,
        driverTo: currentDriver,
        lat: Number.isFinite(point?.gps?.Latitude) ? point.gps.Latitude : previousPoint?.gps?.Latitude ?? null,
        lng: Number.isFinite(point?.gps?.Longitude) ? point.gps.Longitude : previousPoint?.gps?.Longitude ?? null,
      });
    }
    prevDriver = currentDriver;
  }
  return events;
};

const buildTimelineEvents = (history: RoutePoint[], rawFuelEvents: any[]): RouteTimelineEvent[] => {
  const stopEvents = buildStopEvents(history);
  const driverChangeEvents = buildDriverChangeEvents(history);
  const fuelEvents = (Array.isArray(rawFuelEvents) ? rawFuelEvents : [])
    .map((evt: any) => {
      const nearest = findNearestHistoryPoint(history, Number(evt?.start));
      const kindRaw = String(evt?.normalizedType || "").toLowerCase();
      const kind: RouteTimelineEvent["kind"] =
        kindRaw === "withdrawal" || kindRaw === "fuel_withdrawal" || kindRaw === "fuel-theft" || kindRaw === "theft"
          ? "withdrawal"
          : "refuel";
      const label = kind === "withdrawal" ? "Prelievo" : "Rifornimento";
      return {
        id: String(evt?.eventId || `${kind}-${evt?.start || Date.now()}`),
        kind,
        label,
        start: Number(evt?.start) || 0,
        end: Number(evt?.end) || Number(evt?.start) || 0,
        durationMin: Number.isFinite(evt?.end) && Number.isFinite(evt?.start)
          ? Number((((Number(evt.end) - Number(evt.start)) / 60000)).toFixed(1))
          : null,
        liters: Number.isFinite(evt?.liters) ? Number(evt.liters) : null,
        lat: Number.isFinite(evt?.lat) ? Number(evt.lat) : (nearest?.gps?.Latitude ?? null),
        lng: Number.isFinite(evt?.lng) ? Number(evt.lng) : (nearest?.gps?.Longitude ?? null),
      } as RouteTimelineEvent;
    })
    .filter((evt) => Number.isFinite(evt.start) && evt.start > 0);

  return [...stopEvents, ...driverChangeEvents, ...fuelEvents].sort((a, b) => b.start - a.start);
};

const toKilometersFromOdometerRaw = (value: number | null | undefined) => {
  if (!Number.isFinite(value as number)) return null;
  const raw = Number(value);
  if (raw <= 0) return null;
  // Teltonika odometer values are often meters on IO channels.
  return raw > 1_000_000 ? raw / 1000 : raw;
};

const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

const routeHaversineKm = (history: RoutePoint[]) => {
  if (!Array.isArray(history) || history.length < 2) return null;
  let total = 0;
  for (let i = 1; i < history.length; i += 1) {
    const a = history[i - 1]?.gps;
    const b = history[i]?.gps;
    if (!a || !b) continue;
    if (![a.Latitude, a.Longitude, b.Latitude, b.Longitude].every(Number.isFinite)) continue;
    total += haversineKm(a.Latitude, a.Longitude, b.Latitude, b.Longitude);
  }
  return total > 0 ? Number(total.toFixed(1)) : null;
};

const computeRouteDistanceKm = (history: RoutePoint[]) => {
  if (!Array.isArray(history) || history.length < 2) return null;
  const samples = history
    .map((point) => {
      const raw =
        point?.io?.totalOdometer
        ?? point?.io?.odometer
        ?? null;
      return toKilometersFromOdometerRaw(raw);
    })
    .filter((value) => Number.isFinite(value as number)) as number[];
  if (samples.length >= 2) {
    const delta = samples[samples.length - 1] - samples[0];
    if (Number.isFinite(delta) && delta >= 0) return Number(delta.toFixed(1));
  }
  // Fallback: somma Haversine sui punti GPS quando l'odometro manca o e incoerente.
  return routeHaversineKm(history);
};

const resolveHeading = (history: RoutePoint[], index: number) => {
  if (!history.length) return 0;
  const prev = history[Math.max(0, index - 1)];
  const next = history[Math.min(history.length - 1, index + 1)];
  const dx = (next?.gps?.Longitude ?? 0) - (prev?.gps?.Longitude ?? 0);
  const dy = (next?.gps?.Latitude ?? 0) - (prev?.gps?.Latitude ?? 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

const CARDINALS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;

// resolveHeading restituisce atan2(dLat, dLng): 0 = Est, 90 = Nord (convenzione matematica).
const headingMathToCardinal = (mathDeg: number) => {
  const compass = (((90 - mathDeg) % 360) + 360) % 360;
  return CARDINALS[Math.round(compass / 45) % 8];
};

const computeOverallDirection = (history: RoutePoint[]): string | null => {
  if (!Array.isArray(history) || history.length < 2) return null;
  const a = history[0]?.gps;
  const b = history[history.length - 1]?.gps;
  if (!a || !b) return null;
  if (![a.Latitude, a.Longitude, b.Latitude, b.Longitude].every(Number.isFinite)) return null;
  const dx = b.Longitude - a.Longitude;
  const dy = b.Latitude - a.Latitude;
  if (dx === 0 && dy === 0) return null;
  return headingMathToCardinal((Math.atan2(dy, dx) * 180) / Math.PI);
};

// Gasolio consumato (litri): (livello iniziale - finale) + rifornimenti - prelievi.
const computeFuelConsumedLiters = (
  history: RoutePoint[],
  events: RouteTimelineEvent[],
): number | null => {
  if (!Array.isArray(history) || history.length < 2) return null;
  const levels = history
    .map((p) => (Number.isFinite(p?.io?.fuelLevel as number) ? Number(p.io.fuelLevel) : null))
    .filter((v): v is number => v != null);
  if (levels.length < 2) return null;
  let refuels = 0;
  let withdrawals = 0;
  (Array.isArray(events) ? events : []).forEach((e) => {
    if (e.kind === "refuel" && Number.isFinite(e.liters as number)) refuels += Number(e.liters);
    if (e.kind === "withdrawal" && Number.isFinite(e.liters as number)) withdrawals += Number(e.liters);
  });
  const consumed = levels[0] - levels[levels.length - 1] + refuels - withdrawals;
  return consumed > 0 ? Number(consumed.toFixed(1)) : null;
};

const computeAvgConsumption = (
  consumedL: number | null,
  distanceKm: number | null,
): number | null => {
  if (consumedL == null || distanceKm == null || distanceKm <= 0) return null;
  return Number(((consumedL / distanceKm) * 100).toFixed(1));
};

type LongStopsSummary = { onCount: number; onMin: number; offCount: number; offMin: number };

// Soste oltre soglia (default 15 min), separate per motore acceso (pause) / spento (rest).
const computeLongStops = (
  events: RouteTimelineEvent[],
  thresholdMin = 15,
): LongStopsSummary => {
  const summary: LongStopsSummary = { onCount: 0, onMin: 0, offCount: 0, offMin: 0 };
  (Array.isArray(events) ? events : []).forEach((evt) => {
    if ((evt.kind !== "pause" && evt.kind !== "rest") || !Number.isFinite(evt.durationMin as number)) return;
    const min = Number(evt.durationMin);
    if (min <= thresholdMin) return;
    if (evt.kind === "pause") {
      summary.onCount += 1;
      summary.onMin += min;
    } else {
      summary.offCount += 1;
      summary.offMin += min;
    }
  });
  summary.onMin = Number(summary.onMin.toFixed(0));
  summary.offMin = Number(summary.offMin.toFixed(0));
  return summary;
};

const emptyParams = (): DriverMetrics => ({
  biweekly: { drive_hours: 0, work_hours: 0, extra_drive_hours: 0, extra_work_hours: 0, rest_hours: 0 },
  weekly: { drive_hours: 0, work_hours: 0, extra_drive_hours: 0, extra_work_hours: 0, rest_hours: 0 },
  daily: { drive_hours: 0, work_hours: 0, extra_drive_hours: 0, extra_work_hours: 0, rest_hours: 0 },
  session: { drive_hours: 0, work_hours: 0, extra_drive_hours: 0, extra_work_hours: 0, rest_hours: 0, valid: false },
});

const getCurrentDayStart = (referenceTs: number) => {
  const ref = Number.isFinite(referenceTs) ? new Date(referenceTs) : new Date();
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
};

const getCurrentWeekStart = (referenceTs: number) => {
  const ref = Number.isFinite(referenceTs) ? new Date(referenceTs) : new Date();
  const day = ref.getDay();
  const diff = (day + 6) % 7;
  const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  monday.setDate(monday.getDate() - diff);
  return monday.getTime();
};

const computeContinuousRestHours = (history: any[], nowMs: number) => {
  if (!Array.isArray(history) || history.length === 0) return 0;
  let accMs = 0;
  const last = history[history.length - 1];
  const tailA = +new Date(last.timestamp);
  if ((STATE_MAP[last.to_state] || "resting") === "resting") {
    accMs += Math.max(0, nowMs - tailA);
  }

  for (let i = history.length - 1; i > 0; i -= 1) {
    const curr = history[i];
    const prev = history[i - 1];
    const t0 = +new Date(prev.timestamp);
    const t1 = +new Date(curr.timestamp);
    if (t1 <= t0) continue;
    const active = STATE_MAP[prev.to_state] || "resting";
    if (active === "resting") {
      accMs += t1 - t0;
    } else {
      break;
    }
  }
  return accMs / MS_HOUR;
};

const computeDrivingBreakState = (history: any[], nowMs: number) => {
  if (!Array.isArray(history) || history.length === 0) {
    return {
      drive_since_break_hours: 0,
      break_credit_min: 0,
      break_ok: false,
      break_needed_min: BREAK_FULL_MIN,
      break_remaining_min: BREAK_FULL_MIN,
      drive_until_break_remaining_min: CONT_DRIVE_LIMIT_H * 60,
    };
  }

  const segs: Array<{ state: string; a: number; b: number }> = [];
  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1];
    const curr = history[i];
    if (!prev?.timestamp || !curr?.timestamp) continue;
    const a = +new Date(prev.timestamp);
    const b = +new Date(curr.timestamp);
    if (b <= a) continue;
    const state = STATE_MAP[prev.to_state] || "resting";
    segs.push({ state, a, b });
  }

  const last = history[history.length - 1];
  if (last?.timestamp) {
    const tailA = +new Date(last.timestamp);
    if (nowMs > tailA) {
      segs.push({ state: STATE_MAP[last.to_state] || "resting", a: tailA, b: nowMs });
    }
  }

  let driveMs = 0;
  let breakSegments: number[] = [];
  let lastWasDriving = false;

  const flushBreakIfValid = () => {
    if (breakSegments.some((min) => min >= BREAK_FULL_MIN)) return true;
    if (breakSegments.length >= 2) {
      const first = breakSegments[0] || 0;
      const lastSeg = breakSegments[breakSegments.length - 1] || 0;
      const sum = breakSegments.reduce((s, n) => s + n, 0);
      if (first >= BREAK_SPLIT_A_MIN && lastSeg >= BREAK_SPLIT_B_MIN && sum >= BREAK_FULL_MIN) {
        return true;
      }
    }
    return false;
  };

  const resetChain = () => {
    driveMs = 0;
    breakSegments = [];
    lastWasDriving = false;
  };

  for (const s of segs) {
    const durMin = (s.b - s.a) / MS_MIN;

    if (s.state === "driving") {
      lastWasDriving = true;
      driveMs += s.b - s.a;
      if (flushBreakIfValid()) {
        resetChain();
        driveMs += s.b - s.a;
        lastWasDriving = true;
      }
    } else if (s.state === "resting") {
      if (lastWasDriving) {
        breakSegments.push(durMin);
      }
      if (flushBreakIfValid()) {
        resetChain();
      }
    } else {
      if (flushBreakIfValid()) {
        resetChain();
      }
    }
  }

  if (flushBreakIfValid()) resetChain();

  const driveH = driveMs / MS_HOUR;
  const breakCredit = breakSegments.reduce((s, n) => s + n, 0);
  const needMin = BREAK_FULL_MIN;
  const remaining = Math.max(
    0,
    needMin -
      Math.max(
        Math.max(...breakSegments, 0),
        breakSegments.length >= 2 &&
          breakSegments[0] >= BREAK_SPLIT_A_MIN &&
          breakSegments[breakSegments.length - 1] >= BREAK_SPLIT_B_MIN
          ? Math.min(needMin, breakCredit)
          : 0,
      ),
  );

  return {
    drive_since_break_hours: driveH,
    break_credit_min: breakCredit,
    break_ok: remaining === 0,
    break_needed_min: needMin,
    break_remaining_min: remaining,
    drive_until_break_remaining_min: Math.max(0, CONT_DRIVE_LIMIT_H * 60 - driveH * 60),
  };
};

const computeWeeklyDriveExtensions = (history: any[], weekStart: number, now: number) => {
  const perDayMs = new Map<string, number>();
  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1];
    const curr = history[i];
    if (!prev?.timestamp || !curr?.timestamp) continue;
    let a = +new Date(prev.timestamp);
    const b = +new Date(curr.timestamp);
    if (b <= a || b < weekStart) continue;

    const active = STATE_MAP[prev.to_state] || "resting";
    if (active !== "driving") continue;

    a = Math.max(a, weekStart);
    while (a < b) {
      const dayKey = new Date(a).toISOString().slice(0, 10);
      const dayEnd = getCurrentDayStart(a) + MS_DAY;
      const segEnd = Math.min(b, dayEnd);
      const seg = segEnd - a;
      perDayMs.set(dayKey, (perDayMs.get(dayKey) || 0) + seg);
      a = segEnd;
    }
  }

  const todayKey = new Date(getCurrentDayStart(now)).toISOString().slice(0, 10);
  let usedBeforeToday = 0;
  let usedIncludingToday = 0;
  for (const [key, ms] of perDayMs.entries()) {
    const hours = ms / MS_HOUR;
    if (hours > BASE_DRIVING_H) {
      usedIncludingToday += 1;
      if (key !== todayKey) usedBeforeToday += 1;
    }
  }
  return { usedBeforeToday, usedIncludingToday };
};

const getDriver1FromDevice = (device: any) => {
  const io =
    device?.data?.io ||
    device?.io ||
    device?.data?.data?.io ||
    device?.data ||
    {};
  const tacho = io?.tachoDriverIds || {};
  const driver1 = tacho?.driver1 || null;
  return typeof driver1 === "string" && driver1.trim() ? driver1.trim() : driver1;
};

const fetchDriverHistory = async (
  driverId: string,
  baseUrl: string,
  from: number,
  to: number,
) => {
  const res = await fetch(`${baseUrl}/dashboard/drivers/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ d: driverId, from, to }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.history)) return data.history;
  return [];
};

const compileDriverMetrics = async (driverId: string, baseUrl: string) => {
  if (!driverId) return null;
  const now = Date.now();
  const biweekStart = getCurrentWeekStart(now - 7 * MS_DAY);
  const weekStart = getCurrentWeekStart(now);
  const dayStart = getCurrentDayStart(now);

  const history = await fetchDriverHistory(driverId, baseUrl, biweekStart, now);
  if (!Array.isArray(history) || history.length < 2) return emptyParams();
  history.sort(
    (a, b) => +new Date(a.timestamp || 0) - +new Date(b.timestamp || 0),
  );

  const rev = [...history].sort(
    (a, b) => +new Date(b.timestamp || 0) - +new Date(a.timestamp || 0),
  );
  const sessionCandidates = rev
    .filter(
      (ev) =>
        ev?.from_state === 5 &&
        +new Date(ev.timestamp || 0) >= now - 2 * MS_DAY,
    )
    .sort(
      (a, b) => +new Date(a.timestamp || 0) - +new Date(b.timestamp || 0),
    );
  const sessionStartTs =
    sessionCandidates.length > 0
      ? sessionCandidates[sessionCandidates.length - 1]?.timestamp
      : dayStart;
  const sessionFound = sessionCandidates.length > 0;

  const windows = [
    { a: biweekStart, b: now, key: "biweekly" as const },
    { a: weekStart, b: now, key: "weekly" as const },
    { a: dayStart, b: now, key: "daily" as const },
    { a: +new Date(sessionStartTs), b: now, key: "session" as const },
  ];

  const parameters = emptyParams();

  const bucketKeys = (aMs: number, bMs: number) =>
    windows.filter((w) => w.a < aMs && w.b >= bMs).map((w) => w.key);

  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1];
    const curr = history[i];
    if (!prev?.timestamp || !curr?.timestamp) continue;

    const t0 = +new Date(prev.timestamp);
    const t1 = +new Date(curr.timestamp);
    if (t1 <= t0) continue;

    const activeState = STATE_MAP[prev.to_state] || "resting";
    const deltaH = (t1 - t0) / MS_HOUR;
    const keys = bucketKeys(t0, t1);

    for (const key of keys) {
      if (activeState === "driving") {
        parameters[key].drive_hours += deltaH;
        parameters[key].work_hours += deltaH;
      } else if (activeState === "working") {
        parameters[key].work_hours += deltaH;
      } else {
        parameters[key].rest_hours += deltaH;
      }
    }
  }

  const continuousRestH = computeContinuousRestHours(history, now);

  parameters.daily.extra_drive_hours = Math.max(0, parameters.daily.drive_hours - BASE_DRIVING_H);
  parameters.daily.extra_work_hours = Math.max(0, parameters.daily.work_hours - BASE_WORK_H);
  parameters.weekly.extra_drive_hours = Math.max(0, parameters.weekly.drive_hours - WEEK_DRIVE_H);
  parameters.biweekly.extra_drive_hours = Math.max(0, parameters.biweekly.drive_hours - BIWEEK_DRIVE_H);

  parameters.session.extra_drive_hours = Math.max(0, parameters.session.drive_hours - BASE_DRIVING_H);
  parameters.session.extra_work_hours = Math.max(0, parameters.session.work_hours - BASE_WORK_H);

  const { usedBeforeToday, usedIncludingToday } = computeWeeklyDriveExtensions(
    history,
    weekStart,
    now,
  );
  parameters.weekly.drive_extensions_used_before_today = usedBeforeToday;
  parameters.weekly.drive_extensions_used = usedIncludingToday;

  const breakState = computeDrivingBreakState(history, now);
  Object.assign(parameters.daily, breakState);
  Object.assign(parameters.session, breakState);

  parameters.daily.continuous_rest_hours = continuousRestH;
  parameters.session.continuous_rest_hours = continuousRestH;
  parameters.session.valid = sessionFound;

  return parameters;
};

const buildCounterBars = (metrics: DriverMetrics): CounterBarProps[] => {
  const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
  const h = (value: number | undefined) => (Number.isFinite(value) ? Math.max(0, value as number) : 0);

  const bucket = metrics.session?.valid ? metrics.session : metrics.daily;

  const usedDrive = h(bucket.drive_hours);
  const baseUsedDrive = Math.min(usedDrive, BASE_DRIVING_H);
  const baseRemDrive = Math.max(0, BASE_DRIVING_H - baseUsedDrive);
  const extLeft = Math.max(0, 2 - (metrics.weekly?.drive_extensions_used_before_today || 0));
  const availExtraDrive =
    extLeft <= 0
      ? 0
      : usedDrive < BASE_DRIVING_H
        ? EXTRA_DRIVE_H
        : usedDrive < BASE_DRIVING_H + EXTRA_DRIVE_H
          ? BASE_DRIVING_H + EXTRA_DRIVE_H - usedDrive
          : 0;
  const driveTotal = BASE_DRIVING_H + (extLeft > 0 ? EXTRA_DRIVE_H : 0);
  const driveRemaining = baseRemDrive + availExtraDrive;

  const usedWork = h(bucket.work_hours);
  const baseUsedWork = Math.min(usedWork, BASE_WORK_H);
  const baseRemWork = Math.max(0, BASE_WORK_H - baseUsedWork);
  const availExtraWork = Math.max(0, EXTRA_WORK_H - Math.max(0, usedWork - BASE_WORK_H));
  const workTotal = BASE_WORK_H + EXTRA_WORK_H;
  const workRemaining = baseRemWork + availExtraWork;

  const restNeed = 9;
  const restGot = Math.min(h(bucket.continuous_rest_hours), restNeed);
  const restRemaining = Math.max(0, restNeed - restGot);

  return [
    {
      title: "Guida residua",
      totalLabel: `${usedDrive.toFixed(1)}h / ${BASE_DRIVING_H.toFixed(1)}h`,
      remainingLabel: `Residua ${driveRemaining.toFixed(1)}h`,
      remainingPct: clamp((driveRemaining / (driveTotal || 1)) * 100),
      accentClass: "bg-orange-500",
    },
    {
      title: "Impegno residuo",
      totalLabel: `${usedWork.toFixed(1)}h / ${BASE_WORK_H.toFixed(1)}h`,
      remainingLabel: `Residua ${workRemaining.toFixed(1)}h`,
      remainingPct: clamp((workRemaining / (workTotal || 1)) * 100),
      accentClass: "bg-sky-700",
    },
    {
      title: "Riposo residuo",
      totalLabel: `${restGot.toFixed(1)}h / ${restNeed.toFixed(1)}h`,
      remainingLabel: `Residua ${restRemaining.toFixed(1)}h`,
      remainingPct: clamp((restRemaining / (restNeed || 1)) * 100),
      accentClass: "bg-emerald-500",
    },
  ];
};

function RoutesSidebar({
  isOpen,
  selectedVehicleImei,
}: {
  isOpen: boolean;
  selectedVehicleImei?: string | null;
}) {
  const defaultRange = React.useMemo(() => getDefaultRouteRange(), []);
  const [startDate, setStartDate] = React.useState(
    toLocalInputValue(defaultRange.from),
  );
  const [endDate, setEndDate] = React.useState(toLocalInputValue(defaultRange.to));
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [historyRaw, setHistoryRaw] = React.useState<any[]>([]);
  const [events, setEvents] = React.useState<any[]>([]);
  const [refuelings, setRefuelings] = React.useState<RouteRefuelingDoc[]>([]);
  const [scrubValue, setScrubValue] = React.useState(1);
  const [routeTab, setRouteTab] = React.useState<"controls" | "events">("controls");
  const [activeEventId, setActiveEventId] = React.useState<string | null>(null);
  const [eventSearch, setEventSearch] = React.useState("");
  const [eventTypeFilters, setEventTypeFilters] = React.useState<Record<RouteEventKind, boolean>>({
    pause: true,
    rest: true,
    refuel: true,
    withdrawal: true,
    "driver-change": true,
  });
  const [reportModalOpen, setReportModalOpen] = React.useState(false);
  React.useEffect(() => {
    if (!reportModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReportModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reportModalOpen]);
  const [reportPreviewHtml, setReportPreviewHtml] = React.useState("");
  const prevImeiRef = React.useRef<string | null>(null);

  const normalizedHistory = React.useMemo(
    () => downsampleRoute(normalizeRouteHistory(historyRaw)),
    [historyRaw],
  );
  const timelineEvents = React.useMemo(
    () => {
      const fromMs = toTimestamp(startDate) ?? Number.NEGATIVE_INFINITY;
      const toMs = toTimestamp(endDate) ?? Number.POSITIVE_INFINITY;
      const fuelEvents = mergeRouteFuelEvents(events, refuelings, fromMs, toMs);
      return buildTimelineEvents(normalizedHistory, fuelEvents);
    },
    [normalizedHistory, events, refuelings, startDate, endDate],
  );
  const routeDistanceKm = React.useMemo(
    () => computeRouteDistanceKm(normalizedHistory),
    [normalizedHistory],
  );
  const fuelConsumedL = React.useMemo(
    () => computeFuelConsumedLiters(normalizedHistory, timelineEvents),
    [normalizedHistory, timelineEvents],
  );
  const avgConsumption = React.useMemo(
    () => computeAvgConsumption(fuelConsumedL, routeDistanceKm),
    [fuelConsumedL, routeDistanceKm],
  );
  const overallDirection = React.useMemo(
    () => computeOverallDirection(normalizedHistory),
    [normalizedHistory],
  );
  const longStops = React.useMemo(
    () => computeLongStops(timelineEvents),
    [timelineEvents],
  );
  const eventTypeCounts = React.useMemo(() => {
    const counts: Record<RouteEventKind, number> = {
      pause: 0,
      rest: 0,
      refuel: 0,
      withdrawal: 0,
      "driver-change": 0,
    };
    timelineEvents.forEach((evt) => {
      if (counts[evt.kind] != null) counts[evt.kind] += 1;
    });
    return counts;
  }, [timelineEvents]);
  const filteredTimelineEvents = React.useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    return timelineEvents.filter((evt) => {
      if (!eventTypeFilters[evt.kind]) return false;
      if (!query) return true;
      const detail =
        evt.kind === "refuel" || evt.kind === "withdrawal"
          ? (Number.isFinite(evt.liters as number) ? `${(evt.liters as number).toFixed(1)} l` : "n/d")
          : evt.kind === "driver-change"
            ? `${evt.driverFrom || "n/d"} -> ${evt.driverTo || "n/d"}`
            : evt.kind === "pause"
              ? "sosta con quadro acceso"
              : "sosta con quadro spento";
      const haystack = `${evt.label} ${formatShortDateTime(evt.start)} ${formatShortDateTime(evt.end)} ${detail}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [timelineEvents, eventSearch, eventTypeFilters]);

  const fetchRefuelings = React.useCallback(async () => {
    if (!selectedVehicleImei) {
      setRefuelings([]);
      return [] as RouteRefuelingDoc[];
    }
    try {
      const baseUrl = resolveBackendBaseUrl();
      const res = await fetch(`${baseUrl}/dashboard/refuelings/${selectedVehicleImei}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = await res.json().catch(() => ({}));
      const items = normalizeRouteRefuelings(Array.isArray(payload?.items) ? payload.items : []);
      setRefuelings(items);
      return items;
    } catch {
      setRefuelings([]);
      return [] as RouteRefuelingDoc[];
    }
  }, [selectedVehicleImei]);

  const fetchRoutes = React.useCallback(async () => {
    if (!selectedVehicleImei) {
      setError("Seleziona un veicolo per vedere i percorsi.");
      setHistoryRaw([]);
      setEvents([]);
      return;
    }

    const fromMs = Date.parse(startDate);
    const toMs = Date.parse(endDate);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      setError("Intervallo non valido.");
      return;
    }

    setLoading(true);
    setError(null);
    setActiveEventId(null);
    (window as any).trucklyClearRouteEventMarkers?.();
    try {
      const [data] = await Promise.all([
        dataManager.getHistory(selectedVehicleImei, fromMs, toMs),
        fetchRefuelings(),
      ]);
      const raw = Array.isArray(data?.raw) ? data.raw : [];
      const normalizedEvents = Array.isArray(data?.fuelEvents)
        ? data.fuelEvents.map(normalizeFuelEvent).filter(Boolean)
        : [];
      setHistoryRaw(raw);
      setEvents(normalizedEvents);
      setScrubValue(1);
    } catch (err: any) {
      setError(err?.message || "Errore nel recupero percorsi");
      setHistoryRaw([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [selectedVehicleImei, startDate, endDate, fetchRefuelings]);

  React.useEffect(() => {
    if (prevImeiRef.current && prevImeiRef.current !== selectedVehicleImei) {
      (window as any).trucklyClearRoute?.(prevImeiRef.current);
      (window as any).trucklyClearRouteEventMarkers?.();
      (window as any).trucklyShowAllMarkers?.();
      (window as any).rewinding = false;
      (window as any).trucklyApplyAvlCache?.();
    }
    prevImeiRef.current = selectedVehicleImei || null;
    setHistoryRaw([]);
    setEvents([]);
    setRefuelings([]);
    setError(null);
    setScrubValue(1);
    setActiveEventId(null);
  }, [selectedVehicleImei]);

  React.useEffect(() => {
    if (!selectedVehicleImei) return;
    const range = getDefaultRouteRange();
    setStartDate(toLocalInputValue(range.from));
    setEndDate(toLocalInputValue(range.to));
  }, [selectedVehicleImei]);

  React.useEffect(() => {
    if (!isOpen) return;
    void fetchRoutes();
  }, [isOpen, fetchRoutes]);

  React.useEffect(() => {
    if (!isOpen || !selectedVehicleImei) return;
    (window as any).rewinding = true;
    (window as any).trucklyHideOtherMarkers?.(selectedVehicleImei);
  }, [isOpen, selectedVehicleImei]);

  React.useEffect(() => {
    if (!isOpen || !selectedVehicleImei) return;
    if (!normalizedHistory.length) {
      (window as any).trucklyClearRoute?.(selectedVehicleImei);
      return;
    }
    (window as any).trucklyDrawRoute?.(selectedVehicleImei, normalizedHistory);
    const first = normalizedHistory[0];
    const last = normalizedHistory[normalizedHistory.length - 1];
    if (first?.gps && last?.gps) {
      (window as any).trucklySetRouteEndpoints?.({
        start: { lat: first.gps.Latitude, lng: first.gps.Longitude },
        end: { lat: last.gps.Latitude, lng: last.gps.Longitude },
      });
    }
    // Sweep-pulse inizio->fine (2.5s) per evidenziare la direzione di marcia.
    (window as any).trucklyPlayRouteSweep?.(selectedVehicleImei, normalizedHistory, {
      durationMs: 2500,
    });
  }, [isOpen, selectedVehicleImei, normalizedHistory]);

  React.useEffect(() => {
    if (isOpen) return;
    (window as any).trucklyClearRoute?.(selectedVehicleImei);
    (window as any).trucklyClearRouteEventMarkers?.();
    (window as any).trucklyShowAllMarkers?.();
    (window as any).rewinding = false;
    (window as any).trucklyApplyAvlCache?.();
  }, [isOpen, selectedVehicleImei]);

  React.useEffect(() => {
    return () => {
      (window as any).trucklyClearRouteEventMarkers?.();
    };
  }, []);

  React.useEffect(() => {
    if (!isOpen || !selectedVehicleImei || !normalizedHistory.length) return;
    const clamped = Math.min(Math.max(scrubValue, 0), 1);
    const total = normalizedHistory.length;
    const position = Math.min(total - 1, Math.max(0, Math.floor(clamped * (total - 1))));
    const point = normalizedHistory[position];
    if (!point) return;
    const heading = resolveHeading(normalizedHistory, position);
    const statusClass = getVehicleStateClass(point.gps.Speed, point.io?.ignition);
    (window as any).trucklySetRouteProgress?.(selectedVehicleImei, position);
    (window as any).trucklyUpdateRouteMarker?.(
      selectedVehicleImei,
      point,
      heading,
      statusClass,
    );
  }, [scrubValue, normalizedHistory, selectedVehicleImei]);

  const currentPoint = normalizedHistory.length
    ? normalizedHistory[
        Math.min(
          normalizedHistory.length - 1,
          Math.max(0, Math.floor(scrubValue * (normalizedHistory.length - 1))),
        )
      ]
    : null;

  const focusTimelineEvent = React.useCallback((evt: RouteTimelineEvent) => {
    setActiveEventId(evt.id);
    if (Number.isFinite(evt?.lat) && Number.isFinite(evt?.lng)) {
      (window as any).trucklyFlyToLocation?.(
        { lat: evt.lat as number, lng: evt.lng as number },
        15,
      );
      (window as any).trucklySetRouteEventMarker?.({
        id: evt.id,
        lat: evt.lat,
        lng: evt.lng,
        kind: evt.kind,
        title: evt.label,
        subtitle: formatShortDateTime(evt.start),
        details:
          evt.kind === "refuel" || evt.kind === "withdrawal"
            ? `Litri: ${Number.isFinite(evt.liters as number) ? `${(evt.liters as number).toFixed(1)} L` : "N/D"}`
            : evt.kind === "driver-change"
              ? `Autista: ${evt.driverFrom || "N/D"} -> ${evt.driverTo || "N/D"}`
              : `Durata: ${formatDurationMinutes(evt.durationMin)}`,
        badge:
          evt.kind === "pause"
            ? "PAU"
            : evt.kind === "rest"
              ? "RIP"
              : evt.kind === "driver-change"
                ? "DRV"
              : evt.kind === "withdrawal"
                ? "PRE"
                : "RIF",
      });
    }
    if (!normalizedHistory.length) return;
    const targetTs = Number(evt.start);
    const total = normalizedHistory.length;
    let nearestIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;
    normalizedHistory.forEach((point, idx) => {
      const distance = Math.abs((point?.timestamp || 0) - targetTs);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = idx;
      }
    });
    const position = total > 1 ? nearestIndex / (total - 1) : 1;
    setScrubValue(position);
  }, [normalizedHistory]);

  const buildReportHtml = React.useCallback(() => {
    const vehicleLabel = (() => {
      if (typeof window === "undefined" || !selectedVehicleImei) return selectedVehicleImei || "Veicolo";
      const vehicles = Array.isArray((window as any).trucklyVehicles) ? (window as any).trucklyVehicles : [];
      const target = vehicles.find((vehicle: any) => String(vehicle?.imei || "") === String(selectedVehicleImei));
      if (!target) return selectedVehicleImei;
      const plate = typeof target?.plate === "string" ? target.plate : target?.plate?.v || target?.plate?.value || "";
      const nickname = target?.nickname || target?.name || "";
      return [nickname, plate].filter(Boolean).join(" | ") || selectedVehicleImei;
    })();

    const rows = filteredTimelineEvents
      .map((evt) => {
        const detail =
          evt.kind === "refuel" || evt.kind === "withdrawal"
            ? (Number.isFinite(evt.liters as number) ? `${(evt.liters as number).toFixed(1)} L` : "N/D")
            : evt.kind === "driver-change"
              ? `${evt.driverFrom || "N/D"} -> ${evt.driverTo || "N/D"}`
            : (evt.kind === "pause" ? "Sosta con quadro acceso" : "Sosta con quadro spento");
        return `
          <tr>
            <td>${escapeReportHtml(evt.label)}</td>
            <td>${escapeReportHtml(formatShortDateTime(evt.start))}</td>
            <td>${escapeReportHtml(formatShortDateTime(evt.end))}</td>
            <td>${escapeReportHtml(formatDurationMinutes(evt.durationMin))}</td>
            <td>${escapeReportHtml(detail)}</td>
          </tr>
        `;
      })
      .join("");

    return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Report Percorsi</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    .header { margin-bottom: 18px; }
    .logo { width: 128px; height: auto; margin-bottom: 10px; }
    .vehicle { margin: 0; font-size: 20px; font-weight: 700; color: #111; }
    .subtitle { margin: 4px 0 0 0; color: #6b7280; font-size: 12px; }
    .stats { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; margin-bottom: 14px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px; background: #fafafa; }
    .label { font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 4px; }
    .value { font-size: 15px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 11px; text-align: left; }
    th { background: #f3f3f3; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <img class="logo" src="/assets/images/logo_black.png" alt="Truckly" />
    <p class="vehicle">${escapeReportHtml(vehicleLabel)}</p>
    <p class="subtitle">Report operativo da ${escapeReportHtml(formatShortDateTime(toTimestamp(startDate) || undefined))} a ${escapeReportHtml(formatShortDateTime(toTimestamp(endDate) || undefined))}</p>
  </div>
  <div class="stats">
    <div class="card"><div class="label">Km percorsi</div><div class="value">${escapeReportHtml(Number.isFinite(routeDistanceKm as number) ? `${routeDistanceKm} km` : "N/D")}</div></div>
    <div class="card"><div class="label">Gasolio consumato</div><div class="value">${escapeReportHtml(fuelConsumedL != null ? `${fuelConsumedL} L` : "N/D")}</div></div>
    <div class="card"><div class="label">Media consumo</div><div class="value">${escapeReportHtml(avgConsumption != null ? `${avgConsumption} L/100km` : "N/D")}</div></div>
    <div class="card"><div class="label">Direzione marcia</div><div class="value">${escapeReportHtml(overallDirection || "N/D")}</div></div>
    <div class="card"><div class="label">Soste &gt; 15 min</div><div class="value">${escapeReportHtml(`${longStops.onCount + longStops.offCount} (${longStops.onCount} acceso / ${longStops.offCount} spento)`)}</div></div>
    <div class="card"><div class="label">Eventi registrati</div><div class="value">${escapeReportHtml(filteredTimelineEvents.length)}</div></div>
    <div class="card"><div class="label">Generato il</div><div class="value">${escapeReportHtml(new Date().toLocaleString("it-IT"))}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Tipo</th>
        <th>Inizio</th>
        <th>Fine</th>
        <th>Durata</th>
        <th>Dettaglio</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="5">Nessun evento disponibile per l'intervallo selezionato.</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
  }, [routeDistanceKm, fuelConsumedL, avgConsumption, overallDirection, longStops, selectedVehicleImei, startDate, endDate, filteredTimelineEvents]);

  const openReportModal = React.useCallback(() => {
    setReportPreviewHtml(buildReportHtml());
    setReportModalOpen(true);
  }, [buildReportHtml]);

  const printReport = React.useCallback(() => {
    const html = reportPreviewHtml || buildReportHtml();
    const win = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }, [reportPreviewHtml, buildReportHtml]);

  const exportEventsCsv = React.useCallback(() => {
    const header = ["Tipo", "Inizio", "Fine", "Durata", "Dettaglio"];
    const rows = filteredTimelineEvents.map((evt) => {
      const detail =
        evt.kind === "refuel" || evt.kind === "withdrawal"
          ? (Number.isFinite(evt.liters as number) ? `${(evt.liters as number).toFixed(1)} L` : "N/D")
          : evt.kind === "driver-change"
            ? `${evt.driverFrom || "N/D"} -> ${evt.driverTo || "N/D"}`
          : (evt.kind === "pause" ? "Sosta con quadro acceso" : "Sosta con quadro spento");
      return [
        evt.label,
        formatShortDateTime(evt.start),
        formatShortDateTime(evt.end),
        formatDurationMinutes(evt.durationMin),
        detail,
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-percorsi-${selectedVehicleImei || "veicolo"}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredTimelineEvents, selectedVehicleImei]);

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3">
      <TabSwitch
        ariaLabel="Sezioni percorso"
        value={routeTab}
        onChange={(id) => setRouteTab(id as "controls" | "events")}
        tabs={[
          { id: "controls", label: "Controlli" },
          { id: "events", label: `Eventi (${filteredTimelineEvents.length})` },
        ]}
      />

      {routeTab === "controls" && (
        <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
          {/* DA / A affiancate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-1">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Da</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Data inizio"
                className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="min-w-0 space-y-1">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">A</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="Data fine"
                className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
          </div>
          <button
            onClick={fetchRoutes}
            disabled={loading}
            className="h-9 w-full rounded-lg bg-white/10 border border-white/20 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:bg-white/15 transition disabled:opacity-50"
          >
            {loading ? "Carico" : "Aggiorna"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {/* Scroller (rewind) sotto */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-1 text-sm text-white/70">
              <span>Rewind</span>
              <span className="text-xs text-white/55 tabular-nums">{currentPoint ? new Date(currentPoint.timestamp).toLocaleString("it-IT") : "N/D"}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={scrubValue}
              onChange={(e) => setScrubValue(Number(e.target.value))}
              className="h-2 w-full accent-orange-500"
              aria-label="Riavvolgi percorso"
              aria-valuetext={currentPoint ? new Date(currentPoint.timestamp).toLocaleString("it-IT") : "Nessun dato"}
            />
            <div className="text-xs text-white/60">
              {normalizedHistory.length
                ? `Punti caricati: ${normalizedHistory.length}`
                : loading
                  ? "Caricamento percorsi..."
                  : "Nessun percorso disponibile per l'intervallo selezionato."}
            </div>
          </div>
        </div>
      )}

      {routeTab === "events" && (
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-card p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/70">
          <span className="shrink-0">Eventi registrati</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative min-w-0">
              <i className="fa fa-search pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-white/40" aria-hidden="true" />
              <input
                type="search"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Cerca evento..."
                className="h-8 w-[130px] sm:w-[180px] rounded-lg border border-white/15 bg-background pl-7 pr-2 text-[11px] text-white/85 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 w-8 rounded-full border border-white/20 bg-white/5 text-white/75 hover:text-white hover:border-white/40 transition inline-flex items-center justify-center"
                  aria-label="Azioni eventi"
                  title="Azioni eventi"
                >
                  <i className="fa fa-ellipsis-v" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[240px]">
                <DropdownMenuItem
                  onSelect={(ev) => {
                    ev.preventDefault();
                    openReportModal();
                  }}
                >
                  <i className="fa fa-file-text-o mr-2 text-[12px]" aria-hidden="true" />
                  Crea Report
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.12em] text-white/55">
                  Filtra
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={eventTypeFilters.pause}
                  onCheckedChange={(checked) => setEventTypeFilters((prev) => ({ ...prev, pause: Boolean(checked) }))}
                  onSelect={(ev) => ev.preventDefault()}
                >
                  Pausa ({eventTypeCounts.pause})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={eventTypeFilters.rest}
                  onCheckedChange={(checked) => setEventTypeFilters((prev) => ({ ...prev, rest: Boolean(checked) }))}
                  onSelect={(ev) => ev.preventDefault()}
                >
                  Riposo ({eventTypeCounts.rest})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={eventTypeFilters.refuel}
                  onCheckedChange={(checked) => setEventTypeFilters((prev) => ({ ...prev, refuel: Boolean(checked) }))}
                  onSelect={(ev) => ev.preventDefault()}
                >
                  Rifornimento ({eventTypeCounts.refuel})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={eventTypeFilters.withdrawal}
                  onCheckedChange={(checked) => setEventTypeFilters((prev) => ({ ...prev, withdrawal: Boolean(checked) }))}
                  onSelect={(ev) => ev.preventDefault()}
                >
                  Prelievo ({eventTypeCounts.withdrawal})
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={eventTypeFilters["driver-change"]}
                  onCheckedChange={(checked) => setEventTypeFilters((prev) => ({ ...prev, "driver-change": Boolean(checked) }))}
                  onSelect={(ev) => ev.preventDefault()}
                >
                  Cambio autista ({eventTypeCounts["driver-change"]})
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/10">
          {filteredTimelineEvents.length === 0 ? (
            <div className="p-3 text-xs text-white/50">
              Nessun evento disponibile per questo intervallo.
            </div>
          ) : (
            <table className="min-w-full text-[10px] text-white/85">
              <thead className="sticky top-0 z-10 bg-[#111214] text-white/60">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.12em]">Tipo</th>
                  <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.12em]">Inizio</th>
                  <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.12em]">Fine</th>
                  <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.12em]">Durata</th>
                  <th className="px-3 py-2 text-left text-[9px] uppercase tracking-[0.12em]">Dettaglio</th>
                </tr>
              </thead>
              <tbody>
                {filteredTimelineEvents.map((evt) => (
                  <tr
                    key={evt.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Evento ${evt.label} — vai sulla mappa`}
                    onClick={() => focusTimelineEvent(evt)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        focusTimelineEvent(evt);
                      }
                    }}
                    className={`cursor-pointer border-b border-white/5 outline-none hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${activeEventId === evt.id ? "bg-white/10" : "bg-background"}`}
                  >
                    <td className="px-3 py-2 font-medium">{evt.label}</td>
                    <td className="px-3 py-2 text-white/75">{formatShortDateTime(evt.start)}</td>
                    <td className="px-3 py-2 text-white/75">{formatShortDateTime(evt.end)}</td>
                    <td className="px-3 py-2 text-white/70">{formatDurationMinutes(evt.durationMin)}</td>
                    <td className="px-3 py-2 text-white/70">
                      {evt.kind === "refuel" || evt.kind === "withdrawal"
                        ? (Number.isFinite(evt.liters as number) ? `${(evt.liters as number).toFixed(1)} L` : "N/D")
                        : evt.kind === "driver-change"
                          ? `${evt.driverFrom || "N/D"} -> ${evt.driverTo || "N/D"}`
                        : evt.kind === "pause"
                          ? "Sosta con quadro acceso"
                          : "Sosta con quadro spento"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-[11px] text-white/45">
          Clic su una riga: posiziona la mappa sull'evento e apre marker dettaglio.
        </p>
      </div>
      )}
      {reportModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-4 md:p-8">
          <div role="dialog" aria-modal="true" aria-label="Report percorsi intervallo" className="mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b0c10] shadow-[0_25px_90px_rgba(0,0,0,0.65)]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Report Percorsi Intervallo</h3>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="h-8 w-8 rounded-full border border-white/20 text-white/70 hover:border-white/40 hover:text-white"
                aria-label="Chiudi Report"
              >
                <i className="fa fa-close" aria-hidden="true" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[380px_1fr]">
              <div className="space-y-4 overflow-y-auto border-r border-white/10 px-5 py-4">
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.12em] text-white/60">Intervallo</label>
                  <p className="text-sm text-white/85">
                    {formatShortDateTime(toTimestamp(startDate) || undefined)} - {formatShortDateTime(toTimestamp(endDate) || undefined)}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-[0.12em] text-white/60">Dati inclusi</label>
                  <p className="text-sm text-white/85">
                    {Number.isFinite(routeDistanceKm as number) ? `${routeDistanceKm} km percorsi` : "Km percorsi N/D"}
                  </p>
                  <p className="text-sm text-white/85">{filteredTimelineEvents.length} eventi registrati</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportPreviewHtml(buildReportHtml())}
                    className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white"
                  >
                    Aggiorna anteprima
                  </button>
                  <button
                    type="button"
                    onClick={printReport}
                    className="rounded-lg border border-orange-400/30 bg-orange-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-orange-100"
                  >
                    Stampa/PDF
                  </button>
                  <button
                    type="button"
                    onClick={exportEventsCsv}
                    className="rounded-lg border border-white/20 bg-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/85"
                  >
                    CSV Eventi
                  </button>
                </div>
              </div>
              <div className="min-h-0 bg-[#07080b] p-4">
                <div className="h-full overflow-hidden rounded-xl border border-white/10 bg-white">
                  {reportPreviewHtml ? (
                    <iframe title="Anteprima Report Percorsi" className="h-full w-full" srcDoc={reportPreviewHtml} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-600">
                      Nessuna anteprima disponibile.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function DriverSidebar({
  isOpen,
  onClose,
  selectedDriverImei,
  selectedRouteImei,
  selectedDriverDevice,
  mode = "driver",
  driverEditTarget = null,
  driverEditReadOnly = false,
  vehicleEditTarget = null,
  vehicleEditFocus = null,
  geofenceDraft,
}: DriverSidebarProps) {
  const wasOpenRef = React.useRef(isOpen);
  const routesBaseUrl = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }, []);
  const [effectivePrivilege, setEffectivePrivilege] = React.useState<number | null>(null);
  const [sessionCompanyId, setSessionCompanyId] = React.useState<string | null>(null);
  const [sessionCompanyName, setSessionCompanyName] = React.useState<string | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const asideRef = React.useRef<HTMLElement | null>(null);
  const [driverTab, setDriverTab] = React.useState<"stato" | "anagrafica" | "mission">("stato");
  const initialCounters = React.useMemo(
    () => buildCounterBars(emptyParams()),
    [],
  );
  const [counterBars, setCounterBars] = React.useState<CounterBarProps[]>(initialCounters);
  const [activityStatus, setActivityStatus] = React.useState<string | null>(null);
  const [activityLoading, setActivityLoading] = React.useState(false);
  const driver1Id = getDriver1FromDevice(selectedDriverDevice);
  const hasDriver1 = Boolean(driver1Id);

  const isRoutesMode = mode === "routes";
  // In mobile la modalità rewind diventa un bottom sheet: la mappa resta visibile sopra.
  const routesMobile = isRoutesMode && isMobile;

  // Comunica alla mappa l'altezza del bottom sheet così il fly-to non finisce dietro.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const clear = () => {
      (window as any).trucklyMapBottomInset = 0;
    };
    if (!routesMobile || !isOpen) {
      clear();
      return clear;
    }
    const el = asideRef.current;
    if (!el) return clear;
    const apply = () => {
      (window as any).trucklyMapBottomInset = Math.round(el.getBoundingClientRect().height) + 16;
    };
    apply();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(apply);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      clear();
    };
  }, [routesMobile, isOpen]);
  const isNavigationMode = mode === "navigation";
  const isGeofenceMode = mode === "geofence";
  const isVehicleMode = mode === "vehicle";
  const isDriverRegisterMode = mode === "driver-register";
  const sessionLoaded = effectivePrivilege !== null;
  const canManageVehicles =
    Number.isInteger(effectivePrivilege) && effectivePrivilege === 0;
  const canManageDrivers =
    Number.isInteger(effectivePrivilege) && effectivePrivilege <= 1;
  const navigationVehicleLabel = React.useMemo(() => {
    if (!isNavigationMode || !selectedRouteImei || typeof window === "undefined") return null;
    const vehicles = Array.isArray((window as any).trucklyVehicles) ? (window as any).trucklyVehicles : [];
    const target = vehicles.find((vehicle: any) => String(vehicle?.imei || "") === String(selectedRouteImei));
    if (!target) return selectedRouteImei;
    const plate = typeof target?.plate === "string"
      ? target.plate
      : target?.plate?.v || target?.plate?.value || "";
    const nickname = target?.nickname || target?.name || "";
    return [nickname, plate].filter(Boolean).join(" | ") || selectedRouteImei;
  }, [isNavigationMode, selectedRouteImei]);

  React.useEffect(() => {
    let cancelled = false;
    if (!isOpen) return () => {};
    if (!hasDriver1) {
      setCounterBars(initialCounters);
      setActivityStatus("Nessun autista rilevato dal tachigrafo.");
      return () => {};
    }

    setActivityLoading(true);
    setActivityStatus(null);
    (async () => {
      try {
        const metrics = await compileDriverMetrics(String(driver1Id), routesBaseUrl);
        if (cancelled) return;
        if (!metrics) {
          setCounterBars(initialCounters);
          setActivityStatus("Nessun dato attivita disponibile.");
          return;
        }
        setCounterBars(buildCounterBars(metrics));
      } catch (err: any) {
        if (cancelled) return;
        setCounterBars(initialCounters);
        setActivityStatus(err?.message || "Errore nel calcolo attivita");
      } finally {
        if (!cancelled) {
          setActivityLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, driver1Id, hasDriver1, routesBaseUrl, initialCounters]);

  React.useEffect(() => {
    let cancelled = false;
    if (!isOpen) return () => {};
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
          setSessionCompanyId(data?.user?.companyId ?? null);
          setSessionCompanyName(data?.user?.companyName ?? null);
        }
      } catch (err) {
        console.warn("[DriverSidebar] session lookup failed", err);
      }
    };
    loadSession();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  React.useEffect(() => {
    const wasOpen = wasOpenRef.current;
    if (wasOpen && !isOpen) {
      (window as any).trucklyClearNavigationRoute?.();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  return (
    <aside
      ref={asideRef}
      className={
        routesMobile
          ? `fixed inset-x-0 bottom-0 top-auto z-40 h-[58vh] w-full max-w-none rounded-t-2xl border-t border-white/10 bg-background text-[#f8fafc] flex flex-col pt-4 overflow-hidden shadow-[0_-24px_60px_rgba(0,0,0,0.45)] backdrop-blur transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isOpen ? "translate-y-0" : "translate-y-full pointer-events-none opacity-0"
            }`
          : `fixed top-0 bottom-0 right-0 md:right-[var(--tk-toolbar-right,0px)] md:top-[var(--tk-toolbar-top,0px)] md:bottom-[var(--tk-toolbar-bottom,0px)] z-40 w-full max-w-none sm:max-w-[92vw] sm:w-[420px] lg:w-[520px] border-l border-white/10 bg-background text-[#f8fafc] flex flex-col pt-16 md:pt-4 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur truckly-sidebar transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isOpen ? "translate-x-0" : "hidden-right"
            }`
      }
      aria-hidden={!isOpen}
    >
      <div className="flex items-start justify-between px-5 py-5 border-b border-white/10">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Pannello</p>
            <h2 className="text-xl font-semibold leading-tight text-white">
              {isGeofenceMode
                ? "GeoFence"
                : isNavigationMode
                ? `Navigazione${navigationVehicleLabel ? ` | ${navigationVehicleLabel}` : ""}`
                : isRoutesMode
                ? "Percorsi"
                : isDriverRegisterMode
                ? "Nuovo autista"
                : isVehicleMode
                ? "Nuovo veicolo"
                : "Autista"}
            </h2>
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

        <div className="flex-1 overflow-y-auto px-4 py-5 pb-8 space-y-4 bg-background">
          {isGeofenceMode ? (
            <GeofenceSidebar geofenceDraft={geofenceDraft} />
          ) : isNavigationMode ? (
            <RouteCalculator selectedVehicleImei={selectedRouteImei} />
          ) : isRoutesMode ? (
            <RoutesSidebar isOpen={isOpen} selectedVehicleImei={selectedRouteImei} />
          ) : isDriverRegisterMode ? (
            !sessionLoaded ? (
              <Section
                title="Verifica permessi"
                body="Caricamento autorizzazioni in corso..."
              />
            ) : canManageDrivers ? (
              <DriverRegistrationSidebar
                isOpen={isOpen}
                isSuperAdmin={Number.isInteger(effectivePrivilege) && effectivePrivilege === 0}
                sessionCompanyId={sessionCompanyId}
                sessionCompanyName={sessionCompanyName}
                initialDriver={driverEditTarget}
                readOnly={driverEditReadOnly}
              />
            ) : (
              <Section
                title="Accesso limitato"
                body="Non hai i permessi per registrare nuovi autisti."
              />
            )
          ) : isVehicleMode ? (
            !sessionLoaded ? (
              <Section
                title="Verifica permessi"
                body="Caricamento autorizzazioni in corso..."
            />
          ) : canManageVehicles ? (
            <VehicleRegistrationSidebar
              isOpen={isOpen}
              isSuperAdmin={Number.isInteger(effectivePrivilege) && effectivePrivilege === 0}
              initialVehicle={vehicleEditTarget}
              focusSection={vehicleEditFocus}
              onDone={onClose}
            />
          ) : (
            <Section
              title="Accesso limitato"
              body="Non hai i permessi per registrare nuovi veicoli."
            />
          )
        ) : (
          <>
            {/* Header autista: nome + menu azioni inline */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-foreground">
                  {hasDriver1 ? driver1Id : "Nessun autista"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {hasDriver1
                    ? "Autista rilevato dal tachigrafo"
                    : "Nessun autista rilevato per questo veicolo"}
                </div>
              </div>
              {hasDriver1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Azioni autista"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <i className="fa fa-ellipsis-h" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
                    <DropdownMenuItem
                      onSelect={() =>
                        window.dispatchEvent(
                          new CustomEvent("truckly:bottom-bar-toggle", {
                            detail: { mode: "driver" },
                          }),
                        )
                      }
                    >
                      <i className="fa fa-file-text-o mr-2 text-[12px]" aria-hidden="true" />
                      Report attività
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {hasDriver1 ? (
              <>
                <TabSwitch
                  ariaLabel="Sezioni autista"
                  value={driverTab}
                  onChange={(id) => setDriverTab(id as typeof driverTab)}
                  tabs={[
                    { id: "stato", label: "Stato guida" },
                    { id: "anagrafica", label: "Anagrafica" },
                    { id: "mission", label: "Mission Control" },
                  ]}
                />

                {driverTab === "stato" && (
                  <div className="space-y-4">
                    {counterBars.map((bar) => (
                      <CounterBar key={bar.title} {...bar} />
                    ))}
                    {activityLoading && (
                      <p className="text-xs text-muted-foreground">Caricamento attività...</p>
                    )}
                    {activityStatus && !activityLoading && (
                      <p
                        className={`text-xs ${
                          activityStatus.toLowerCase().includes("errore")
                            ? "text-down"
                            : "text-muted-foreground"
                        }`}
                      >
                        {activityStatus}
                      </p>
                    )}
                  </div>
                )}

                {driverTab === "anagrafica" && (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Nome, patente e anagrafica verranno mostrati qui.</p>
                    <p>Email, telefono e note compariranno qui.</p>
                  </div>
                )}

                {driverTab === "mission" && (
                  <p className="text-sm text-muted-foreground">
                    Turni, disponibilità ed eventi recenti compariranno qui.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun autista rilevato dal tachigrafo per questo veicolo.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function DriverRegistrationSidebar({
  isOpen,
  isSuperAdmin,
  sessionCompanyId,
  sessionCompanyName,
  initialDriver,
  readOnly = false,
}: {
  isOpen: boolean;
  isSuperAdmin: boolean;
  sessionCompanyId: string | null;
  sessionCompanyName: string | null;
  initialDriver?: DriverEditTarget | null;
  readOnly?: boolean;
}) {
  const [activeTab, setActiveTab] = React.useState<"manual" | "import">("manual");
  const [companyOptions, setCompanyOptions] = React.useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = React.useState("");
  const [companyName, setCompanyName] = React.useState<string | null>(null);
  const [loadingCompanies, setLoadingCompanies] = React.useState(false);
  const [name, setName] = React.useState("");
  const [surname, setSurname] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [cardId, setCardId] = React.useState("");
  const [registerOnExternal, setRegisterOnExternal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const isEditMode = Boolean(initialDriver && (initialDriver.id || initialDriver._id));

  const [tachoDrivers, setTachoDrivers] = React.useState<TachoDriverOption[]>([]);
  const [tachoLoading, setTachoLoading] = React.useState(false);
  const [tachoError, setTachoError] = React.useState<string | null>(null);
  const [tachoSearch, setTachoSearch] = React.useState("");
  const [tachoSelectedIds, setTachoSelectedIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!isOpen) return;
    if (initialDriver) {
      setActiveTab("manual");
      setEditId(String(initialDriver.id || initialDriver._id || ""));
      setName(String(initialDriver.name || ""));
      setSurname(String(initialDriver.surname || ""));
      setPhone(String(initialDriver.phone || ""));
      setCardId(String(initialDriver.tachoDriverId || ""));
      setCompanyId(String(initialDriver.companyId || ""));
      setCompanyName(initialDriver.companyName || sessionCompanyName || null);
      setRegisterOnExternal(false);
      setError(null);
      setSuccess(null);
      setTachoSelectedIds([]);
      return;
    }
    setEditId(null);
  }, [initialDriver, isOpen, sessionCompanyName]);

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadCompanies = async () => {
      setLoadingCompanies(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/drivers/companies`, {
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.companies) ? data.companies : [];
        const mapped = list
          .map((company: any) => ({
            id: String(company?.id || company?._id || ""),
            name: String(company?.name || ""),
          }))
          .filter((company: { id: string; name: string }) => company.id && company.name);
        if (!cancelled) {
          setCompanyOptions(mapped);
          if (initialDriver) {
            setCompanyId(String(initialDriver.companyId || ""));
            setCompanyName(initialDriver.companyName || null);
            return;
          }
          if (!isSuperAdmin && mapped.length) {
            setCompanyId(mapped[0].id);
            setCompanyName(mapped[0].name);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Errore caricamento aziende.");
        }
      } finally {
        if (!cancelled) {
          setLoadingCompanies(false);
        }
      }
    };
    loadCompanies();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isSuperAdmin, initialDriver]);

  React.useEffect(() => {
    if (!isOpen || !activeTab || activeTab !== "import") return;
    if (!companyId && !isSuperAdmin) return;
    const targetCompanyId = isSuperAdmin ? companyId : sessionCompanyId;
    if (!targetCompanyId) return;
    let cancelled = false;
    const loadTachoDrivers = async () => {
      setTachoLoading(true);
      setTachoError(null);
      try {
        const query = `?companyId=${encodeURIComponent(targetCompanyId)}`;
        console.log("[tacho] import-options request", {
          url: `${API_BASE_URL}/api/drivers/import-options${query}`,
          companyId: targetCompanyId,
          isSuperAdmin,
        });
        const res = await fetch(`${API_BASE_URL}/api/drivers/import-options${query}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.warn("[tacho] import-options error", {
            status: res.status,
            body: text,
          });
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = await res.json().catch(() => ({}));
        console.log("[tacho] import-options response", {
          count: Array.isArray(data?.drivers) ? data.drivers.length : 0,
        });
        const list = Array.isArray(data?.drivers) ? data.drivers : [];
        const mapped = list
          .map((driver: any) => ({
            id: String(driver?.id || driver?.cardNumber || driver?.driverId || driver?.driverCardId || ""),
            name: String(driver?.firstName || driver?.name || ""),
            surname: String(driver?.lastName || driver?.surname || ""),
            cardName: driver?.cardName || driver?.driverCardName || driver?.fullName || driver?.driverName || null,
            cardNumber: driver?.cardNumber || driver?.driverCardId || driver?.driverId || null,
            phone: driver?.phone || driver?.phoneNumber || null,
          }))
          .filter((driver: TachoDriverOption) => driver.id);
        if (!cancelled) {
          setTachoDrivers(mapped);
          setTachoSelectedIds([]);
        }
      } catch (err: any) {
        if (!cancelled) {
          setTachoError(err?.message || "Errore nel caricamento autisti.");
        }
      } finally {
        if (!cancelled) {
          setTachoLoading(false);
        }
      }
    };
    loadTachoDrivers();
    return () => {
      cancelled = true;
    };
  }, [activeTab, companyId, isOpen, isSuperAdmin, sessionCompanyId]);

  const filteredTachoDrivers = React.useMemo(() => {
    const query = tachoSearch.trim().toLowerCase();
    if (!query) return tachoDrivers;
    return tachoDrivers.filter((driver) => {
      const label = `${driver.name} ${driver.surname} ${driver.cardName || ""} ${driver.cardNumber || ""} ${driver.phone || ""}`.toLowerCase();
      return label.includes(query);
    });
  }, [tachoDrivers, tachoSearch]);

  const toggleTachoDriver = (id: string) => {
    setTachoSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    );
  };

  const handleManualSubmit = async () => {
    setError(null);
    setSuccess(null);
    const targetCompanyId = isSuperAdmin ? companyId : sessionCompanyId;
    if (!targetCompanyId) {
      setError("Seleziona una azienda.");
      return;
    }
    if (!name.trim() || !surname.trim() || !phone.trim() || !cardId.trim()) {
      setError("Compila tutti i campi obbligatori.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          surname: surname.trim(),
          phone: phone.trim(),
          tachoDriverId: cardId.trim(),
          companyId: targetCompanyId,
          registerOnTacho: registerOnExternal,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      setSuccess("Autista registrato con successo.");
      setName("");
      setSurname("");
      setPhone("");
      setCardId("");
      window.dispatchEvent(new CustomEvent("truckly:drivers-refresh"));
    } catch (err: any) {
      setError(err?.message || "Errore durante la registrazione.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateSubmit = async () => {
    if (readOnly) return;
    setError(null);
    setSuccess(null);
    if (!editId) {
      setError("Autista non valido.");
      return;
    }
    if (!name.trim() || !surname.trim() || !phone.trim() || !cardId.trim()) {
      setError("Compila tutti i campi obbligatori.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/drivers/${encodeURIComponent(editId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          surname: surname.trim(),
          phone: phone.trim(),
          tachoDriverId: cardId.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      setSuccess("Autista aggiornato con successo.");
      window.dispatchEvent(new CustomEvent("truckly:drivers-refresh"));
    } catch (err: any) {
      setError(err?.message || "Errore durante l'aggiornamento.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleImportSubmit = async () => {
    setError(null);
    setSuccess(null);
    const targetCompanyId = isSuperAdmin ? companyId : sessionCompanyId;
    if (!targetCompanyId) {
      setError("Seleziona una azienda.");
      return;
    }
    if (!tachoSelectedIds.length) {
      setError("Seleziona almeno un autista da importare.");
      return;
    }
    setSubmitting(true);
    try {
      const selected = tachoDrivers.filter((driver) => tachoSelectedIds.includes(driver.id));
      const splitCardName = (value?: string | null) => {
        const clean = String(value || "").trim();
        if (!clean) return { first: "", last: "" };
        const parts = clean.split(/\s+/);
        if (parts.length === 1) return { first: parts[0], last: "" };
        return { first: parts[0], last: parts.slice(1).join(" ") };
      };
      const payload = selected.map((driver) => ({
        name: driver.name || splitCardName(driver.cardName).first || "",
        surname: driver.surname || splitCardName(driver.cardName).last || "",
        phone: driver.phone || "",
        tachoDriverId: String(driver.cardNumber || driver.id || ""),
      }));
      console.log("[tacho] drivers/import request", {
        companyId: targetCompanyId,
        drivers: payload,
      });
      const res = await fetch(`${API_BASE_URL}/api/drivers/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyId: targetCompanyId,
          drivers: payload,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[tacho] drivers/import error", {
          status: res.status,
          body: text,
        });
        throw new Error(text || `HTTP ${res.status}`);
      }
      console.log("[tacho] drivers/import success");
      setSuccess("Import completato.");
      setTachoSelectedIds([]);
      window.dispatchEvent(new CustomEvent("truckly:drivers-refresh"));
    } catch (err: any) {
      setError(err?.message || "Errore durante l'import.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] transition ${
              activeTab === "manual"
                ? "border-white/40 text-white"
                : "border-white/10 text-white/60 hover:text-white hover:border-white/30"
            }`}
          >
            Manuale
          </button>
          {!isEditMode && (
            <button
              type="button"
              onClick={() => setActiveTab("import")}
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] transition ${
                activeTab === "import"
                  ? "border-white/40 text-white"
                  : "border-white/10 text-white/60 hover:text-white hover:border-white/30"
              }`}
            >
              Importa
            </button>
          )}
        </div>

        {isSuperAdmin && !isEditMode ? (
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Azienda</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              <option value="">
                {loadingCompanies ? "Caricamento..." : "Seleziona azienda"}
              </option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-background px-3 py-2 text-xs text-white/70">
            Azienda: {companyName || sessionCompanyName || "--"}
          </div>
        )}

        {activeTab === "manual" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly}
                className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Cognome</label>
              <input
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                disabled={readOnly}
                className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Cellulare</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={readOnly}
                className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">ID carta</label>
              <input
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
                disabled={readOnly}
                className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>
            {!isEditMode && (
              <div className="sm:col-span-2 rounded-xl border border-white/10 bg-background px-3 py-2 text-xs text-white/70 flex items-center justify-between">
                <span>Aggiungi su servizio esterno</span>
                <label className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/60">
                  <input
                    type="checkbox"
                    checked={registerOnExternal}
                    onChange={(e) => setRegisterOnExternal(e.target.checked)}
                    className="h-4 w-4 rounded border border-white/20 bg-[#0b0b0d]"
                  />
                  Attiva
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="search"
              value={tachoSearch}
              onChange={(e) => setTachoSearch(e.target.value)}
              placeholder="Cerca autista..."
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-background">
              {tachoLoading ? (
                <div className="px-3 py-3 text-xs text-white/60">Caricamento autisti...</div>
              ) : filteredTachoDrivers.length ? (
                filteredTachoDrivers.map((driver) => {
                  const isSelected = tachoSelectedIds.includes(driver.id);
                  const primaryLabel =
                    `${driver.name} ${driver.surname}`.trim()
                    || driver.cardName
                    || driver.cardNumber
                    || "--";
                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => toggleTachoDriver(driver.id)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition ${
                        isSelected
                          ? "bg-white/10 text-white"
                          : "text-white/80 hover:bg-white/5"
                      }`}
                    >
                      <span className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-3">
                        <span className="min-w-[50%] truncate">{primaryLabel}</span>
                        <span className="truncate text-right text-white/50">
                          {driver.cardNumber || ""}
                        </span>
                      </span>
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                          isSelected
                            ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                            : "border-white/20 text-white/40"
                        }`}
                        aria-hidden="true"
                      >
                        <i className="fa fa-check text-[10px]" />
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-3 text-xs text-white/60">
                  Nessun autista trovato.
                </div>
              )}
            </div>
            {tachoError && <p className="text-xs text-red-400">{tachoError}</p>}
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-300">{success}</p>}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={
              activeTab === "manual"
                ? isEditMode
                  ? handleUpdateSubmit
                  : handleManualSubmit
                : handleImportSubmit
            }
            disabled={submitting || readOnly}
            className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Salvataggio..."
              : activeTab === "manual"
                ? isEditMode
                  ? "Aggiorna autista"
                  : "Registra autista"
                : "Importa autisti"}
          </button>
          <button
            type="button"
            onClick={() => {
              setName("");
              setSurname("");
              setPhone("");
              setCardId("");
              setRegisterOnExternal(false);
              setTachoSelectedIds([]);
              setError(null);
              setSuccess(null);
            }}
            disabled={readOnly}
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/60 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function VehicleRegistrationSidebar({
  isOpen,
  isSuperAdmin,
  initialVehicle,
  focusSection,
  onDone,
}: {
  isOpen: boolean;
  isSuperAdmin: boolean;
  initialVehicle?: VehicleEditTarget | null;
  focusSection?: "tags" | null;
  onDone?: () => void;
}) {
  const imeiRegex = /^\d{15}$/;
  const isEditMode = Boolean(initialVehicle);
  const [companyOptions, setCompanyOptions] = React.useState<AdminCompany[]>([]);
  const [companyId, setCompanyId] = React.useState("");
  const [companyLoading, setCompanyLoading] = React.useState(false);
  const [companyError, setCompanyError] = React.useState<string | null>(null);
  const [nickname, setNickname] = React.useState("");
  const [plate, setPlate] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [vehicleType, setVehicleType] = React.useState("camion");
  const [simPrefix, setSimPrefix] = React.useState("+39");
  const [simNumber, setSimNumber] = React.useState("");
  const [simIccid, setSimIccid] = React.useState("");
  const [deviceModel, setDeviceModel] = React.useState("FMC150");
  const [codec, setCodec] = React.useState("8 Ext");
  const [imei, setImei] = React.useState("");
  const [tank1Capacity, setTank1Capacity] = React.useState("");
  const [tank1Unit, setTank1Unit] = React.useState("litres");
  const [secondTankEnabled, setSecondTankEnabled] = React.useState(false);
  const [tank2Capacity, setTank2Capacity] = React.useState("");
  const [tank2Unit, setTank2Unit] = React.useState("litres");
  const [tags, setTags] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [monitoringPromptOpen, setMonitoringPromptOpen] = React.useState(false);
  const [previewStatus, setPreviewStatus] = React.useState<"idle" | "connecting" | "active" | "error">("idle");
  const wsRef = React.useRef<WebSocket | null>(null);
  const previewImeiRef = React.useRef<string | null>(null);
  const previewMetaRef = React.useRef({ nickname, plate, brand, model });
  const tagsRef = React.useRef<HTMLDivElement | null>(null);
  const initialMetaRef = React.useRef({ plate: "", brand: "", model: "" });

  React.useEffect(() => {
    previewMetaRef.current = { nickname, plate, brand, model };
  }, [nickname, plate, brand, model]);

  React.useEffect(() => {
    if (!isOpen || !initialVehicle) return;
    const normalizePlate = (value: VehicleEditTarget["plate"]) => {
      if (!value) return "";
      if (typeof value === "string") return value;
      return value.v || value.value || "";
    };
    const details = initialVehicle.details || {};
    const tankPrimary = details?.tanks?.primary;
    const tankSecondary = details?.tanks?.secondary;
    const sim = details?.sim || {};

    setCompanyId("");
    setNickname(initialVehicle.nickname || "");
    setPlate(normalizePlate(initialVehicle.plate));
    setBrand(initialVehicle.brand || "");
    setModel(initialVehicle.model || "");
    setVehicleType((initialVehicle as any).vehicleType || "camion");
    setImei(initialVehicle.imei || "");
    setDeviceModel(initialVehicle.deviceModel || "FMC150");
    setCodec(initialVehicle.codec || "8 Ext");
    setTags(Array.isArray(initialVehicle.tags) ? initialVehicle.tags : []);

    setTank1Capacity(
      tankPrimary?.capacity != null ? String(tankPrimary.capacity) : "",
    );
    setTank1Unit((tankPrimary?.unit as string) || "litres");
    const hasSecondary = Number.isFinite(tankSecondary?.capacity ?? null);
    setSecondTankEnabled(hasSecondary);
    setTank2Capacity(
      tankSecondary?.capacity != null ? String(tankSecondary.capacity) : "",
    );
    setTank2Unit((tankSecondary?.unit as string) || "litres");

    setSimPrefix(sim.prefix || "+39");
    setSimNumber(sim.number || "");
    setSimIccid(sim.iccid || "");

    initialMetaRef.current = {
      plate: normalizePlate(initialVehicle.plate).trim().toLowerCase(),
      brand: (initialVehicle.brand || "").trim().toLowerCase(),
      model: (initialVehicle.model || "").trim().toLowerCase(),
    };
  }, [initialVehicle, isOpen]);

  React.useEffect(() => {
    if (!isOpen || initialVehicle) return;
    setCompanyId("");
    setNickname("");
    setPlate("");
    setBrand("");
    setModel("");
    setVehicleType("camion");
    setImei("");
    setSimPrefix("+39");
    setSimNumber("");
    setSimIccid("");
    setDeviceModel("FMC150");
    setCodec("8 Ext");
    setTank1Capacity("");
    setTank1Unit("litres");
    setSecondTankEnabled(false);
    setTank2Capacity("");
    setTank2Unit("litres");
    setTags([]);
    setError(null);
    setSuccess(null);
  }, [initialVehicle, isOpen]);

  React.useEffect(() => {
    if (!isOpen || focusSection !== "tags") return;
    const node = tagsRef.current;
    if (!node) return;
    window.setTimeout(() => {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, [focusSection, isOpen]);

  const imeiValid = imeiRegex.test(imei.trim());
  const tank1Value = Number(tank1Capacity);
  const tank2Value = Number(tank2Capacity);
  const tank1Valid = Number.isFinite(tank1Value) && tank1Value > 0;
  const tank2Valid = !secondTankEnabled || (Number.isFinite(tank2Value) && tank2Value > 0);
  const tank2UnitValid = !secondTankEnabled || Boolean(tank2Unit);

  const canSubmit =
    (!isSuperAdmin || isEditMode || companyId.trim().length > 0) &&
    nickname.trim().length > 0 &&
    plate.trim().length > 3 &&
    brand.trim().length > 0 &&
    model.trim().length > 0 &&
    imeiValid &&
    deviceModel.trim().length > 0 &&
    codec.trim().length > 0 &&
    simNumber.trim().length > 5 &&
    simIccid.trim().length > 8 &&
    tank1Valid &&
    Boolean(tank1Unit) &&
    tank2Valid &&
    tank2UnitValid;

  const resolvePreviewUrl = React.useCallback((targetImei: string) => {
    if (typeof window === "undefined") return "";
    const base = API_BASE_URL
      ? API_BASE_URL.replace(/^http/, "ws")
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
    return `${base}/ws/devicepreview?imei=${encodeURIComponent(targetImei)}`;
  }, []);

  const clearPreviewMarker = React.useCallback((targetImei?: string) => {
    if (typeof window === "undefined") return;
    const fn = (window as any).trucklyClearPreviewVehicle;
    if (typeof fn === "function") {
      fn(targetImei);
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen || !isSuperAdmin) return;
    const loadCompanies = async () => {
      setCompanyLoading(true);
      setCompanyError(null);
      try {
        const res = await fetch(`${API_BASE_URL || ""}/api/admin/companies`, {
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.companies) ? data.companies : [];
        setCompanyOptions(list);
      } catch (err: any) {
        setCompanyError(err?.message || "Errore durante il caricamento aziende.");
      } finally {
        setCompanyLoading(false);
      }
    };
    void loadCompanies();
  }, [isOpen, isSuperAdmin]);

  React.useEffect(() => {
    if (!isOpen || !imeiValid) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (previewImeiRef.current) {
        clearPreviewMarker(previewImeiRef.current);
        previewImeiRef.current = null;
      }
      setPreviewStatus("idle");
      return;
    }

    if (previewImeiRef.current === imei && wsRef.current) {
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = resolvePreviewUrl(imei);
    if (!url) return;

    setPreviewStatus("connecting");
    previewImeiRef.current = imei;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setPreviewStatus("connecting");
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setPreviewStatus("active");
        const meta = previewMetaRef.current;
        const previewFn = (window as any).trucklyPreviewVehicle;
        if (typeof previewFn === "function") {
          previewFn({
            imei,
            data,
            vehicle: {
              imei,
              nickname: meta.nickname || "Preview",
              plate: meta.plate || "IMEI " + imei,
              brand: meta.brand,
              model: meta.model,
            },
          });
        }
      } catch {
        setPreviewStatus("error");
      }
    };
    ws.onerror = () => setPreviewStatus("error");
    ws.onclose = () => setPreviewStatus("idle");

    return () => {
      ws.close();
      wsRef.current = null;
      clearPreviewMarker(imei);
    };
  }, [clearPreviewMarker, imei, imeiValid, isOpen, resolvePreviewUrl]);

  React.useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (previewImeiRef.current) {
        clearPreviewMarker(previewImeiRef.current);
        previewImeiRef.current = null;
      }
    };
  }, [clearPreviewMarker]);

  const hasMonitoringChange = () => {
    if (!isEditMode) return false;
    const next = {
      plate: plate.trim().toLowerCase(),
      brand: brand.trim().toLowerCase(),
      model: model.trim().toLowerCase(),
    };
    const prev = initialMetaRef.current;
    return next.plate !== prev.plate || next.brand !== prev.brand || next.model !== prev.model;
  };

  const handleSubmit = async (policy?: "append" | "rename") => {
    if (!canSubmit || submitting) {
      return;
    }
    const monitoringChanged = isEditMode && hasMonitoringChange();
    if (monitoringChanged && !policy) {
      setError(
        "Scegli come gestire lo storico: accoda o archivia e riparti.",
      );
      setMonitoringPromptOpen(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const vehicleId = initialVehicle?.id || (initialVehicle as any)?._id || null;
    const payload: any = {
      nickname: nickname.trim(),
      plate: plate.trim(),
      brand: brand.trim(),
      model: model.trim(),
      vehicleType,
      imei: imei.trim(),
      deviceModel: deviceModel.trim(),
      codec: codec.trim(),
      tags,
    };

    if (vehicleId) {
      payload.id = vehicleId;
    }

    if (isSuperAdmin && companyId.trim()) {
      payload.companyId = companyId.trim();
    }

    const details: any = {
      tanks: {
        primary: {
          capacity: Number.isFinite(tank1Value) ? tank1Value : null,
          unit: tank1Unit,
        },
      },
      sim: {
        prefix: simPrefix.trim() || null,
        number: simNumber.trim() || null,
        iccid: simIccid.trim() || null,
      },
    };

    if (secondTankEnabled && Number.isFinite(tank2Value)) {
      details.tanks.secondary = {
        capacity: tank2Value,
        unit: tank2Unit,
      };
    }

    payload.details = details;

    if (policy && hasMonitoringChange()) {
      payload.monitoringPolicy = policy;
    }

    const url = isEditMode
      ? `${API_BASE_URL}/api/vehicles/update`
      : `${API_BASE_URL}/dashboard/vehicles/create`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Non hai i permessi per creare veicoli.");
      }

      if (res.status === 409) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Operazione non completata.");
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Errore salvataggio veicolo (${res.status})`);
      }

      setSuccess(
        isEditMode
          ? `Veicolo ${payload.nickname} aggiornato.`
          : `Veicolo ${payload.nickname} registrato.`,
      );
      window.dispatchEvent(new CustomEvent("truckly:vehicles-refresh"));

      if (!isEditMode) {
        setCompanyId("");
        setNickname("");
        setPlate("");
        setBrand("");
        setModel("");
        setImei("");
        setSimPrefix("+39");
        setSimNumber("");
        setSimIccid("");
        setDeviceModel("FMC150");
        setCodec("8 Ext");
        setTank1Capacity("");
        setTank1Unit("litres");
        setSecondTankEnabled(false);
        setTank2Capacity("");
        setTank2Unit("litres");
        setTags([]);

        if (previewImeiRef.current) {
          clearPreviewMarker(previewImeiRef.current);
          previewImeiRef.current = null;
        }
      } else {
        onDone?.();
      }
    } catch (err: any) {
      setError(err?.message || "Errore durante la registrazione.");
    } finally {
      setSubmitting(false);
      setMonitoringPromptOpen(false);
    }
  };

  const tagSuggestions = [
    "Telemetria",
    "GPS",
    "Temperatura",
    "CAN",
    "Rimorchio",
    "Motore",
    "Alert",
  ];

  const monitoringPrompt =
    monitoringPromptOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4">
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0b0b0c] p-6 shadow-[0_30px_70px_rgba(0,0,0,0.7)]">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.28em] text-white/50">
                  Attenzione
                </p>
                <h3 className="text-2xl font-semibold text-white">
                  Gestione storico veicolo
                </h3>
                <p className="text-sm text-white/70">
                  Hai modificato targa, marca o modello. Questa scelta determina
                  come verranno gestiti i dati telemetrici storici del veicolo.
                </p>
              </div>

              <div className="mt-5 grid gap-3 text-sm text-white/70">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-white/90 font-semibold">Accoda storico</div>
                  <p className="mt-1 text-white/60">
                    Continua a usare la stessa collection `IMEI_monitoring`
                    aggiungendo i nuovi dati sopra allo storico esistente.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-white/90 font-semibold">Archivia e riavvia</div>
                  <p className="mt-1 text-white/60">
                    Rinomina la collection esistente in `IMEI_OLDPLATE_monitoring`
                    e crea una nuova `IMEI_monitoring` per il veicolo aggiornato.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => handleSubmit("append")}
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15 transition"
                >
                  Accoda
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit("rename")}
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15 transition"
                >
                  Archivia e riavvia
                </button>
                <button
                  type="button"
                  onClick={() => setMonitoringPromptOpen(false)}
                  className="rounded-xl border border-white/10 bg-transparent px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/60 hover:text-white transition"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-4">
      {monitoringPrompt}
      <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="space-y-1">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
            Dati veicolo
          </p>
          <p className="text-sm text-white/60">
            I campi contrassegnati sono obbligatori.
          </p>
        </div>
        {isSuperAdmin && !isEditMode && (
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.1em] text-white/60">
              Azienda
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              <option value="">
                {companyLoading ? "Caricamento..." : "Seleziona azienda"}
              </option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {companyError && (
              <p className="text-xs text-red-400">{companyError}</p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Nickname</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Targa</label>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Marca</label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Modello</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Tipo veicolo</label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              <option value="auto">Auto</option>
              <option value="furgone">Furgone</option>
              <option value="camion">Camion</option>
              <option value="trattore">Trattore</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">SIM & dispositivo</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Prefisso</label>
            <select
              value={simPrefix}
              onChange={(e) => setSimPrefix(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              <option value="+39">+39</option>
              <option value="+43">+43</option>
              <option value="+44">+44</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Numero SIM</label>
            <input
              value={simNumber}
              onChange={(e) => setSimNumber(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">ICCID SIM</label>
            <input
              value={simIccid}
              onChange={(e) => setSimIccid(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Modello dispositivo</label>
            <select
              value={deviceModel}
              onChange={(e) => setDeviceModel(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              <option value="FMC150">FMC150</option>
              <option value="FMC920">FMC920</option>
              <option value="FMC650">FMC650</option>
              <option value="FMB641">FMB641</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Codec</label>
            <select
              value={codec}
              onChange={(e) => setCodec(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              <option value="8 Ext">8 Ext</option>
              <option value="8">8</option>
              <option value="12">12</option>
            </select>
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">IMEI</label>
            <input
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              disabled={isEditMode}
              className={`w-full rounded-lg border px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30 disabled:opacity-60 disabled:cursor-not-allowed ${
                imei && !imeiValid ? "border-red-500/60 bg-[#1a0c0c]" : "border-white/10 bg-background"
              }`}
              placeholder="15 cifre"
            />
            <p className="text-[11px] text-white/50">
              {imeiValid
                ? previewStatus === "active"
                  ? "Anteprima attiva sulla mappa."
                  : previewStatus === "connecting"
                  ? "Connessione al dispositivo..."
                  : "IMEI valido."
                : imei.length
                ? "IMEI non valido."
                : "Inserisci un IMEI per vedere l'anteprima."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">Serbatoi</p>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 items-center">
            <div className="col-span-2">
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Capienza serbatoio 1</label>
              <input
                type="number"
                min={0}
                value={tank1Capacity}
                onChange={(e) => setTank1Capacity(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30 ${
                  tank1Capacity && !tank1Valid ? "border-red-500/60 bg-[#1a0c0c]" : "border-white/10 bg-background"
                }`}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Unita</label>
              <select
                value={tank1Unit}
                onChange={(e) => setTank1Unit(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-background px-2 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              >
                <option value="litres">Litri</option>
                <option value="gallons">Galloni</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={secondTankEnabled}
              onChange={(e) => setSecondTankEnabled(e.target.checked)}
            />
            Serbatoio secondario
          </div>
          {secondTankEnabled && (
            <div className="grid grid-cols-3 gap-3 items-center">
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Capienza serbatoio 2</label>
                <input
                  type="number"
                  min={0}
                  value={tank2Capacity}
                  onChange={(e) => setTank2Capacity(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30 ${
                    tank2Capacity && !tank2Valid ? "border-red-500/60 bg-[#1a0c0c]" : "border-white/10 bg-background"
                  }`}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Unita</label>
                <select
                  value={tank2Unit}
                  onChange={(e) => setTank2Unit(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-background px-2 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
                >
                  <option value="litres">Litri</option>
                  <option value="gallons">Galloni</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">Tags</p>
        <TagInput
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
          storageKey="vehicleTags_suggestions"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-300">{success}</p>}
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={!canSubmit || submitting}
          className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting
            ? "Salvataggio..."
            : isEditMode
              ? "Aggiorna veicolo"
              : "Registra veicolo"}
        </button>
      </div>
    </div>
  );
}

function GeofenceSidebar({
  geofenceDraft,
}: {
  geofenceDraft?: {
    geofenceId: string;
    imei: string;
    center: { lng: number; lat: number };
    radiusMeters: number;
  } | null;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [radiusKm, setRadiusKm] = React.useState<number>(1);
  const [centerLat, setCenterLat] = React.useState<number | "">("");
  const [centerLng, setCenterLng] = React.useState<number | "">("");
  const [triggers, setTriggers] = React.useState({
    arrive: true,
    leave: true,
    nearby: false,
  });

  React.useEffect(() => {
    if (!geofenceDraft) return;
    setRadiusKm(Number((geofenceDraft.radiusMeters / 1000).toFixed(2)) || 1);
    setCenterLat(Number(geofenceDraft.center.lat.toFixed(6)));
    setCenterLng(Number(geofenceDraft.center.lng.toFixed(6)));
    setName("");
    setDescription("");
  }, [geofenceDraft]);

  React.useEffect(() => {
    if (!geofenceDraft) return;
    if (centerLat === "" || centerLng === "" || !Number.isFinite(radiusKm)) return;
    const radiusMeters = Math.max(50, Number(radiusKm) * 1000);
    (window as any).trucklyUpdateGeofence?.(
      geofenceDraft.geofenceId,
      { lat: Number(centerLat), lng: Number(centerLng) },
      radiusMeters,
    );
  }, [geofenceDraft, centerLat, centerLng, radiusKm]);

  const canSave = Boolean(name.trim() && description.trim() && geofenceDraft);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="space-y-1">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
            Dettagli geofence
          </p>
          <p className="text-sm text-white/60">
            Nome e descrizione sono obbligatori.
          </p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Descrizione</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              required
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
          Posizione e raggio
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Lat</label>
            <input
              value={centerLat}
              onChange={(e) => setCenterLat(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Lng</label>
            <input
              value={centerLng}
              onChange={(e) => setCenterLng(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Raggio (km)
          </label>
          <input
            type="number"
            min={0.05}
            step={0.05}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">Trigger</p>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={triggers.arrive}
            onChange={(e) => setTriggers((prev) => ({ ...prev, arrive: e.target.checked }))}
          />
          Arrivo nel perimetro
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={triggers.leave}
            onChange={(e) => setTriggers((prev) => ({ ...prev, leave: e.target.checked }))}
          />
          Uscita dal perimetro
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={triggers.nearby}
            onChange={(e) => setTriggers((prev) => ({ ...prev, nearby: e.target.checked }))}
          />
          Veicolo vicino
        </label>
      </div>

      <div className="rounded-2xl border border-white/10 bg-card p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between text-xs text-white/50 mb-3">
          <span>Target</span>
          <span>{geofenceDraft?.imei || "-"}</span>
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            if (!geofenceDraft) return;
            window.dispatchEvent(
              new CustomEvent("truckly:geofence-save", {
                detail: {
                  geofenceId: geofenceDraft.geofenceId,
                  imei: geofenceDraft.imei,
                  center: { lat: Number(centerLat), lng: Number(centerLng) },
                  radiusKm,
                  name: name.trim(),
                  description: description.trim(),
                  triggers,
                },
              }),
            );
          }}
          className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Salva GeoFence
        </button>
      </div>
    </div>
  );
}

function Section({ title, body }: SectionProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-card shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">{title}</p>
      </div>
      <div className="px-4 pb-4">
        <div className="rounded-xl border border-white/8 bg-background px-3.5 py-3 text-sm text-white/85 shadow-inner shadow-black/40">
          {body}
        </div>
      </div>
    </div>
  );
}

const COUNTER_GLOW: Record<string, string> = {
  "bg-orange-500": "#f97316",
  "bg-sky-700": "#0ea5e9",
  "bg-emerald-500": "#10b981",
};

function CounterBar({
  title,
  totalLabel,
  remainingLabel,
  remainingPct,
  accentClass,
}: CounterBarProps) {
  const safe = Math.min(100, Math.max(0, remainingPct));
  const glow = COUNTER_GLOW[accentClass] || "#f97316";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{remainingLabel}</span>
      </div>
      <div className="relative h-2.5 w-full rounded-t-full rounded-b-none bg-muted/50">
        <div
          className={`absolute inset-y-0 left-0 rounded-t-full rounded-b-none transition-[width] duration-500 ${accentClass}`}
          // Glow discreto (bassa opacità, blur ridotto) → linguaggio grafico semplice, niente bordi sfocati.
          style={{ width: `${safe}%`, boxShadow: `0 0 4px 0 ${glow}40` }}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">{totalLabel}</div>
    </div>
  );
}



