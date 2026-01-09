import { TrucklyIndexedDb } from "./indexed-db";

const MAX_RECORDS = 8000;
const MAX_CHUNKS = 4;
const CACHE_SINGLE_CHUNK_RANGE_MS = 6 * 24 * 60 * 60 * 1000;
const TARGET_POINTS = 2000;
const MIN_BUCKET_MS = 60_000;

const normaliseTimestampMs = (value: any) => {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveBaseUrl = (baseUrl?: string) => {
  if (baseUrl) return baseUrl;
  if (typeof window === "undefined") return "";
  if (window.location.port === "5173") {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  return window.location.origin;
};

class DataManager {
  db: TrucklyIndexedDb | null;
  fuelEventCache: Map<string, any[]>;
  historyInFlight: Map<string, Promise<{ raw: any[]; fuelEvents: any[] }>>;
  eventInFlight: Map<string, Promise<any[]>>;
  dbReady: boolean;

  constructor() {
    this.dbReady = typeof indexedDB !== "undefined";
    this.db = this.dbReady ? new TrucklyIndexedDb() : null;
    if (this.db) {
      void this.db.open();
    }
    this.fuelEventCache = new Map();
    this.historyInFlight = new Map();
    this.eventInFlight = new Map();
  }

  sanitizeEntry(entry: any = {}) {
    const pick = (source: any, keys: string[]) => {
      const out: Record<string, any> = {};
      keys.forEach((k) => {
        if (source?.hasOwnProperty(k)) out[k] = source[k];
      });
      return out;
    };

    const IO_KEYS = [
      "ignition",
      "ignitionState",
      "engine",
      "engineStatus",
      "speed",
      "vehicleSpeed",
      "vehicle_speed",
      "movement",
      "vehicleMovement",
      "motion",
      "moving",
      "totalOdometer",
      "odometer",
      "tripOdometer",
      "mileage",
      "current_fuel",
      "currentFuel",
      "fuel_total",
      "fuel",
      "tank",
      "tankLiters",
      "tank1",
      "tank_1",
      "tank2",
      "tank_2",
      "tankPrimary",
      "tankSecondary",
      "primaryTankCapacity",
      "secondaryTankCapacity",
      "current_fuel_percent",
      "currentFuelPercent",
      "fuel_percent",
      "tankPerc",
      "driver1Id",
      "driver1Name",
      "driver1CardPresence",
      "driver1WorkingState",
      "driver2Id",
      "driver2Name",
      "driver2CardPresence",
      "driver2WorkingState",
    ];

    const GPS_KEYS = ["Longitude", "Latitude", "Speed", "Odometer", "odometer"];

    const tsCandidate =
      entry.timestamp ?? entry.ts ?? entry?.gps?.timestamp ?? entry?.io?.timestamp ?? null;
    const sanitized = {
      timestamp: normaliseTimestampMs(tsCandidate),
      gps: pick(entry.gps || {}, GPS_KEYS),
      io: pick(entry.io || {}, IO_KEYS),
    };

    if (entry._id) sanitized._id = entry._id;
    return sanitized;
  }

  _coversRange(records: any[] = [], fromMs: number, toMs: number) {
    if (!Array.isArray(records) || !records.length) return false;
    const timestamps = records
      .map((item) => Number(item?.timestamp))
      .filter((ts) => Number.isFinite(ts));
    if (!timestamps.length) return false;
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    return minTs <= fromMs && maxTs >= toMs;
  }

  formulateQueries(body: { imei: string; from: number; to: number }, chunks = 1) {
    const { imei, from, to } = body;
    const totalChunks = Math.max(1, Math.floor(Number(chunks) || 0));

    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
      return [{ imei, from, to }];
    }

    const totalMs = to - from;
    const queries = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunkFrom = from + Math.floor((i * totalMs) / totalChunks);
      const chunkTo =
        i === totalChunks - 1 ? to : from + Math.floor(((i + 1) * totalMs) / totalChunks);

      queries.push({
        imei,
        from: chunkFrom,
        to: chunkTo,
        progress: Number(((i + 1) / totalChunks).toFixed(2)),
      });
    }

    return queries;
  }

  _computeBucketMs(fromMs: number, toMs: number) {
    const rangeMs = Math.max(0, toMs - fromMs);
    if (!Number.isFinite(rangeMs) || rangeMs <= 0) return MIN_BUCKET_MS;
    const ideal = Math.ceil(rangeMs / TARGET_POINTS);
    const bucket = Math.max(MIN_BUCKET_MS, Math.ceil(ideal / MIN_BUCKET_MS) * MIN_BUCKET_MS);
    return Math.min(bucket, rangeMs);
  }

  async fetchFuelEvents(baseUrl: string, imei: string, fromMs: number, toMs: number) {
    const cacheKey = `${imei}:${fromMs}:${toMs}`;
    if (this.fuelEventCache.has(cacheKey)) {
      return this.fuelEventCache.get(cacheKey) || [];
    }
    if (this.eventInFlight.has(cacheKey)) {
      return this.eventInFlight.get(cacheKey) || [];
    }
    try {
      const request = (async () => {
        const res = await fetch(`${baseUrl}/dashboard/history/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ imei, from: fromMs, to: toMs }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const events = Array.isArray(data?.fuelEvents) ? data.fuelEvents : [];
        this.fuelEventCache.set(cacheKey, events);
        return events;
      })();
      this.eventInFlight.set(cacheKey, request);
      return await request;
    } catch (err) {
      console.error("[DataManager] unable to fetch fuel events", err);
      return [];
    } finally {
      this.eventInFlight.delete(cacheKey);
    }
  }

  async getHistory(
    imei: string,
    from: number | string | Date,
    to: number | string | Date,
    options: { forceFetch?: boolean; baseUrl?: string } = {},
  ) {
    const normaliseBound = (value: number | string | Date) => {
      if (value instanceof Date) return value.getTime();
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
      const parsed = Date.parse(String(value));
      return Number.isNaN(parsed) ? null : parsed;
    };

    const fromMs = normaliseBound(from);
    const toMs = normaliseBound(to);

    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
      return { raw: [], fuelEvents: [] };
    }

    const historyKey = `${imei}:${fromMs}:${toMs}`;
    if (this.historyInFlight.has(historyKey)) {
      return this.historyInFlight.get(historyKey)!;
    }

    const baseUrl = resolveBaseUrl(options.baseUrl);
    const forceFetch = Boolean(options.forceFetch);
    const storeName = String(imei);

    const request = (async () => {
      let cached: any[] = [];
      if (this.db && this.dbReady) {
        const cachedRaw = await this.db.get(storeName, fromMs, toMs, {}, { direction: "prev", limit: MAX_RECORDS });
        cached = Array.isArray(cachedRaw)
          ? cachedRaw.map((entry) => this.sanitizeEntry(entry)).filter((entry) => Number.isFinite(entry.timestamp))
          : [];
      }

      const hasCacheCoverage = !forceFetch && this._coversRange(cached, fromMs, toMs);
      let historyRaw = hasCacheCoverage ? cached : [];

      if (!hasCacheCoverage) {
        const rangeMs = toMs - fromMs;
        let chunkCount = 1;
        if (!forceFetch && rangeMs > CACHE_SINGLE_CHUNK_RANGE_MS) {
          if (rangeMs <= 7 * 24 * 60 * 60 * 1000) {
            chunkCount = 2;
          } else if (rangeMs <= 21 * 24 * 60 * 60 * 1000) {
            chunkCount = 3;
          } else {
            chunkCount = MAX_CHUNKS;
          }
        }

        const queries = this.formulateQueries({ imei, from: fromMs, to: toMs }, chunkCount);
        const bucketMs = this._computeBucketMs(fromMs, toMs);

        const responses = await Promise.all(
          queries.map(async ({ from: qFrom, to: qTo }) => {
            try {
              const res = await fetch(`${baseUrl}/dashboard/history/get`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ imei, from: qFrom, to: qTo, bucketMs }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return await res.json();
            } catch (err) {
              console.error("[DataManager] unable to fetch history chunk", err);
              return { raw: [] };
            }
          }),
        );

        const fetched = responses
          .flatMap((entry) => (Array.isArray(entry?.raw) ? entry.raw : []))
          .filter(Boolean);

        if (fetched.length) {
          const sorted = fetched.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_RECORDS);
          const sanitized = sorted
            .map((entry) => this.sanitizeEntry(entry))
            .filter((entry) => Number.isFinite(entry.timestamp));
          if (this.db && this.dbReady) {
            void this.db.addMany(storeName, sanitized);
          }
          historyRaw = sanitized;
        } else if (cached.length) {
          historyRaw = cached;
        }
      }

      historyRaw.sort((a, b) => b.timestamp - a.timestamp);
      const fuelEvents = await this.fetchFuelEvents(baseUrl, imei, fromMs, toMs);

      return {
        raw: historyRaw,
        fuelEvents,
      };
    })();

    this.historyInFlight.set(historyKey, request);
    try {
      return await request;
    } finally {
      this.historyInFlight.delete(historyKey);
    }
  }
}

export const dataManager = new DataManager();
export const resolveBackendBaseUrl = resolveBaseUrl;
