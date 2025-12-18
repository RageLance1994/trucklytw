import { DB } from "/assets/js/database.js"

const normaliseTimestampMs = (value) => {
    if (value == null) return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
        // values below 10 digits are likely in seconds
        return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
};

class DataManager {
    constructor() {
        this.db = DB;
        this.db.open();
        this.fuelEventCache = new Map();
    }

    sanitizeEntry(entry = {}) {
        const pick = (source, keys = []) => {
            const out = {};
            keys.forEach((k) => {
                if (source?.hasOwnProperty(k)) out[k] = source[k];
            });
            return out;
        };

        const IO_KEYS = [
            'ignition', 'ignitionState', 'engine', 'engineStatus',
            'speed', 'vehicleSpeed', 'vehicle_speed',
            'movement', 'vehicleMovement', 'motion', 'moving',
            'totalOdometer', 'odometer', 'tripOdometer', 'mileage',
            'current_fuel', 'currentFuel', 'fuel_total', 'fuel', 'tank', 'tankLiters',
            'tank1', 'tank_1', 'tank2', 'tank_2', 'tankPrimary', 'tankSecondary', 'primaryTankCapacity', 'secondaryTankCapacity',
            'current_fuel_percent', 'currentFuelPercent', 'fuel_percent', 'tankPerc',
            'driver1Id', 'driver1Name', 'driver1CardPresence', 'driver1WorkingState',
            'driver2Id', 'driver2Name', 'driver2CardPresence', 'driver2WorkingState'
        ];

        const GPS_KEYS = ['Longitude', 'Latitude', 'Speed', 'Odometer', 'odometer'];

        const tsCandidate = entry.timestamp ?? entry.ts ?? entry?.gps?.timestamp ?? entry?.io?.timestamp ?? null;
        const sanitized = {
            timestamp: normaliseTimestampMs(tsCandidate),
            gps: pick(entry.gps || {}, GPS_KEYS),
            io: pick(entry.io || {}, IO_KEYS)
        };

        // Preserve original timestamp if present
        if (entry._id) sanitized._id = entry._id;
        return sanitized;
    }

    _coversRange(records = [], fromMs, toMs) {
        if (!Array.isArray(records) || !records.length) return false;
        const timestamps = records
            .map((item) => Number(item?.timestamp))
            .filter((ts) => Number.isFinite(ts));
        if (!timestamps.length) return false;
        const minTs = Math.min(...timestamps);
        const maxTs = Math.max(...timestamps);
        return minTs <= fromMs && maxTs >= toMs;
    }

    async getHistory(imei, from, to, options = {}, reduceBy = 20) {
        const MAX_RECORDS = 8000;
        const MAX_CHUNKS = 4;

        const normaliseBound = (value) => {
            if (value instanceof Date) return value.getTime();
            const numeric = Number(value);
            if (Number.isFinite(numeric)) return numeric;
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? null : parsed;
        };

        const fromMs = normaliseBound(from);
        const toMs = normaliseBound(to);

        if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
            return { raw: [], fuelEvents: [] };
        }

        const forceFetch = Boolean(options && typeof options === 'object' && options.forceFetch);
        const storeName = String(imei);
        const cachedRaw = await this.db.get(storeName, fromMs, toMs, {}, { direction: 'prev', limit: MAX_RECORDS });
        const cached = Array.isArray(cachedRaw)
            ? cachedRaw.map((entry) => this.sanitizeEntry(entry)).filter((entry) => Number.isFinite(entry.timestamp))
            : [];
        const hasCacheCoverage = !forceFetch && this._coversRange(cached, fromMs, toMs);

        let historyRaw = hasCacheCoverage ? cached : [];

        if (!hasCacheCoverage) {
            let summary = null;
            try {
                summary = await this.countRecords({
                    imei,
                    from: Math.min(fromMs, toMs),
                    to: Math.max(fromMs, toMs)
                });
            } catch (err) {
                console.warn('[DataManager] preview request failed, attempting direct fetch', err);
            }

            const chunkCount = Math.min(Math.max(1, summary?.chunks || 1), MAX_CHUNKS);
            const queries = this.formulateQueries({ imei, from: fromMs, to: toMs }, chunkCount);

            const responses = await Promise.all(queries.map(async ({ from: qFrom, to: qTo }) => {
                try {
                    return await window._post('/dashboard/history/get', { imei, from: qFrom, to: qTo });
                } catch (err) {
                    console.error('[DataManager] unable to fetch history chunk', err);
                    return { raw: [] };
                }
            }));

            const fetched = responses
                .flatMap((entry) => (Array.isArray(entry?.raw) ? entry.raw : []))
                .filter(Boolean);

            if (fetched.length) {
                const sorted = fetched.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_RECORDS);
                const sanitized = sorted
                    .map((entry) => this.sanitizeEntry(entry))
                    .filter((entry) => Number.isFinite(entry.timestamp));
                await this.db.addMany(storeName, sanitized);
                historyRaw = sanitized;
            } else if (cached.length) {
                // fallback to whatever was already in IndexedDB when network fails
                historyRaw = cached;
            }
        }

        historyRaw.sort((a, b) => b.timestamp - a.timestamp);

        const fuelEvents = await this.fetchFuelEvents(imei, fromMs, toMs);

        return {
            raw: historyRaw,
            fuelEvents
        };
    }

    formulateQueries(body = {}, chunks = 1) {
        const { imei, from, to } = body;

        const normaliseTime = (value) => {
            if (value instanceof Date) {
                return value.getTime();
            }
            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? null : parsed;
        };

        const startMs = normaliseTime(from);
        const endMs = normaliseTime(to);
        const totalChunks = Math.max(1, Math.floor(Number(chunks) || 0));

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
            return [{ imei, from, to }];
        }

        const totalMs = endMs - startMs;
        const queries = [];

        for (let i = 0; i < totalChunks; i++) {
            const chunkFrom = startMs + Math.floor((i * totalMs) / totalChunks);
            const chunkTo = i === totalChunks - 1
                ? endMs
                : startMs + Math.floor(((i + 1) * totalMs) / totalChunks);

            queries.push({
                imei,
                from: chunkFrom,
                to: chunkTo,
                progress: parseFloat(((i + 1) / totalChunks).toFixed(2)),
            });
        }

        return queries;
    }

    async countRecords(body) {
        return (await window._post('/dashboard/history/preview', body));
    }

    async fetchFuelEvents(imei, from, to) {
        const cacheKey = `${imei}:${from}:${to}`;
        if (this.fuelEventCache.has(cacheKey)) {
            return this.fuelEventCache.get(cacheKey);
        }
        try {
            const res = await window._post('/dashboard/history/events', { imei, from, to });
            const events = Array.isArray(res?.fuelEvents) ? res.fuelEvents : [];
            const normalized = events
                .filter((evt) => evt && evt.eventId)
                .map((evt) => {
                    const toNumber = (value) => {
                        const num = Number(value);
                        return Number.isFinite(num) ? num : null;
                    };
                    const start = toNumber(evt.start ?? evt.startMs);
                    const end = toNumber(evt.end ?? evt.endMs ?? start);
                    const clone = { ...evt };
                    clone.start = start;
                    clone.end = end;
                    clone.startMs = start;
                    clone.endMs = end;
                    clone.liters = toNumber(clone.liters ?? clone.delta);
                    clone.delta = toNumber(clone.delta);
                    clone.durationMs = toNumber(clone.durationMs ?? (Number.isFinite(end) && Number.isFinite(start) ? end - start : null));
                    clone.startFuel = toNumber(clone.startFuel);
                    clone.endFuel = toNumber(clone.endFuel);
                    clone.lat = toNumber(clone.lat);
                    clone.lng = toNumber(clone.lng);
                    return clone;
                });
            this.fuelEventCache.set(cacheKey, normalized);
            return normalized;
        } catch (err) {
            console.error('[DataManager] unable to fetch fuel events', err);
            return [];
        }
    }
}

export const DM = new DataManager();
