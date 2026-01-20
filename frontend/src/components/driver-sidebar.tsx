import React from "react";
import { API_BASE_URL } from "../config";
import { dataManager } from "../lib/data-manager";
import { TagInput } from "./tag-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type DriverSidebarProps = {
  isOpen: boolean;
  onClose?: () => void;
  selectedDriverImei?: string | null;
  selectedRouteImei?: string | null;
  selectedDriverDevice?: any | null;
  mode?: "driver" | "routes" | "geofence" | "vehicle" | "admin";
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
  };
};

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

type SortDir = "asc" | "desc";
type CompanySortField = "name" | "userCount" | "createdAt";
type UserSortField = "name" | "email" | "role" | "privilege" | "createdAt";

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

const formatShortDate = (value: string | number | null | undefined) => {
  if (!value) return "N/D";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/D";
  return date.toLocaleDateString("it-IT");
};

const formatRoleLabel = (value: number | null | undefined) => {
  if (value == null) return "N/D";
  return value <= 1 ? "Admin" : "Operatore";
};

const sortWithDir = <T,>(
  list: T[],
  dir: SortDir,
  selector: (item: T) => string | number | null | undefined,
) => {
  const multiplier = dir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => {
    const av = selector(a);
    const bv = selector(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * multiplier;
    return String(av).localeCompare(String(bv), "it", { sensitivity: "base" }) * multiplier;
  });
};

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
      return {
        timestamp: ts as number,
        gps: {
          Latitude: lat,
          Longitude: lon,
          Speed: Number.isFinite(speed) ? speed : 0,
        },
        io: { ignition: Number.isFinite(ignition) ? ignition : 0 },
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
  };
};

const formatEventLabel = (evt: { normalizedType?: string }) => {
  if (evt.normalizedType === "refuel") return "Rifornimento";
  if (
    evt.normalizedType === "withdrawal" ||
    evt.normalizedType === "fuel_withdrawal" ||
    evt.normalizedType === "fuel-theft" ||
    evt.normalizedType === "theft"
  ) {
    return "Prelievo";
  }
  return "Evento";
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

const resolveHeading = (history: RoutePoint[], index: number) => {
  if (!history.length) return 0;
  const prev = history[Math.max(0, index - 1)];
  const next = history[Math.min(history.length - 1, index + 1)];
  const dx = (next?.gps?.Longitude ?? 0) - (prev?.gps?.Longitude ?? 0);
  const dy = (next?.gps?.Latitude ?? 0) - (prev?.gps?.Latitude ?? 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
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
  const [scrubValue, setScrubValue] = React.useState(1);
  const prevImeiRef = React.useRef<string | null>(null);

  const normalizedHistory = React.useMemo(
    () => downsampleRoute(normalizeRouteHistory(historyRaw)),
    [historyRaw],
  );

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
    try {
      const data = await dataManager.getHistory(selectedVehicleImei, fromMs, toMs);
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
  }, [selectedVehicleImei, startDate, endDate]);

  React.useEffect(() => {
    if (prevImeiRef.current && prevImeiRef.current !== selectedVehicleImei) {
      (window as any).trucklyClearRoute?.(prevImeiRef.current);
      (window as any).trucklyShowAllMarkers?.();
      (window as any).rewinding = false;
      (window as any).trucklyApplyAvlCache?.();
    }
    prevImeiRef.current = selectedVehicleImei || null;
    setHistoryRaw([]);
    setEvents([]);
    setError(null);
    setScrubValue(1);
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
  }, [isOpen, selectedVehicleImei, normalizedHistory]);

  React.useEffect(() => {
    if (isOpen) return;
    (window as any).trucklyClearRoute?.(selectedVehicleImei);
    (window as any).trucklyShowAllMarkers?.();
    (window as any).rewinding = false;
    (window as any).trucklyApplyAvlCache?.();
  }, [isOpen, selectedVehicleImei]);

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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="space-y-1">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
            Intervallo percorsi
          </p>
          <p className="text-sm text-white/60">
            Seleziona una finestra e aggiorna il tracciato.
          </p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Da</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">A</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <button
            onClick={fetchRoutes}
            disabled={loading}
            className="h-9 w-full rounded-lg bg-white/10 border border-white/20 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:bg-white/15 transition disabled:opacity-50"
          >
            {loading ? "Carico" : "Aggiorna"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>Rewind</span>
          <span>{currentPoint ? new Date(currentPoint.timestamp).toLocaleString("it-IT") : "N/D"}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={scrubValue}
          onChange={(e) => setScrubValue(Number(e.target.value))}
          className="w-full"
        />
        <div className="text-xs text-white/60">
          {normalizedHistory.length
            ? `Punti caricati: ${normalizedHistory.length}`
            : loading
              ? "Caricamento percorsi..."
              : "Nessun percorso disponibile per l'intervallo selezionato."}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>Eventi</span>
          <span>{events.length}</span>
        </div>
        <div className="space-y-2 max-h-[220px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-xs text-white/50">
              Nessun evento disponibile per questo intervallo.
            </div>
          ) : (
            events.map((evt: any) => (
              <div
                key={evt.eventId}
                className="rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/80"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{formatEventLabel(evt)}</span>
                  <span className="text-white/50">{formatShortDateTime(evt.start)}</span>
                </div>
                <div className="mt-1 text-white/60">
                  {evt.liters != null ? `${evt.liters.toFixed(1)} L` : "Delta non disponibile"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

type SortButtonProps = {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
};

function SortButton({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: SortButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/55 hover:text-white/85 transition ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      <span>{label}</span>
      {active && (
        <i
          className={`fa ${dir === "asc" ? "fa-sort-up" : "fa-sort-down"} text-white/60`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function AdminSidebar({ isOpen }: { isOpen: boolean }) {
  const [companies, setCompanies] = React.useState<AdminCompany[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [companySort, setCompanySort] = React.useState<{
    field: CompanySortField;
    dir: SortDir;
  }>({ field: "name", dir: "asc" });
  const [userSort, setUserSort] = React.useState<{
    field: UserSortField;
    dir: SortDir;
  }>({ field: "name", dir: "asc" });
  const [userSearch, setUserSearch] = React.useState<Record<string, string>>({});

  const fetchCompanies = React.useCallback(async () => {
    const query = new URLSearchParams();
    const trimmed = search.trim();
    if (trimmed) query.set("search", trimmed);
    const url = `${API_BASE_URL || ""}/api/admin/companies${query.toString() ? `?${query}` : ""}`;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCompanies(Array.isArray(data?.companies) ? data.companies : []);
    } catch (err: any) {
      setError(err?.message || "Errore durante il caricamento.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const handle = window.setTimeout(() => {
      fetchCompanies();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [isOpen, fetchCompanies, search]);

  const sortedCompanies = React.useMemo(() => {
    return sortWithDir(companies, companySort.dir, (company) => {
      if (companySort.field === "userCount") return company.userCount ?? 0;
      if (companySort.field === "createdAt") {
        return company.createdAt ? new Date(company.createdAt).getTime() : 0;
      }
      return company.name || "";
    });
  }, [companies, companySort]);

  const toggleCompany = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateCompanySort = (field: CompanySortField) => {
    setCompanySort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === "asc" ? "desc" : "asc",
    }));
  };

  const updateUserSort = (field: UserSortField) => {
    setUserSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === "asc" ? "desc" : "asc",
    }));
  };

  const companyGrid =
    "grid min-w-0 grid-cols-[minmax(0,2.2fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto] items-center gap-2 sm:gap-3";
  const userGrid =
    "grid min-w-0 grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto] items-center gap-2 sm:gap-3";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-3 sm:p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">Aziende</p>
          <button
            type="button"
            onClick={fetchCompanies}
            className="h-8 rounded-full border border-white/15 bg-white/5 px-4 text-[11px] uppercase tracking-[0.2em] text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            {loading ? "Aggiorno..." : "Aggiorna"}
          </button>
        </div>

        <div className="flex items-center justify-end">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca azienda..."
            className="w-40 sm:w-56 rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="space-y-3">
          <div className={`${companyGrid} px-3 text-[9px] sm:text-[10px]`}>
            <SortButton
              label="Azienda"
              active={companySort.field === "name"}
              dir={companySort.dir}
              onClick={() => updateCompanySort("name")}
            />
            <SortButton
              label="Utenti"
              active={companySort.field === "userCount"}
              dir={companySort.dir}
              onClick={() => updateCompanySort("userCount")}
            />
            <SortButton
              label="Creato"
              active={companySort.field === "createdAt"}
              dir={companySort.dir}
              onClick={() => updateCompanySort("createdAt")}
            />
            <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-white/55 text-right">
              Azioni
            </div>
          </div>

          {sortedCompanies.length === 0 && !loading ? (
            <div className="rounded-xl border border-white/10 bg-[#0c0f16] px-3 py-3 text-xs text-white/60">
              Nessuna azienda trovata.
            </div>
          ) : (
            sortedCompanies.map((company) => {
              const isExpanded = expanded.has(company.id);
              const searchValue = (userSearch[company.id] || "").trim().toLowerCase();
              const filteredUsers = searchValue
                ? company.users.filter((user) => {
                    const name = `${user.firstName} ${user.lastName}`.toLowerCase();
                    return (
                      name.includes(searchValue) ||
                      user.email.toLowerCase().includes(searchValue)
                    );
                  })
                : company.users;
              const sortedUsers = sortWithDir(filteredUsers, userSort.dir, (user) => {
                if (userSort.field === "email") return user.email;
                if (userSort.field === "role") return user.role ?? 99;
                if (userSort.field === "privilege") return user.privilege ?? 99;
                if (userSort.field === "createdAt") {
                  return user.createdAt ? new Date(user.createdAt).getTime() : 0;
                }
                return `${user.firstName} ${user.lastName}`.trim();
              });

              return (
                <div
                  key={company.id}
                  className="rounded-xl border border-white/10 bg-[#0c0f16] px-3 py-3 text-xs text-white/80"
                >
                  <div className={`${companyGrid}`}>
                    <button
                      type="button"
                      onClick={() => toggleCompany(company.id)}
                      className="flex items-center gap-2 min-w-0 text-left"
                    >
                      <i
                        className={`fa ${isExpanded ? "fa-caret-down" : "fa-caret-right"} text-white/50`}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium text-white/90">{company.name}</span>
                    </button>
                    <div className="text-white/70">{company.userCount}</div>
                    <div className="text-white/70">{formatShortDate(company.createdAt)}</div>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center text-white/60 hover:text-white transition"
                          >
                            <i className="fa fa-ellipsis-h text-[11px]" aria-hidden="true" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[160px]">
                          <DropdownMenuItem>Nuovo utente</DropdownMenuItem>
                          <DropdownMenuItem>Dettagli azienda</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                      <div className="flex items-center justify-end">
                        <input
                          value={userSearch[company.id] || ""}
                          onChange={(e) =>
                            setUserSearch((prev) => ({
                              ...prev,
                              [company.id]: e.target.value,
                            }))
                          }
                          placeholder="Cerca utenti..."
                          className="w-40 sm:w-56 rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-white/30"
                        />
                      </div>

                      <div className={`${userGrid} px-2 text-[9px] sm:text-[10px]`}>
                        <SortButton
                          label="Nome"
                          active={userSort.field === "name"}
                          dir={userSort.dir}
                          onClick={() => updateUserSort("name")}
                        />
                        <div className="hidden sm:block">
                          <SortButton
                            label="Email"
                            active={userSort.field === "email"}
                            dir={userSort.dir}
                            onClick={() => updateUserSort("email")}
                          />
                        </div>
                        <SortButton
                          label="Ruolo"
                          active={userSort.field === "role"}
                          dir={userSort.dir}
                          onClick={() => updateUserSort("role")}
                        />
                        <div className="hidden sm:block">
                          <SortButton
                            label="Privilegio"
                            active={userSort.field === "privilege"}
                            dir={userSort.dir}
                            onClick={() => updateUserSort("privilege")}
                          />
                        </div>
                        <SortButton
                          label="Creato"
                          active={userSort.field === "createdAt"}
                          dir={userSort.dir}
                          onClick={() => updateUserSort("createdAt")}
                        />
                        <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-white/55 text-right">
                          Azioni
                        </div>
                      </div>

                      {sortedUsers.length === 0 ? (
                        <div className="rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/60">
                          Nessun utente trovato.
                        </div>
                      ) : (
                        sortedUsers.map((user) => (
                          <div
                            key={user.id}
                            className={`${userGrid} rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-[10px] sm:text-[11px] text-white/80`}
                          >
                            <div className="min-w-0 truncate">
                              {`${user.firstName} ${user.lastName}`.trim() || user.email}
                            </div>
                            <div className="hidden sm:block min-w-0 truncate text-white/70">{user.email}</div>
                            <div className="text-white/70">{formatRoleLabel(user.role)}</div>
                            <div className="hidden sm:block text-white/70">{user.privilege ?? "N/D"}</div>
                            <div className="text-white/70">{formatShortDate(user.createdAt)}</div>
                            <div className="flex justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex h-7 w-7 items-center justify-center text-white/60 hover:text-white transition"
                                  >
                                    <i className="fa fa-ellipsis-h text-[11px]" aria-hidden="true" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[160px]">
                                  <DropdownMenuItem>Modifica</DropdownMenuItem>
                                  <DropdownMenuItem>Disattiva</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))
                          )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function DriverSidebar({
  isOpen,
  onClose,
  selectedRouteImei,
  selectedDriverDevice,
  mode = "driver",
  geofenceDraft,
}: DriverSidebarProps) {
  const routesBaseUrl = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }, []);
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
  const isGeofenceMode = mode === "geofence";
  const isVehicleMode = mode === "vehicle";
  const isAdminMode = mode === "admin";

  React.useEffect(() => {
    let cancelled = false;
    if (!isOpen || isAdminMode) return () => {};
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
  }, [isOpen, driver1Id, hasDriver1, routesBaseUrl, initialCounters, isAdminMode]);

  return (
    <aside
      className={`fixed top-0 bottom-0 right-0 z-40 w-full max-w-[92vw] sm:w-[420px] lg:w-[520px] border-l border-white/10 bg-[#0e0f14] text-[#f8fafc] flex flex-col pt-16 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur truckly-sidebar transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isOpen ? "translate-x-0" : "hidden-right"
      } ${isAdminMode ? "w-full max-w-none sm:w-full lg:w-[40vw] lg:min-w-[40vw] lg:max-w-none" : ""}`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-start justify-between px-5 py-5 border-b border-white/10">
        <div className="space-y-1.5">
          {!isAdminMode && (
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Pannello</p>
          )}
          <h2 className="text-xl font-semibold leading-tight text-white">
            {isGeofenceMode
              ? "GeoFence"
              : isRoutesMode
              ? "Percorsi"
              : isVehicleMode
              ? "Nuovo veicolo"
              : isAdminMode
              ? "Utenti"
              : "Autista"}
          </h2>
          {!isAdminMode && (
            <p className="text-sm text-white/70">
              {isGeofenceMode
                ? "Configura la geofence appena creata."
                : isRoutesMode
                ? "Gestisci l'intervallo e scorri il percorso selezionato."
                : isVehicleMode
                ? "Inserisci i dati e visualizza l'anteprima sulla mappa principale."
                : "Seleziona un autista dal tooltip del mezzo per vedere i dettagli qui."}
            </p>
          )}
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

      <div className="flex-1 overflow-y-auto px-4 py-5 pb-8 space-y-4 bg-[#0e0f14]">
        {isGeofenceMode ? (
          <GeofenceSidebar geofenceDraft={geofenceDraft} />
        ) : isRoutesMode ? (
          <RoutesSidebar isOpen={isOpen} selectedVehicleImei={selectedRouteImei} />
        ) : isVehicleMode ? (
          <VehicleRegistrationSidebar isOpen={isOpen} />
        ) : isAdminMode ? (
          <AdminSidebar isOpen={isOpen} />
        ) : (
          <>
            <Section
              title="Stato selezione"
              body={
                hasDriver1
                  ? `Autista selezionato: ${driver1Id}`
                  : "Nessun autista rilevato."
              }
            />
            {hasDriver1 ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-[#10121a] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                  <div className="px-4 pt-4 pb-2">
                    <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">Stato guida</p>
                  </div>
                  <div className="px-4 pb-4 space-y-4">
                    {counterBars.map((bar) => (
                      <CounterBar key={bar.title} {...bar} />
                    ))}
                    {activityLoading && (
                      <p className="text-xs text-white/50">Caricamento attivita...</p>
                    )}
                    {activityStatus && !activityLoading && (
                      <p
                        className={`text-xs ${
                          activityStatus.toLowerCase().includes("errore")
                            ? "text-red-400"
                            : "text-white/60"
                        }`}
                      >
                        {activityStatus}
                      </p>
                    )}
                  </div>
                </div>
                <Section title="Informazioni generali" body="Nome, patente, e anagrafica verranno mostrati qui." />
                <Section title="Contatti" body="Email, telefono e note mostreranno qui." />
                <Section
                  title="Stato & disponibilita"
                  body="Turni, disponibilita e eventi recenti compariranno qui."
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
                      Report Attivita
                    </button>
                  }
                />
              </>
            ) : (
              <Section
                title="Pannello Autista"
                body="Nessun autista rilevato dal tachigrafo per questo veicolo."
              />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function VehicleRegistrationSidebar({ isOpen }: { isOpen: boolean }) {
  const imeiRegex = /^\d{15}$/;
  const [nickname, setNickname] = React.useState("");
  const [plate, setPlate] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
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
  const [previewStatus, setPreviewStatus] = React.useState<"idle" | "connecting" | "active" | "error">("idle");
  const wsRef = React.useRef<WebSocket | null>(null);
  const previewImeiRef = React.useRef<string | null>(null);
  const previewMetaRef = React.useRef({ nickname, plate, brand, model });

  React.useEffect(() => {
    previewMetaRef.current = { nickname, plate, brand, model };
  }, [nickname, plate, brand, model]);

  const imeiValid = imeiRegex.test(imei.trim());
  const tank1Value = Number(tank1Capacity);
  const tank2Value = Number(tank2Capacity);
  const tank1Valid = Number.isFinite(tank1Value) && tank1Value > 0;
  const tank2Valid = !secondTankEnabled || (Number.isFinite(tank2Value) && tank2Value > 0);
  const tank2UnitValid = !secondTankEnabled || Boolean(tank2Unit);

  const canSubmit =
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

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const payload: any = {
      nickname: nickname.trim(),
      plate: plate.trim(),
      brand: brand.trim(),
      model: model.trim(),
      imei: imei.trim(),
      deviceModel: deviceModel.trim(),
      codec: codec.trim(),
      tags,
    };

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

    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/vehicles/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Non hai i permessi per creare veicoli.");
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Errore salvataggio veicolo (${res.status})`);
      }

      setSuccess(`Veicolo ${payload.nickname} registrato.`);
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
    } catch (err: any) {
      setError(err?.message || "Errore durante la registrazione.");
    } finally {
      setSubmitting(false);
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="space-y-1">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
            Dati veicolo
          </p>
          <p className="text-sm text-white/60">
            I campi contrassegnati sono obbligatori.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Nickname</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Targa</label>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Marca</label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Modello</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">SIM & dispositivo</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Prefisso</label>
            <select
              value={simPrefix}
              onChange={(e) => setSimPrefix(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            >
              <option value="+39">+39</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Numero SIM</label>
            <input
              value={simNumber}
              onChange={(e) => setSimNumber(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">ICCID SIM</label>
            <input
              value={simIccid}
              onChange={(e) => setSimIccid(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Modello dispositivo</label>
            <select
              value={deviceModel}
              onChange={(e) => setDeviceModel(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
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
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
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
              className={`w-full rounded-lg border px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30 ${
                imei && !imeiValid ? "border-red-500/60 bg-[#1a0c0c]" : "border-white/10 bg-[#0c0f16]"
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

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
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
                  tank1Capacity && !tank1Valid ? "border-red-500/60 bg-[#1a0c0c]" : "border-white/10 bg-[#0c0f16]"
                }`}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Unita</label>
              <select
                value={tank1Unit}
                onChange={(e) => setTank1Unit(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-2 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
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
                    tank2Capacity && !tank2Valid ? "border-red-500/60 bg-[#1a0c0c]" : "border-white/10 bg-[#0c0f16]"
                  }`}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Unita</label>
                <select
                  value={tank2Unit}
                  onChange={(e) => setTank2Unit(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-2 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
                >
                  <option value="litres">Litri</option>
                  <option value="gallons">Galloni</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">Tags</p>
        <TagInput
          value={tags}
          onChange={setTags}
          suggestions={tagSuggestions}
          storageKey="vehicleTags_suggestions"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-300">{success}</p>}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "Salvataggio..." : "Registra veicolo"}
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
      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
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
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Descrizione</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              required
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
          Posizione e raggio
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Lat</label>
            <input
              value={centerLat}
              onChange={(e) => setCenterLat(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Lng</label>
            <input
              value={centerLng}
              onChange={(e) => setCenterLng(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
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
            className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
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

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
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


