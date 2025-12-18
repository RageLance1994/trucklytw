import { ChartWrapper } from '/assets/js/charts.js';
import { Scrubber } from "/assets/js/scrubbers.js"
import { RewindManager } from "/assets/js/managers/_rewindManager.js"
import { DM } from "/assets/js/managers/_dataManager.js"
import { FuelChart } from '/assets/js/overlays/components/fuelChart.js';
import { ComboBox } from "/assets/js/comboBox.js";
import { Table } from '/assets/js/tables.js';
// Apex driver charts temporarily disabled for diagnostics
import initDriverCharts from '/assets/js/overlays/driverCharts.js';
import { TrucklyMap } from '/assets/js/maps.js';

let RM = null;
const eventWrapper = document.querySelector('.event-wrapper')
const ewToggle = eventWrapper.querySelector('.handle[data-role="ew-toggle"]');
ewToggle.addEventListener('click', toggleEventWrapper)


async function toggleEventWrapper(ev) {
    eventWrapper.classList.toggle('shrunk')
    ewToggle.querySelector('i').classList.toggle('flipped')
}
const mapFrameElement = document.querySelector('iframe#mainmapframe');
let frame = null;
let hasHandledVehicleSnapshot = false;
let vehicleComboBox = null;

window.bottom = {};
window.activeBottomTab = 0;

const container = document.querySelector('.widget-controls#bottomSectionControls');
const [_start, _stop] = container.querySelectorAll('input[type="datetime-local"]');
const dayms = 86_400_000;

[_start.value, _stop.value] = [new Date(Date.now() - (Date.now() % dayms) - (3 * dayms)), new Date()].map(d => d.toISOString().slice(0, 16));


const FUEL_CHART_DIAGNOSTIC_OFF = false;

const _fuelChart = window._fuelChart || new FuelChart(new ChartWrapper('#fuelChart'));
window._fuelChart = _fuelChart;

const fuelChartHost = _fuelChart.chart.el;
if (fuelChartHost) {
    fuelChartHost.style.width = '100%';
    fuelChartHost.style.height = '100%';
    fuelChartHost.style.minHeight = '320px';
    fuelChartHost.style.flex = '1 1 auto';
    const parent = fuelChartHost.parentElement;
    if (parent) {
        if (!parent.style.display) parent.style.display = 'flex';
        parent.style.flexDirection = parent.style.flexDirection || 'column';
        parent.style.alignItems = parent.style.alignItems || 'stretch';
        parent.style.width = parent.style.width || '100%';
        parent.style.height = parent.style.height || '100%';
        parent.style.flex = parent.style.flex || '1 1 auto';
    }
}

const MAX_LEVEL_POINTS = 900;
const MAX_CONSUMPTION_POINTS = 600;
const LEVEL_SMA_WINDOW = 5;
const MIN_CONSUMPTION_DISTANCE_KM = 0.1; // skip noise below 100m
const MAX_CONSUMPTION_VALUE = 250; // l/100km sanity guard

const toFuelNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const extractFuelSnapshot = (io = {}) => {
    const litersCandidates = [
        io.current_fuel,
        io.currentFuel,
        io.fuel_total,
        io.fuel,
        io.tank,
        io.tankLiters
    ];
    let liters = null;
    for (const candidate of litersCandidates) {
        const val = toFuelNumber(candidate);
        if (Number.isFinite(val)) {
            liters = val;
            break;
        }
    }

    const tank1 = toFuelNumber(io.tank1 ?? io.tank_1 ?? io.tankPrimary ?? io.primaryTankCapacity);
    const tank2 = toFuelNumber(io.tank2 ?? io.tank_2 ?? io.tankSecondary ?? io.secondaryTankCapacity);
    const capacity = Number.isFinite(tank1) || Number.isFinite(tank2)
        ? (Number(tank1 || 0) + Number(tank2 || 0))
        : null;

    const percentCandidates = [
        io.current_fuel_percent,
        io.currentFuelPercent,
        io.fuel_percent,
        io.tankPerc
    ];
    let percent = null;
    for (const candidate of percentCandidates) {
        const val = toFuelNumber(candidate);
        if (Number.isFinite(val)) {
            percent = val > 1 ? val / 100 : val;
            break;
        }
    }

    if (!Number.isFinite(percent) && Number.isFinite(liters) && Number.isFinite(capacity) && capacity > 0) {
        percent = Math.max(0, Math.min(1, liters / capacity));
    } else if (!Number.isFinite(liters) && Number.isFinite(percent) && Number.isFinite(capacity)) {
        liters = percent * capacity;
    }

    return {
        liters,
        percent,
        capacity,
        tank1,
        tank2
    };
};

const cssVar = (name, fallback) => {
    if (!name) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (value || '').trim() || fallback;
};

const toRgba = (color, alpha = 0.35) => {
    if (!color) return `rgba(255, 255, 255, ${alpha})`;
    const trimmed = color.trim();

    if (trimmed.startsWith('rgba')) {
        const parts = trimmed.slice(trimmed.indexOf('(') + 1, trimmed.lastIndexOf(')')).split(',').map(p => p.trim());
        const [r, g, b] = parts;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    if (trimmed.startsWith('rgb')) {
        const parts = trimmed.slice(trimmed.indexOf('(') + 1, trimmed.lastIndexOf(')')).split(',').map(p => p.trim());
        const [r, g, b] = parts;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    let hex = trimmed.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(ch => ch + ch).join('');
    }

    if (hex.length !== 6 || Number.isNaN(Number.parseInt(hex, 16))) {
        return trimmed;
    }

    const intVal = Number.parseInt(hex, 16);
    const r = (intVal >> 16) & 255;
    const g = (intVal >> 8) & 255;
    const b = intVal & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const parseTimestamp = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : null;
};

const formatNumber = (value, digits = 1) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    const formatted = num.toFixed(digits);
    return digits ? formatted.replace(/\.?0+$/, '') : formatted;
};

const toFiniteNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const smoothSeries = (series = [], windowSize = 1) => {
    if (!Array.isArray(series) || !series.length || windowSize <= 1) {
        return Array.isArray(series) ? [...series] : [];
    }

    const size = Math.max(1, Math.floor(windowSize));
    const half = Math.floor(size / 2);

    return series.map((point, index, arr) => {
        if (!Array.isArray(point)) return point;
        const start = Math.max(0, index - half);
        const end = Math.min(arr.length, index + half + 1);
        const window = arr.slice(start, end);
        const avg = window.reduce((sum, item) => sum + (Array.isArray(item) ? Number(item[1]) || 0 : 0), 0) / window.length;
        return [point[0], avg];
    });
};

const downsampleSeries = (series = [], maxPoints = Infinity) => {
    if (!Array.isArray(series) || !series.length) return [];
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) return [];
    if (series.length <= maxPoints) return [...series];

    const bucketSize = Math.ceil(series.length / maxPoints);
    const buckets = [];

    for (let index = 0; index < series.length; index += bucketSize) {
        const slice = series.slice(index, index + bucketSize);
        if (!slice.length) continue;
        const middle = slice[Math.floor(slice.length / 2)];
        const timestamp = Array.isArray(middle) ? middle[0] : null;
        const avg = slice.reduce((sum, item) => sum + (Array.isArray(item) ? Number(item[1]) || 0 : 0), 0) / slice.length;
        buckets.push([timestamp ?? slice[0][0], avg]);
    }

    return buckets;
};

const MOVING_SPEED_THRESHOLD_KMH = 3;
const MAX_SEGMENT_DURATION_MS = 45 * 60 * 1000;
const MIN_CONSUMPTION_LITERS = 0.25;
const MAX_CONSUMPTION_LITERS = 600;
const MIN_DISTANCE_FOR_AVG_KM = 1;

const generalStatsContainer = document.querySelector('[data-role="general-stats"]');
const driverStatsContainer = document.querySelector('[data-role="driver-stats"]');
const driverSearchContainer = document.querySelector('[data-role="driver-stat-search"]');

const statisticsState = {
    general: null,
    driverStats: new Map(),
    driverList: [],
    selectedDriverId: null
};

const driverChartsState = {
    currentDriverId: null,
    requestId: 0
};


const getDriverChartTargets = () => Array.from(document.querySelectorAll('[data-driver-chart]'));

function setDriverChartMessage(targets, message) {
    targets.forEach((el) => {
        const overlay = el.querySelector('.overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.classList.remove('dead');
            overlay.innerHTML = `<div style="padding:8px 12px; text-align:center;">${message}</div>`;
        }
    });
}

function hydrateDriverCharts(driverId) {
    const targets = getDriverChartTargets();
    if (!targets.length) return;
    if (!driverId) {
        driverChartsState.currentDriverId = null;
        setDriverChartMessage(targets, 'Seleziona un autista');
        return;
    }

    const requestId = ++driverChartsState.requestId;
    initDriverCharts({ driverId, containers: targets })
        .then(() => {
            if (driverChartsState.requestId === requestId) {
                driverChartsState.currentDriverId = driverId;
            }
        })
        .catch((err) => {
            if (driverChartsState.requestId === requestId) {
                console.warn(`[bottom] driver charts init failed for ${driverId}`, err);
            }
        });
}

const STAT_ACCESSORS = {
    'avg-consumption': (stats) => stats?.avgConsumptionPer100Km,
    'hourly-consumption': (stats) => stats?.consumptionPerHour,
    'trip-consumption': (stats) => stats?.tripConsumption,
    'engine-hours': (stats) => stats?.engineHours,
    'refuel-count': (stats) => stats?.refuelCount,
    'total-consumption': (stats) => stats?.totalConsumption,
    'moving-consumption': (stats) => stats?.movingConsumption,
    'idle-consumption': (stats) => stats?.idleConsumption
};

const STAT_FORMATTERS = {
    'avg-consumption': (value) => formatLitersPer100Km(value),
    'hourly-consumption': (value) => formatLitersPerHour(value),
    'trip-consumption': (value) => formatLitersValue(value),
    'engine-hours': (value) => formatHoursValue(value),
    'refuel-count': (value) => formatCountValue(value),
    'total-consumption': (value) => formatLitersValue(value),
    'moving-consumption': (value) => formatLitersValue(value),
    'idle-consumption': (value) => formatLitersValue(value)
};

function formatLitersValue(value) {
    return Number.isFinite(value) ? `${formatNumber(value)} L` : '--';
}

function formatLitersPerHour(value) {
    return Number.isFinite(value) ? `${formatNumber(value)} L/h` : '--';
}

function formatLitersPer100Km(value) {
    return Number.isFinite(value) ? `${formatNumber(value)} L/100km` : '--';
}

function formatHoursValue(value) {
    return Number.isFinite(value) ? `${formatNumber(value)} h` : '--';
}

function formatCountValue(value) {
    return Number.isFinite(value) ? `${value}` : '--';
}

function renderStatBlock(container, stats) {
    if (!container) return;
    container.querySelectorAll('.stat').forEach((row) => {
        const key = row?.dataset?.statKey;
        const valueAccessor = key ? STAT_ACCESSORS[key] : null;
        const rawValue = valueAccessor ? valueAccessor(stats) : null;
        const formatter = STAT_FORMATTERS[key];
        const target = row.querySelector('[data-role="stat-value"]');
        if (target) {
            target.textContent = formatter ? formatter(rawValue) : (Number.isFinite(rawValue) ? rawValue : '--');
        }
    });
}

function normalizeHistorySamples(history = {}) {
    const driverMeta = new Map();
    const samples = Array.isArray(history?.raw)
        ? history.raw.map((entry) => {
            const timestamp = parseTimestamp(entry?.timestamp ?? entry?.ts);
            if (!Number.isFinite(timestamp)) return null;
            const io = entry?.io || {};
            const gps = entry?.gps || {};
            const { liters } = extractFuelSnapshot(io);
            const speedCandidates = [
                io.vehicleSpeed,
                io.speed,
                io.vehicle_speed,
                gps?.Speed,
                gps?.speed
            ];
            let speed = null;
            for (const candidate of speedCandidates) {
                const num = toFiniteNumber(candidate);
                if (Number.isFinite(num)) {
                    speed = num;
                    break;
                }
            }
            const movement = toFiniteNumber(io.movement ?? io.vehicleMovement ?? io.motion ?? io.moving);
            const ignition = toFiniteNumber(io.ignition ?? io.ignitionState ?? io.engine ?? io.engineStatus);
            const odometer = extractOdometerValue(entry);
            const drivers = extractDriversFromIO(io, timestamp, driverMeta);
            return {
                timestamp,
                liters: toFiniteNumber(liters),
                speed,
                movement,
                ignition,
                odometer,
                drivers
            };
        }).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp)
        : [];
    return { samples, driverMeta };
}

function smoothActivitySamples(samples = [], maxPoints = 800) {
    if (!Array.isArray(samples) || samples.length <= maxPoints) {
        return Array.isArray(samples) ? samples : [];
    }
    const first = samples[0]?.timestamp;
    const last = samples.at(-1)?.timestamp;
    if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) {
        return samples;
    }

    const span = Math.max(1, last - first);
    const bucketWidth = span / maxPoints;
    const result = [];
    let bucketStart = first;
    let bucket = [];

    const flush = () => {
        if (!bucket.length) return;
        const mid = bucket[Math.floor(bucket.length / 2)].timestamp;
        const avg = (key) => {
            const vals = bucket.map((b) => Number(b[key])).filter((v) => Number.isFinite(v));
            if (!vals.length) return null;
            return vals.reduce((s, v) => s + v, 0) / vals.length;
        };
        const speed = avg('speed');
        const ignitionVals = bucket.map((b) => b.ignition).filter((v) => Number.isFinite(v));
        const ignition = ignitionVals.length ? Math.round(ignitionVals.reduce((s, v) => s + v, 0) / ignitionVals.length) : null;
        result.push({
            timestamp: mid,
            speed,
            ignition
        });
        bucket = [];
    };

    for (const sample of samples) {
        const ts = sample?.timestamp;
        if (!Number.isFinite(ts)) continue;
        while (ts > bucketStart + bucketWidth) {
            flush();
            bucketStart += bucketWidth;
        }
        bucket.push(sample);
    }
    flush();
    return result;
}

function extractOdometerValue(entry = {}) {
    const io = entry?.io || {};
    const gps = entry?.gps || {};
    const candidates = [
        io.totalOdometer,
        io.odometer,
        io.tripOdometer,
        io.mileage,
        gps?.Odometer,
        gps?.odometer
    ];
    for (const candidate of candidates) {
        const num = toFiniteNumber(candidate);
        if (Number.isFinite(num)) {
            return num;
        }
    }
    return null;
}

function extractDriversFromIO(io = {}, timestamp, driverMeta) {
    const drivers = [];
    const slots = [
        {
            idKey: 'driver1Id',
            nameKey: 'driver1Name',
            cardKey: 'driver1CardPresence',
            workingKey: 'driver1WorkingState'
        },
        {
            idKey: 'driver2Id',
            nameKey: 'driver2Name',
            cardKey: 'driver2CardPresence',
            workingKey: 'driver2WorkingState'
        }
    ];
    slots.forEach((slot) => {
        const rawId = io?.[slot.idKey];
        if (!rawId) return;
        const id = String(rawId).trim();
        if (!id) return;
        const entry = {
            id,
            slot: slot.idKey,
            name: io?.[slot.nameKey] || null,
            card: toFiniteNumber(io?.[slot.cardKey]),
            workingState: toFiniteNumber(io?.[slot.workingKey]),
            timestamp
        };
        drivers.push(entry);
        registerDriverMeta(driverMeta, id, entry.name, timestamp, slot.idKey);
    });
    return drivers;
}

function registerDriverMeta(meta, id, label, timestamp, slot) {
    if (!meta || !id) return;
    const current = meta.get(id) || { id, label: label || id, slots: new Set(), lastSeen: timestamp || null };
    if (label && (!current.label || current.label === current.id)) {
        current.label = label;
    }
    if (slot) current.slots.add(slot);
    current.lastSeen = Math.max(current.lastSeen || 0, Number(timestamp) || 0);
    meta.set(id, current);
}

function summarizeFuelEvents(events = [], driverMeta) {
    const summary = {
        refuelCount: 0,
        refuelLiters: 0,
        withdrawalCount: 0,
        withdrawalLiters: 0,
        perDriver: new Map()
    };
    if (!Array.isArray(events)) return summary;

    events.forEach((evt) => {
        if (!evt) return;
        const type = (evt.normalizedType || evt.type || '').toLowerCase();
        const liters = toFiniteNumber(evt.liters ?? evt.delta);
        const driverId = evt.driverId ? String(evt.driverId) : null;
        if (driverId) {
            registerDriverMeta(driverMeta, driverId, evt.driverLabel || evt.driverName, evt.start ?? evt.startMs, null);
        }
        const driverSummary = driverId ? ensureDriverEventSummary(summary.perDriver, driverId) : null;
        if (type === 'refuel') {
            summary.refuelCount += 1;
            if (Number.isFinite(liters)) summary.refuelLiters += liters;
            if (driverSummary) {
                driverSummary.refuelCount += 1;
                if (Number.isFinite(liters)) driverSummary.refuelLiters += liters;
            }
        } else if (type === 'fuel_withdrawal' || type === 'withdrawal' || type === 'prelievo') {
            summary.withdrawalCount += 1;
            if (Number.isFinite(liters)) summary.withdrawalLiters += Math.abs(liters);
            if (driverSummary) {
                driverSummary.withdrawalCount += 1;
                if (Number.isFinite(liters)) driverSummary.withdrawalLiters += Math.abs(liters);
            }
        }
    });
    return summary;
}

function ensureDriverEventSummary(map, driverId) {
    if (!map.has(driverId)) {
        map.set(driverId, {
            refuelCount: 0,
            refuelLiters: 0,
            withdrawalCount: 0,
            withdrawalLiters: 0
        });
    }
    return map.get(driverId);
}

function ensureDriverStatsRecord(map, driverId, driverMeta) {
    if (!driverId) return null;
    if (!map.has(driverId)) {
        const meta = driverMeta?.get(driverId);
        map.set(driverId, {
            id: driverId,
            label: meta?.label || driverId,
            totalConsumption: 0,
            movingConsumption: 0,
            idleConsumption: 0,
            engineMs: 0,
            durationMs: 0,
            distanceKm: 0,
            refuelCount: 0,
            refuelLiters: 0,
            withdrawalLiters: 0
        });
    }
    return map.get(driverId);
}

function getActiveDrivers(drivers = []) {
    if (!Array.isArray(drivers)) return [];
    return drivers.filter((driver) => {
        if (!driver?.id) return false;
        const card = toFiniteNumber(driver.card);
        const working = toFiniteNumber(driver.workingState);
        if (Number.isFinite(card)) {
            if (card > 0) return true;
            if (card === 0) return false;
        }
        if (Number.isFinite(working)) {
            return working > 1;
        }
        return true;
    });
}

function isSegmentMoving(prev, curr) {
    if (!prev || !curr) return false;
    const movementPrev = toFiniteNumber(prev.movement);
    const movementCurr = toFiniteNumber(curr.movement);
    if ((movementPrev && movementPrev > 0) || (movementCurr && movementCurr > 0)) {
        return true;
    }
    const speedPrev = toFiniteNumber(prev.speed);
    const speedCurr = toFiniteNumber(curr.speed);
    const candidates = [speedPrev, speedCurr].filter((value) => Number.isFinite(value));
    if (!candidates.length) return false;
    const avgSpeed = candidates.reduce((sum, value) => sum + value, 0) / candidates.length;
    return avgSpeed >= MOVING_SPEED_THRESHOLD_KMH;
}

function isEngineOn(prev, curr) {
    if (!prev || !curr) return false;
    const ignitionPrev = toFiniteNumber(prev.ignition);
    const ignitionCurr = toFiniteNumber(curr.ignition);
    if ((ignitionPrev && ignitionPrev > 0) || (ignitionCurr && ignitionCurr > 0)) {
        return true;
    }
    const speedPrev = toFiniteNumber(prev.speed);
    const speedCurr = toFiniteNumber(curr.speed);
    return (speedPrev && speedPrev > 0) || (speedCurr && speedCurr > 0);
}

function computeSegmentDistanceKm(prev, curr, deltaMs) {
    if (!prev || !curr || !Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
    const odometerPrev = toFiniteNumber(prev.odometer);
    const odometerCurr = toFiniteNumber(curr.odometer);
    if (Number.isFinite(odometerPrev) && Number.isFinite(odometerCurr)) {
        const delta = odometerCurr - odometerPrev;
        if (delta > 0 && delta < 1_000_000) {
            return delta / 1000;
        }
    }
    const speedPrev = toFiniteNumber(prev.speed);
    const speedCurr = toFiniteNumber(curr.speed);
    const speeds = [speedPrev, speedCurr].filter((value) => Number.isFinite(value));
    if (!speeds.length) return 0;
    const avgSpeed = speeds.reduce((sum, value) => sum + value, 0) / speeds.length;
    const hours = deltaMs / 3_600_000;
    return Math.max(0, avgSpeed * hours);
}

function computeStatsFromSamples(samples, eventsSummary, driverMeta) {
    if (!samples.length) {
        return {
            general: null,
            driverStats: new Map()
        };
    }
    let totalConsumption = 0;
    let movingConsumption = 0;
    let idleConsumption = 0;
    let engineMs = 0;
    let totalDistanceKm = 0;
    let totalDurationMs = 0;
    const driverStats = new Map();

    let prev = samples[0];
    for (let index = 1; index < samples.length; index++) {
        const curr = samples[index];
        const deltaMs = curr.timestamp - prev.timestamp;
        if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > MAX_SEGMENT_DURATION_MS) {
            prev = curr;
            continue;
        }
        totalDurationMs += deltaMs;
        let consumption = 0;
        if (Number.isFinite(curr.liters) && Number.isFinite(prev.liters)) {
            const deltaLiters = prev.liters - curr.liters;
            if (deltaLiters > MIN_CONSUMPTION_LITERS && deltaLiters < MAX_CONSUMPTION_LITERS) {
                consumption = deltaLiters;
                totalConsumption += deltaLiters;
            }
        }
        const moving = isSegmentMoving(prev, curr);
        if (consumption) {
            if (moving) {
                movingConsumption += consumption;
            } else {
                idleConsumption += consumption;
            }
        }
        const engineOn = isEngineOn(prev, curr);
        if (engineOn) {
            engineMs += deltaMs;
        }
        const segmentDistance = computeSegmentDistanceKm(prev, curr, deltaMs);
        if (segmentDistance > 0) {
            totalDistanceKm += segmentDistance;
        }

        const activeDrivers = getActiveDrivers(prev.drivers);
        if (activeDrivers.length) {
            const share = 1 / activeDrivers.length;
            activeDrivers.forEach((driver) => {
                const record = ensureDriverStatsRecord(driverStats, driver.id, driverMeta);
                if (!record) return;
                record.durationMs += deltaMs * share;
                if (engineOn) record.engineMs += deltaMs * share;
                if (segmentDistance > 0) record.distanceKm += segmentDistance * share;
                if (consumption) {
                    record.totalConsumption += consumption * share;
                    if (moving) record.movingConsumption += consumption * share;
                    else record.idleConsumption += consumption * share;
                }
            });
        }

        prev = curr;
    }

    const startLiters = samples[0]?.liters;
    const endLiters = samples.at(-1)?.liters;
    const netDrop = Number.isFinite(startLiters) && Number.isFinite(endLiters)
        ? Math.max(0, startLiters - endLiters)
        : null;
    const engineHours = engineMs / 3_600_000;
    const durationHours = totalDurationMs / 3_600_000;
    const avgConsumptionPer100Km = totalDistanceKm >= MIN_DISTANCE_FOR_AVG_KM && totalConsumption > 0
        ? (totalConsumption / (totalDistanceKm / 100))
        : null;
    const consumptionPerHour = totalConsumption > 0
        ? (engineHours > 0 ? totalConsumption / engineHours : (durationHours > 0 ? totalConsumption / durationHours : null))
        : null;

    eventsSummary?.perDriver?.forEach((eventStats, driverId) => {
        const record = ensureDriverStatsRecord(driverStats, driverId, driverMeta);
        if (!record) return;
        record.refuelCount += eventStats.refuelCount;
        record.refuelLiters += eventStats.refuelLiters;
        record.withdrawalLiters += eventStats.withdrawalLiters;
    });

    driverStats.forEach((record) => {
        record.engineHours = record.engineMs / 3_600_000;
        record.durationHours = record.durationMs / 3_600_000;
        record.avgConsumptionPer100Km = record.distanceKm >= MIN_DISTANCE_FOR_AVG_KM && record.totalConsumption > 0
            ? (record.totalConsumption / (record.distanceKm / 100))
            : null;
        record.consumptionPerHour = record.totalConsumption > 0
            ? (record.engineHours > 0
                ? record.totalConsumption / record.engineHours
                : (record.durationHours > 0 ? record.totalConsumption / record.durationHours : null))
            : null;
        record.tripConsumption = record.totalConsumption;
        record.movingConsumption = Number.isFinite(record.movingConsumption) ? record.movingConsumption : null;
        record.idleConsumption = Number.isFinite(record.idleConsumption) ? record.idleConsumption : null;
    });

    const general = {
        avgConsumptionPer100Km: Number.isFinite(avgConsumptionPer100Km) ? avgConsumptionPer100Km : null,
        consumptionPerHour: Number.isFinite(consumptionPerHour) ? consumptionPerHour : null,
        tripConsumption: Number.isFinite(netDrop) ? netDrop : (Number.isFinite(totalConsumption) ? totalConsumption : null),
        engineHours: Number.isFinite(engineHours) ? engineHours : null,
        refuelCount: Number.isFinite(eventsSummary?.refuelCount) ? eventsSummary.refuelCount : null,
        totalConsumption: Number.isFinite(totalConsumption) ? totalConsumption : null,
        movingConsumption: Number.isFinite(movingConsumption) ? movingConsumption : null,
        idleConsumption: Number.isFinite(idleConsumption) ? idleConsumption : null
    };
    return { general, driverStats };
}

function buildDriverList(driverMeta, driverStats, driverEventsMap) {
    const ids = new Set();
    driverMeta?.forEach((_, id) => ids.add(id));
    driverStats?.forEach((_, id) => ids.add(id));
    driverEventsMap?.forEach((_, id) => ids.add(id));
    return [...ids]
        .filter(Boolean)
        .map((id) => ({
            id,
            label: driverMeta?.get(id)?.label || id
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'it-IT', { sensitivity: 'base' }));
}

function computeVehicleStatistics(history, fuelEvents, normalizedSamples = null) {
    const normalizedPayload = normalizedSamples || normalizeHistorySamples(history);
    const { samples, driverMeta } = normalizedPayload;
    const eventsSummary = summarizeFuelEvents(fuelEvents, driverMeta);
    const stats = computeStatsFromSamples(samples, eventsSummary, driverMeta);
    const driverList = buildDriverList(driverMeta, stats.driverStats, eventsSummary.perDriver);
    return {
        general: stats.general,
        driverStats: stats.driverStats,
        driverList
    };
}

function updateStatisticsUI(payload) {
    const generalStats = payload?.general || null;
    const driverStats = payload?.driverStats instanceof Map ? payload.driverStats : new Map();
    const driverList = Array.isArray(payload?.driverList) ? payload.driverList : [];
    statisticsState.general = generalStats;
    statisticsState.driverStats = driverStats;
    statisticsState.driverList = driverList;
    renderStatBlock(generalStatsContainer, generalStats);
    syncDriverCombo();
}

function syncDriverCombo() {
    if (!driverSearchContainer) {
        renderStatBlock(driverStatsContainer, null);
        return;
    }
    const options = statisticsState.driverList
        .filter((driver) => driver.id)
        .map((driver) => ({
            text: (driver.label && driver.label !== driver.id) ? [driver.label, driver.id] : driver.id,
            value: driver.id
        }));
    let combo = driverSearchContainer._comboInstance;
    const onChange = (value) => handleDriverSelection(value);
    if (!combo) {
        combo = new ComboBox(driverSearchContainer, options, onChange, () => { });
        driverSearchContainer._comboInstance = combo;
    } else {
        combo.setOptions(options);
    }
    if (!options.length) {
        statisticsState.selectedDriverId = null;
        renderStatBlock(driverStatsContainer, null);
        return;
    }
    const desired = (statisticsState.selectedDriverId && statisticsState.driverStats.has(statisticsState.selectedDriverId))
        ? statisticsState.selectedDriverId
        : options[0].value;
    statisticsState.selectedDriverId = desired;
    combo.selectValue(desired);
    hydrateDriverCharts(desired);
}

function handleDriverSelection(driverId) {
    statisticsState.selectedDriverId = driverId || null;
    const stats = driverId ? statisticsState.driverStats.get(driverId) : null;
    renderStatBlock(driverStatsContainer, stats || null);
    hydrateDriverCharts(driverId);
}

const vehicleStatusPill = document.querySelector('[data-role="vehicle-status-pill"]');
const VEHICLE_STATUS_CLASSES = ['success', 'warning', 'danger', 'info', 'muted'];
const DEFAULT_VEHICLE_STATUS = { label: 'Stato sconosciuto', className: 'muted' };
const vehicleStatusCache = new Map();

function renderVehicleStatusPill(status) {
    if (!vehicleStatusPill) return;
    const payload = status || DEFAULT_VEHICLE_STATUS;
    const label = payload.label || DEFAULT_VEHICLE_STATUS.label;
    const className = payload.className || DEFAULT_VEHICLE_STATUS.className;
    VEHICLE_STATUS_CLASSES.forEach((cls) => vehicleStatusPill.classList.remove(cls));
    if (className) vehicleStatusPill.classList.add(className);
    vehicleStatusPill.textContent = label;
}

function deriveVehicleStatus(speed, ignition) {
    const v = Number.isFinite(speed) ? speed : null;
    const ig = Number.isFinite(ignition) ? ignition : null;
    if (Number.isFinite(v) && v > 5) {
        return { label: 'In marcia', className: 'success' };
    }
    if ((v === null || v <= 5) && ig === 0) {
        return { label: 'Fermo', className: 'danger' };
    }
    if ((v === null || v <= 5) && ig === 1) {
        return { label: 'Fermo (quadro acceso)', className: 'warning' };
    }
    if (Number.isFinite(v) && v > 0) {
        return { label: 'In marcia', className: 'success' };
    }
    return { ...DEFAULT_VEHICLE_STATUS };
}

function computeVehicleStatusSnapshot(source) {
    if (!source) return { ...DEFAULT_VEHICLE_STATUS, speed: null, ignition: null };
    const data = source?.data || source;
    const io = data?.io || source?.io || {};
    const gps = data?.gps || source?.gps || {};
    const speedCandidates = [
        source?.speed,
        data?.speed,
        gps?.Speed,
        gps?.speed,
        io?.vehicleSpeed,
        io?.speed
    ];
    const ignitionCandidates = [
        source?.ignition,
        data?.ignition,
        io?.ignition,
        io?.Ignition
    ];
    let speed = null;
    for (const candidate of speedCandidates) {
        const num = toFiniteNumber(candidate);
        if (Number.isFinite(num)) {
            speed = num;
            break;
        }
    }
    let ignition = null;
    for (const candidate of ignitionCandidates) {
        const num = toFiniteNumber(candidate);
        if (Number.isFinite(num)) {
            ignition = num;
            break;
        }
    }
    return {
        ...deriveVehicleStatus(speed, ignition),
        speed,
        ignition
    };
}

function applyVehicleStatusFromCache(imei) {
    if (imei && vehicleStatusCache.has(imei)) {
        renderVehicleStatusPill(vehicleStatusCache.get(imei));
    } else {
        renderVehicleStatusPill(DEFAULT_VEHICLE_STATUS);
    }
}

class RefuelFormController {
    constructor() {
        this.formEl = document.querySelector('[data-role="refuel-form"]');
        this.eventsPanel = document.querySelector('[data-role="refuel-events-panel"]');
        this.refuelingsCache = new Map();
        if (!this.formEl || !this.eventsPanel) {
            this.enabled = false;
            return;
        }
        this.enabled = true;
        this.inputs = new Map();
        this.formEl.querySelectorAll('[data-role="refuel-input"]').forEach((input) => {
            const key = input?.dataset?.key;
            if (key) this.inputs.set(key, input);
        });
        this.dropzone = this.formEl.querySelector('[data-role="refuel-dropzone"]');
        this.dropzoneLabel = this.formEl.querySelector('[data-role="dropzone-label"]');
        this.fileInput = this.formEl.querySelector('[data-role="refuel-attachments"]');
        this.filesPreview = this.formEl.querySelector('[data-role="refuel-file-preview"]');
        this.existingFiles = this.formEl.querySelector('[data-role="refuel-existing-files"]');
        this.feedbackEl = this.formEl.querySelector('[data-role="refuel-feedback"]');
        this.submitBtn = this.formEl.querySelector('[data-action="save-refuel"]');
        this.pendingContainer = this.eventsPanel.querySelector('[data-role="refuel-events-pending"]');
        this.documentedContainer = this.eventsPanel.querySelector('[data-role="refuel-events-documented"]');
        this.eventsEmptyMessage = this.eventsPanel.querySelector('[data-role="refuel-events-empty"]');
        this.pendingFiles = [];
        this.detectedEvents = [];
        this.documentedMap = new Map();
        this.eventElements = new Map();
        this.currentRecord = null;
        this.detectedEvents = [];
        this.currentImei = null;
        this.fetchToken = null;
        this.isSubmitting = false;
        this.bindEvents();
    }

    bindEvents() {
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (ev) => {
                const files = Array.from(ev.target.files || []);
                this.addFiles(files);
                ev.target.value = '';
            });
        }

        if (this.dropzone) {
            this.dropzone.addEventListener('click', () => {
                if (this.fileInput) this.fileInput.click();
            });
            ['dragenter', 'dragover'].forEach((eventName) => {
                this.dropzone.addEventListener(eventName, (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    this.dropzone.classList.add('is-dragover');
                });
            });
            ['dragleave', 'dragend'].forEach((eventName) => {
                this.dropzone.addEventListener(eventName, (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    this.dropzone.classList.remove('is-dragover');
                });
            });
            this.dropzone.addEventListener('drop', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.dropzone.classList.remove('is-dragover');
                const files = Array.from(ev.dataTransfer?.files || []);
                this.addFiles(files);
            });
        }

        if (this.submitBtn) {
            this.submitBtn.addEventListener('click', () => this.handleSubmit());
        }
    }

    showFeedback(message = '', level = 'info') {
        if (!this.feedbackEl) return;
        this.feedbackEl.textContent = message;
        this.feedbackEl.classList.remove('error', 'success', 'info');
        if (message) this.feedbackEl.classList.add(level || 'info');
    }

    resetInputs() {
        this.inputs.forEach((input) => {
            input.value = '';
        });
    }

    clearPendingFiles() {
        this.pendingFiles = [];
        this.renderPendingFiles();
    }

    formatFileSize(bytes) {
        if (!Number.isFinite(bytes)) return '';
        if (bytes >= 1024 * 1024) return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
        if (bytes >= 1024) return `${formatNumber(bytes / 1024, 1)} KB`;
        return `${bytes} B`;
    }

    renderPendingFiles() {
        if (!this.filesPreview) return;
        this.filesPreview.innerHTML = '';
        if (!this.pendingFiles.length) {
            this.filesPreview.style.display = 'none';
            return;
        }
        this.filesPreview.style.display = 'flex';
        this.pendingFiles.forEach((file, idx) => {
            const pill = document.createElement('div');
            pill.className = 'refuel-file-pill';
            const label = document.createElement('span');
            label.textContent = `${file.name} · ${this.formatFileSize(file.size)}`;
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.innerHTML = '<i class="fa fa-times"></i>';
            removeBtn.addEventListener('click', () => this.removePendingFile(idx));
            pill.append(label, removeBtn);
            this.filesPreview.appendChild(pill);
        });
    }

    renderExistingAttachments(doc) {
        if (!this.existingFiles) return;
        this.existingFiles.innerHTML = '';
        const attachments = Array.isArray(doc?.attachments) ? doc.attachments : [];
        if (!attachments.length) {
            this.existingFiles.style.display = 'none';
            return;
        }
        this.existingFiles.style.display = 'flex';
        attachments.forEach((att) => {
            const pill = document.createElement('div');
            pill.className = 'refuel-existing-pill';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = att.name || 'Allegato';
            const sizeSpan = document.createElement('span');
            sizeSpan.className = 'muted';
            sizeSpan.textContent = this.formatFileSize(Number(att.size));
            pill.append(nameSpan, sizeSpan);
            this.existingFiles.appendChild(pill);
        });
    }

    addFiles(files = []) {
        if (!Array.isArray(files) || !files.length) return;
        const accepted = [];
        files.forEach((file) => {
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) {
                this.showFeedback(`"${file.name}" supera 8MB`, 'error');
                return;
            }
            const mime = file.type || '';
            if (!(mime.startsWith('image/') || mime === 'application/pdf')) {
                this.showFeedback(`"${file.name}" non è un file supportato`, 'error');
                return;
            }
            const duplicate = this.pendingFiles.some((existing) => existing.name === file.name && existing.size === file.size);
            if (!duplicate) accepted.push(file);
        });
        if (accepted.length) {
            this.showFeedback('');
            this.pendingFiles.push(...accepted);
            this.renderPendingFiles();
        }
    }

    removePendingFile(index) {
        if (index < 0 || index >= this.pendingFiles.length) return;
        this.pendingFiles.splice(index, 1);
        this.renderPendingFiles();
    }

    getCachedRefuelings(imei) {
        if (!imei) return [];
        const key = `${imei}`;
        const bucket = this.refuelingsCache.get(key);
        return bucket ? Array.from(bucket.values()) : [];
    }

    updateCache(imei, items = []) {
        if (!imei) return;
        const key = `${imei}`;
        const bucket = new Map(items.map((item) => [item.eventId, item]).filter(([id]) => Boolean(id)));
        this.refuelingsCache.set(key, bucket);
    }

    upsertCacheItem(imei, item) {
        if (!imei || !item?.eventId) return;
        const key = `${imei}`;
        const bucket = this.refuelingsCache.get(key) || new Map();
        bucket.set(item.eventId, item);
        this.refuelingsCache.set(key, bucket);
    }

    async loadDocumentedRefuelings(imei, { force = false } = {}) {
        if (!imei) return [];
        const key = `${imei}`;
        if (!force) {
            const cached = this.refuelingsCache.get(key);
            if (cached) {
                return Array.from(cached.values());
            }
        }
        const res = await fetch(`/dashboard/refuelings/${encodeURIComponent(key)}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text || 'Impossibile recuperare i rifornimenti.');
        }
        const json = await res.json().catch(() => ({}));
        const items = Array.isArray(json?.items) ? json.items : [];
        this.updateCache(imei, items);
        return items;
    }

    async saveRefuelingRecord(imei, payload = {}, files = []) {
        if (!imei) throw new Error('IMEI mancante');
        if (!payload?.eventId) throw new Error('eventId mancante');

        const key = `${imei}`;
        const form = new FormData();
        form.set('imei', key);
        form.set('eventId', String(payload.eventId));
        if (payload.eventStart) form.set('eventStart', payload.eventStart);
        if (payload.eventEnd) form.set('eventEnd', payload.eventEnd);
        if (payload.liters !== undefined && payload.liters !== null && payload.liters !== '') form.set('liters', payload.liters);
        if (payload.pricePerUnit !== undefined && payload.pricePerUnit !== null && payload.pricePerUnit !== '') form.set('pricePerUnit', payload.pricePerUnit);
        if (payload.tankPrimary !== undefined && payload.tankPrimary !== null && payload.tankPrimary !== '') form.set('tankPrimary', payload.tankPrimary);
        if (payload.tankSecondary !== undefined && payload.tankSecondary !== null && payload.tankSecondary !== '') form.set('tankSecondary', payload.tankSecondary);
        if (payload.station) form.set('station', payload.station);
        if (payload.invoiceRef) form.set('invoiceRef', payload.invoiceRef);
        if (payload.eventMeta) form.set('eventMeta', JSON.stringify(payload.eventMeta));
        if (payload.source) form.set('source', payload.source);

        const attachments = Array.isArray(files) ? files : [files];
        attachments.filter(Boolean).forEach((file) => {
            if (file instanceof File || (typeof Blob !== 'undefined' && file instanceof Blob)) {
                form.append('attachments', file, file.name || 'allegato');
            }
        });

        const res = await fetch('/dashboard/refuelings', {
            method: 'POST',
            body: form
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text || 'Impossibile salvare il rifornimento.');
        }
        const json = await res.json().catch(() => ({}));
        const item = json?.item;
        if (item) {
            this.upsertCacheItem(key, item);
        }
        return item;
    }

    setVehicle(vehicle) {
        if (!this.enabled) return;
        const imei = vehicle?.imei || null;
        this.currentImei = imei;
        this.currentRecord = null;
        this.eventElements.clear();
        this.resetInputs();
        this.clearPendingFiles();
        this.renderExistingAttachments(null);
        if (this.submitBtn) this.submitBtn.disabled = false;
        if (!imei) {
            if (this.eventsEmptyMessage) {
                this.eventsEmptyMessage.style.display = 'block';
                this.eventsEmptyMessage.textContent = 'Seleziona un veicolo per vedere gli eventi di rifornimento.';
            }
            if (this.pendingContainer) this.pendingContainer.innerHTML = '';
            if (this.documentedContainer) this.documentedContainer.innerHTML = '';
            return;
        }

        const cached = this.getCachedRefuelings(imei);
        this.documentedMap = new Map(cached.map((item) => [item.eventId, item]));
        this.renderEventLists();
        if (this.eventsEmptyMessage) {
            this.eventsEmptyMessage.style.display = 'block';
            this.eventsEmptyMessage.textContent = 'Carico eventi...';
        }

        const token = Symbol('refuel-fetch');
        this.fetchToken = token;
        this.loadDocumentedRefuelings(imei, { force: true }).then((items) => {
            if (this.fetchToken !== token) return;
            this.documentedMap = new Map(items.map((item) => [item.eventId, item]));
            this.renderEventLists();
        }).catch((err) => {
            if (this.fetchToken !== token) return;
            this.showFeedback(err?.message || 'Impossibile caricare i rifornimenti.', 'error');
            this.documentedMap = new Map();
            this.renderEventLists();
        });
    }

    setDetectedEvents(events = [], { vehicle } = {}) {
        if (!this.enabled) return;
        if (vehicle?.imei && this.currentImei && vehicle.imei !== this.currentImei) return;
        this.detectedEvents = Array.isArray(events) ? events.filter((evt) => evt && (normalizeEventType(evt.type) === 'refuel' || normalizeEventType(evt.normalizedType) === 'refuel')) : [];
        this.renderEventLists();
    }

    normalizeRecord(event, doc) {
        const eventId = doc?.eventId || event?.eventId;
        if (!eventId) return null;
        const startIso = doc?.eventStart || event?.start || (Number.isFinite(event?.startMs) ? new Date(event.startMs).toISOString() : null);
        const endIso = doc?.eventEnd || event?.end || (Number.isFinite(event?.endMs) ? new Date(event.endMs).toISOString() : startIso);
        const liters = doc?.liters ?? event?.liters ?? event?.delta ?? null;
        const lat = event?.lat ?? doc?.metadata?.lat ?? null;
        const lng = event?.lng ?? doc?.metadata?.lng ?? null;
        const label = event?.label || doc?.metadata?.label || 'Rifornimento';
        const pricePerUnit = doc?.pricePerUnit ?? null;
        const tankPrimary = doc?.tankPrimary ?? null;
        const tankSecondary = doc?.tankSecondary ?? null;
        const station = doc?.station ?? '';
        const invoiceRef = doc?.invoiceRef ?? '';
        const source = event?.source || doc?.metadata?.source || 'manual';
        return {
            eventId,
            event,
            doc,
            status: doc ? 'documented' : 'pending',
            startIso,
            endIso,
            liters,
            pricePerUnit,
            tankPrimary,
            tankSecondary,
            station,
            invoiceRef,
            lat,
            lng,
            label,
            source
        };
    }

    renderEventLists() {
        if (!this.enabled) return;
        const hasVehicle = Boolean(this.currentImei);
        if (this.pendingContainer) this.pendingContainer.innerHTML = '';
        if (this.documentedContainer) this.documentedContainer.innerHTML = '';
        if (this.eventsEmptyMessage) {
            this.eventsEmptyMessage.style.display = hasVehicle ? 'none' : 'block';
            if (!hasVehicle) this.eventsEmptyMessage.textContent = 'Seleziona un veicolo per vedere gli eventi di rifornimento.';
        }
        if (!hasVehicle) return;

        const docMap = this.documentedMap instanceof Map ? this.documentedMap : new Map();
        const seenDocIds = new Set();
        const pendingRecords = [];
        const documentedRecords = [];

        this.detectedEvents.forEach((evt) => {
            const doc = docMap.get(evt?.eventId);
            const record = this.normalizeRecord(evt, doc);
            if (!record) return;
            if (doc) {
                documentedRecords.push(record);
                seenDocIds.add(doc.eventId);
            } else {
                pendingRecords.push(record);
            }
        });

        docMap.forEach((doc, docId) => {
            if (seenDocIds.has(docId)) return;
            const record = this.normalizeRecord(null, doc);
            if (record) documentedRecords.push(record);
        });

        this.renderEventSection(this.pendingContainer, pendingRecords, 'pending');
        this.renderEventSection(this.documentedContainer, documentedRecords, 'documented');

        const total = pendingRecords.length + documentedRecords.length;
        if (this.eventsEmptyMessage) {
            this.eventsEmptyMessage.style.display = total ? 'none' : 'block';
            if (!total) this.eventsEmptyMessage.textContent = 'Nessun rifornimento rilevato nel periodo selezionato.';
        }
    }

    renderEventSection(container, records, status) {
        if (!container) return;
        container.innerHTML = '';
        if (!records?.length) {
            const empty = document.createElement('p');
            empty.className = 'muted tiny';
            empty.textContent = status === 'pending' ? 'Nessun evento da documentare.' : 'Nessun rifornimento documentato.';
            container.appendChild(empty);
            return;
        }
        records.sort((a, b) => new Date(b.startIso || 0) - new Date(a.startIso || 0));
        records.forEach((record) => {
            const element = this.createEventElement(record);
            if (!element) return;
            container.appendChild(element);
            this.eventElements.set(record.eventId, element);
        });
    }

    createEventElement(record) {
        if (!record?.eventId) return null;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'refuel-event';
        btn.dataset.eventId = record.eventId;
        btn.dataset.status = record.status;
        const dateText = record.startIso ? formatDateTime(record.startIso) : 'Data sconosciuta';
        const litersText = Number.isFinite(Number(record.liters))
            ? `${formatNumber(record.liters, 1)} L`
            : 'Litri n/d';
        const statusLabel = record.status === 'documented' ? 'Documentato' : 'Da documentare';
        btn.innerHTML = `
            <div class="refuel-event__main">
                <div class="refuel-event__header">
                    <span class="refuel-event__title">${dateText}</span>
                    <span class="refuel-chip refuel-chip--${record.status}">${statusLabel}</span>
                </div>
                <div class="refuel-event__meta">
                    <span>${litersText}</span>
                    ${record.pricePerUnit ? `<span>${formatNumber(record.pricePerUnit, 2)} €/L</span>` : ''}
                </div>
            </div>
        `;
        if (this.currentRecord?.eventId === record.eventId) {
            btn.classList.add('active');
        }
        btn.addEventListener('click', () => this.selectRecord(record, btn));
        return btn;
    }

    selectRecord(record, element) {
        if (!record?.eventId) return;
        this.currentRecord = record;
        this.updateActiveEvent(element);
        this.autofill(record);
        this.renderExistingAttachments(record.doc);
        this.clearPendingFiles();
        this.showFeedback('');
    }

    updateActiveEvent(element) {
        this.eventElements.forEach((el) => el.classList.remove('active'));
        if (element) element.classList.add('active');
    }

    autofill(record) {
        if (!record) return;
        const doc = record.doc;
        const baseLiters = doc?.liters ?? record.liters;
        const litersInput = this.inputs.get('liters');
        if (litersInput) litersInput.value = Number.isFinite(Number(baseLiters)) ? Number(baseLiters).toString() : '';

        const priceInput = this.inputs.get('pricePerUnit');
        if (priceInput) priceInput.value = doc?.pricePerUnit ?? '';

        const tankPrimaryInput = this.inputs.get('tankPrimary');
        if (tankPrimaryInput) tankPrimaryInput.value = doc?.tankPrimary ?? '';

        const tankSecondaryInput = this.inputs.get('tankSecondary');
        if (tankSecondaryInput) tankSecondaryInput.value = doc?.tankSecondary ?? '';

        const stationInput = this.inputs.get('station');
        if (stationInput) stationInput.value = doc?.station ?? '';

        const invoiceInput = this.inputs.get('invoiceRef');
        if (invoiceInput) invoiceInput.value = doc?.invoiceRef ?? '';
    }

    readFormValues() {
        const values = {};
        this.inputs.forEach((input, key) => {
            values[key] = (input.value || '').trim();
        });
        return values;
    }

    buildPayload(record, values) {
        return {
            eventId: record.eventId,
            eventStart: record.startIso,
            eventEnd: record.endIso || record.startIso,
            liters: values.liters,
            pricePerUnit: values.pricePerUnit,
            tankPrimary: values.tankPrimary,
            tankSecondary: values.tankSecondary,
            station: values.station,
            invoiceRef: values.invoiceRef,
            eventMeta: {
                lat: record.lat,
                lng: record.lng,
                label: record.label,
                detected: record.event ? {
                    start: record.event.start ?? record.startIso,
                    end: record.event.end ?? record.endIso,
                    liters: record.event.liters ?? record.event.delta ?? null
                } : null
            },
            source: record.source || 'manual'
        };
    }

    async handleSubmit() {
        if (!this.enabled || this.isSubmitting) return;
        if (!this.currentImei) {
            this.showFeedback('Seleziona prima un veicolo.', 'error');
            return;
        }
        if (!this.currentRecord?.eventId) {
            this.showFeedback('Seleziona un evento di rifornimento.', 'error');
            return;
        }

        const values = this.readFormValues();
        const litersNum = Number(values.liters);
        if (!values.liters || !Number.isFinite(litersNum) || litersNum <= 0) {
            this.showFeedback('Specifica i litri riforniti.', 'error');
            return;
        }
        const priceNum = values.pricePerUnit ? Number(values.pricePerUnit) : null;
        if (values.pricePerUnit && (!Number.isFinite(priceNum) || priceNum < 0)) {
            this.showFeedback('Il prezzo al litro non è valido.', 'error');
            return;
        }
        const tankPrimaryNum = values.tankPrimary ? Number(values.tankPrimary) : null;
        if (values.tankPrimary && (!Number.isFinite(tankPrimaryNum) || tankPrimaryNum < 0)) {
            this.showFeedback('Il valore del serbatoio 1 non è valido.', 'error');
            return;
        }
        const tankSecondaryNum = values.tankSecondary ? Number(values.tankSecondary) : null;
        if (values.tankSecondary && (!Number.isFinite(tankSecondaryNum) || tankSecondaryNum < 0)) {
            this.showFeedback('Il valore del serbatoio 2 non è valido.', 'error');
            return;
        }

        values.liters = litersNum.toFixed(2);
        if (priceNum !== null) values.pricePerUnit = priceNum.toFixed(3);
        if (tankPrimaryNum !== null) values.tankPrimary = tankPrimaryNum.toString();
        if (tankSecondaryNum !== null) values.tankSecondary = tankSecondaryNum.toString();

        const payload = this.buildPayload(this.currentRecord, values);
        if (!payload.eventStart) {
            this.showFeedback('Timestamp evento non disponibile.', 'error');
            return;
        }

        this.isSubmitting = true;
        if (this.submitBtn) this.submitBtn.disabled = true;
        this.showFeedback('Salvataggio in corso...', 'info');

        try {
            const item = await this.saveRefuelingRecord(this.currentImei, payload, this.pendingFiles);
            if (item) {
                this.documentedMap.set(item.eventId, item);
                const updatedRecord = this.normalizeRecord(this.currentRecord.event, item);
                if (updatedRecord) {
                    this.currentRecord = updatedRecord;
                    this.autofill(updatedRecord);
                    this.renderExistingAttachments(item);
                }
                this.renderEventLists();
                const activeEl = this.eventElements.get(item.eventId);
                if (activeEl) activeEl.classList.add('active');
            }
            this.clearPendingFiles();
            this.showFeedback('Rifornimento registrato.', 'success');
        } catch (err) {
            this.showFeedback(err?.message || 'Errore durante il salvataggio.', 'error');
        } finally {
            this.isSubmitting = false;
            if (this.submitBtn) this.submitBtn.disabled = false;
        }
    }
}

const refuelForm = new RefuelFormController();

const updateVehicleStats = (history = [], { events = [] } = {}) => {
    const latest = Array.isArray(history) && history.length ? history[history.length - 1] : null;
    const latestIo = latest?.io || {};
    const latestGps = latest?.gps || {};
    const vehicleInfo = window.currentVehicle || {};

    const pickNumber = (...values) => {
        for (const value of values) {
            const num = Number(value);
            if (Number.isFinite(num)) return num;
        }
        return null;
    };

    const setText = (selector, text) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = text;
    };

    const formatKmValue = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return null;
        const km = Math.abs(num) >= 1000 ? num / 1000 : num;
        const digits = Math.abs(km) >= 100 ? 0 : (Math.abs(km) >= 10 ? 1 : 2);
        return `${formatNumber(km, digits)} km`;
    };

    const odometerRaw = pickNumber(
        latestIo.totalOdometer,
        latestIo.odometer,
        latestGps.Odometer,
        latestGps.odometer,
        vehicleInfo.totalOdometer
    );
    setText('[data-info="odometer"]', formatKmValue(odometerRaw) || 'N/D');

    const tripRaw = pickNumber(
        latestIo.tripOdometer,
        latestIo.trip_odometer,
        latest?.tripOdometer
    );
    setText('[data-info="trip_odometer"]', formatKmValue(tripRaw) || 'N/D');

    const fuelSnapshot = extractFuelSnapshot(latestIo);
    const tankPerc = Number.isFinite(fuelSnapshot.percent) ? fuelSnapshot.percent : null;
    const tankLiters = Number.isFinite(fuelSnapshot.liters) ? fuelSnapshot.liters : null;
    const tankParts = [];
    if (Number.isFinite(tankPerc)) tankParts.push(`${formatNumber(tankPerc * 100, 1)}%`);
    if (Number.isFinite(tankLiters)) tankParts.push(`${formatNumber(tankLiters, 1)} L`);
    setText('[data-info="tank"]', tankParts.length ? tankParts.join(' · ') : 'N/D');

    const engineCandidates = [];
    Object.entries(latestIo).forEach(([key, value]) => {
        if (/engine/i.test(key) && /hour/i.test(key)) {
            const num = Number(value);
            if (Number.isFinite(num)) engineCandidates.push(num);
        }
    });
    [vehicleInfo.engineHours, vehicleInfo.engine_hours, vehicleInfo.totalEngineHours].forEach((value) => {
        const num = Number(value);
        if (Number.isFinite(num)) engineCandidates.push(num);
    });
    let engineHours = engineCandidates.length ? engineCandidates[0] : null;
    if (Number.isFinite(engineHours)) {
        if (engineHours > 1e5) engineHours = engineHours / 3600;
        else if (engineHours > 1e3) engineHours = engineHours / 60;
    }
    setText('[data-info="engine_hours"]', Number.isFinite(engineHours) ? `${formatNumber(engineHours, 1)} h` : 'N/D');

    const criticalCount = Array.isArray(events)
        ? events.filter(evt => evt && evt.type === 'fuel_withdrawal').length
        : 0;
    const criticalText = Number.isFinite(criticalCount)
        ? `${criticalCount} ${criticalCount === 1 ? 'evento' : 'eventi'}`
        : 'N/D';
    setText('[data-info="critical_alerts"]', criticalText);
};

const formatDateTime = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleString('it-IT', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatDuration = (ms = 0) => {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    return `${minutes}m`;
};

const EVENT_FILTER_INPUT_SELECTOR = 'input[data-role="event-filter"]';
window._eventFilterState = window._eventFilterState instanceof Map ? window._eventFilterState : new Map();
window._eventMarkerRegistry = window._eventMarkerRegistry instanceof Map ? window._eventMarkerRegistry : new Map();
window._eventSidebarRegistry = window._eventSidebarRegistry instanceof Map ? window._eventSidebarRegistry : new Map();
window._eventSearchQuery = typeof window._eventSearchQuery === 'string' ? window._eventSearchQuery : '';
let eventSearchInput = null;

const DRIVER_EVENT_TYPES = Object.freeze({
    LOGIN: 'driver_login',
    PAUSE: 'pause',
    REST: 'rest'
});

const clearExistingEventMarkers = () => {
    if (!(window._eventMarkerRegistry instanceof Map)) return;
    window._eventMarkerRegistry.forEach((entry) => {
        try {
            entry?.marker?.remove();
        } catch { }
    });
};

const collectDriverIdsFromMeta = (driverMeta) => {
    if (!(driverMeta instanceof Map)) return [];
    const ids = [];
    driverMeta.forEach((_, id) => {
        const normalized = id == null ? '' : String(id).trim();
        if (normalized) ids.push(normalized);
    });
    return ids;
};

const deriveDriverEventType = (evt = {}) => {
    const toState = String(evt?.to_state_name ?? evt?.toState ?? evt?.state ?? '').trim().toLowerCase();
    const flags = Array.isArray(evt?.eventflags)
        ? evt.eventflags.map((flag) => String(flag).trim().toLowerCase())
        : [];
    if (toState === 'resting' || toState === 'rest' || toState === 'unlogged' || flags.includes('rest_start')) {
        return DRIVER_EVENT_TYPES.REST;
    }
    if (toState === 'working' || flags.includes('work_start') || flags.includes('break_start')) {
        return DRIVER_EVENT_TYPES.PAUSE;
    }
    if (toState === 'driving' || flags.includes('drive_start') || flags.includes('login') || flags.includes('card_inserted')) {
        return DRIVER_EVENT_TYPES.LOGIN;
    }
    return null;
};

const normalizeDriverEventRecord = (evt = {}, meta = {}) => {
    const start = parseTimestamp(evt?.timestamp ?? evt?.start ?? evt?.ts);
    if (!Number.isFinite(start)) return null;
    const type = deriveDriverEventType(evt);
    if (!type) return null;
    const driverId = meta.driverId || evt?.driverId || evt?.driver_id;
    if (!driverId) return null;
    const durationMs = toFiniteNumber(evt?.durationMs ?? evt?.duration ?? (Number.isFinite(evt?.elapsed) ? evt.elapsed * 1000 : null));
    const lat = toFiniteNumber(evt?.lat ?? evt?.latitude);
    const lng = toFiniteNumber(evt?.lng ?? evt?.longitude);
    const driverLabel = meta.driverLabel || evt?.driverLabel || evt?.driverName || driverId;
    const formattedLabel = formatDriverLabel(driverLabel);
    const eventId = evt?.eventId || evt?._id || `drv-${driverId}-${start}`;
    return {
        eventId: String(eventId),
        type,
        normalizedType: type,
        driverId: String(driverId),
        driverLabel,
        detailLabel: formattedLabel || driverLabel,
        detailTitle: driverLabel,
        start,
        end: Number.isFinite(durationMs) ? start + durationMs : start,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        source: 'driver',
        label: formattedLabel || driverLabel
    };
};

async function fetchDriverEventsForRange(driverIds, { imei, fromMs, toMs, driverMeta } = {}) {
    const ids = Array.isArray(driverIds) ? driverIds.filter(Boolean) : [];
    if (!ids.length || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
        return [];
    }
    const requests = ids.map((driverId) => window._post('/dashboard/drivers/history', {
        imei,
        from: fromMs,
        to: toMs,
        d: driverId
    }).catch((err) => {
        console.error(`[bottom] unable to fetch driver events for ${driverId}`, err);
        return [];
    }));
    const responses = await Promise.all(requests);
    const payload = [];
    responses.forEach((list, idx) => {
        if (!Array.isArray(list)) return;
        const driverId = ids[idx];
        const driverLabel = driverMeta?.get(driverId)?.label || driverId;
        list.forEach((raw) => {
            const normalized = normalizeDriverEventRecord(raw, { driverId, driverLabel });
            if (normalized) {
                payload.push(normalized);
            }
        });
    });
    return payload.sort((a, b) => a.start - b.start);
}

const normalizeEventType = (type) => typeof type === 'string' ? type.trim().toLowerCase() : '';

const escapeAttr = (value) => String(value ?? '').replace(/"/g, '&quot;');
const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const shortenIdentifier = (value, { prefix = 4, suffix = 3 } = {}) => {
    if (typeof value !== 'string') return value;
    if (value.length <= prefix + suffix + 1) return value;
    return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
};

const formatDriverLabel = (value) => {
    const label = (value ?? '').toString().trim();
    if (!label) return '';
    if (/^I\d{6,}$/.test(label)) {
        return shortenIdentifier(label, { prefix: 6, suffix: 4 });
    }
    if (label.length > 18) {
        return shortenIdentifier(label, { prefix: 8, suffix: 4 });
    }
    return label;
};

const getMarkerDom = (eventId) => {
    if (!eventId) return null;
    try {
        return document.querySelector(`[data-map-event="${eventId}"]`);
    } catch {
        return null;
    }
};

const applyEventFilters = () => {
    const container = document.querySelector('[data-role="event-sidebar-list"]');
    if (!container) return;

    const rows = container.querySelectorAll('[data-event-id]');
    const emptyPlaceholder = container.querySelector('[data-role="event-empty"]');
    const query = (eventSearchInput?.value || window._eventSearchQuery || '').trim().toLowerCase();
    const filterState = window._eventFilterState instanceof Map ? window._eventFilterState : null;
    let visibleCount = 0;

    rows.forEach((row) => {
        const { eventId, eventType, searchText = '' } = row.dataset;
        const typeKey = normalizeEventType(eventType);
        const typeAllowed = !filterState || !typeKey || !filterState.has(typeKey) || Boolean(filterState.get(typeKey));
        const matchesQuery = !query || searchText.includes(query);
        const visible = typeAllowed && matchesQuery;

        row.style.display = visible ? '' : 'none';
        if (!visible && row.classList.contains('active')) {
            row.classList.remove('active');
        }
        if (visible) visibleCount++;

        const markerEl = getMarkerDom(eventId);
        if (markerEl) {
            markerEl.style.display = visible ? '' : 'none';
            markerEl.dataset.eventHidden = visible ? 'false' : 'true';
        }

        const registryEntry = window._eventMarkerRegistry.get(eventId);
        const registryEl = registryEntry?.marker?._element;
        if (registryEl && registryEl !== markerEl) {
            registryEl.style.display = visible ? '' : 'none';
            registryEl.dataset.eventHidden = visible ? 'false' : 'true';
        }
    });

    if (emptyPlaceholder) {
        emptyPlaceholder.style.display = visibleCount ? 'none' : '';
    }
};

const registerEventFilterInputs = () => {
    const inputs = document.querySelectorAll(EVENT_FILTER_INPUT_SELECTOR);
    inputs.forEach((input) => {
        const type = normalizeEventType(input.dataset.eventType);
        if (!type) return;
        const state = window._eventFilterState;
        if (state instanceof Map && !state.has(type)) state.set(type, input.checked);
        if (input._eventFilterBound) return;
        input.addEventListener('change', (ev) => {
            const currentState = window._eventFilterState;
            if (currentState instanceof Map) currentState.set(type, input.checked);
            window._eventSearchQuery = (eventSearchInput?.value || '').trim().toLowerCase();
            applyEventFilters();
            if (RM && typeof RM.filterEvents === 'function') {
                RM.filterEvents(ev);
            }
        });
        input._eventFilterBound = true;
    });
};

const EVENT_META = {
    rest: {
        name: 'Riposo',
        icon: { type: 'fa', value: 'fa fa-bed' },
        scrubClass: 'warning',
        separatorClass: 'bg-brand'
    },
    pause: {
        name: 'Pausa',
        icon: { type: 'fa', value: 'fa fa-coffee' },
        scrubClass: 'info',
        separatorClass: 'bg-brand'
    },
    refuel: {
        name: 'Rifornimento',
        icon: { type: 'img', value: '/assets/images/icons/gaspump_white.svg' },
        scrubClass: 'success',
        separatorClass: 'bg-brand'
    },
    fuel_withdrawal: {
        name: 'Prelievo',
        icon: { type: 'fa', value: 'fa fa-exclamation-triangle' },
        scrubClass: 'danger',
        separatorClass: 'bg-danger'
    },
    driver_change: {
        name: 'Cambio conducente',
        icon: { type: 'fa', value: 'fa fa-user' },
        scrubClass: 'info',
        separatorClass: 'bg-brand'
    },
    [DRIVER_EVENT_TYPES.LOGIN]: {
        name: 'Login',
        icon: { type: 'fa', value: 'fa fa-id-card' },
        scrubClass: 'info',
        separatorClass: 'bg-brand'
    },
    default: {
        name: 'Evento',
        icon: { type: 'fa', value: 'fa fa-info-circle' },
        scrubClass: 'info',
        separatorClass: 'bg-brand'
    }
};
EVENT_META.rifornimento = EVENT_META.refuel;

const renderEventSidebar = (events = []) => {
    const container = document.querySelector('[data-role="event-sidebar-list"]');
    if (!container) return;
    container._eventsMeta = events;
    clearExistingEventMarkers();
    window._eventMarkerRegistry = new Map();
    window._eventSidebarRegistry = new Map();

    const markerRegistry = window._eventMarkerRegistry;
    const sidebarRegistry = window._eventSidebarRegistry;

    if (!Array.isArray(events) || !events.length) {
        container.innerHTML = `<p class="muted" data-role="event-empty">Nessun evento nel periodo selezionato.</p>`;
        applyEventFilters();
        return;
    }

    const makeEventId = (evt, idx) => {
        if (evt?.eventId) return String(evt.eventId);
        if (evt && typeof evt._domId === 'string') return evt._domId;
        const baseType = normalizeEventType(evt?.type) || 'event';
        const tsCandidates = [evt?.startTs, evt?.start, evt?.at, evt?.timestamp, evt?.end];
        let ts = tsCandidates
            .map(value => {
                const num = Number(value);
                return Number.isFinite(num) ? num : Date.parse(value);
            })
            .find(Number.isFinite);
        if (!Number.isFinite(ts)) ts = Date.now();
        const id = `evt-${baseType}-${ts}-${idx}`;
        if (evt && typeof evt === 'object') evt._domId = id;
        return id;
    };

    const toLocaleStringSafe = (value) => {
        if (!value && value !== 0) return '';
        const date = value instanceof Date ? value : new Date(value);
        if (!Number.isFinite(date.getTime())) return '';
        return date.toLocaleString().replace(',', '');
    };

    const html = events.map((evt, i) => {
        const typeKey = normalizeEventType(evt?.type) || 'default';
        const meta = evt?.meta || EVENT_META[typeKey] || EVENT_META.default;
        const icon = meta.icon || {};
        const iconMarkup = icon.type === 'img'
            ? `<img src="${icon.value}" alt="${meta.name || evt?.type || 'Evento'}" style="max-width:14px; height:auto; object-fit: contain;">`
            : `<i class="${icon.value || 'fa fa-info-circle'}"></i>`;

        const eventId = makeEventId(evt, i);
        const sepClass = meta.separatorClass || 'bg-brand';

        const infoSegments = [
            `<div class="separator-h ${sepClass}"></div>`,
            `<p>${meta.name || evt?.type || 'Evento'}</p>`
        ];
        if (evt?.detailLabel) {
            const titleAttr = evt?.detailTitle ? ` title="${escapeAttr(evt.detailTitle)}"` : '';
            infoSegments.push(`<div class="separator-h ${sepClass}"></div>`);
            infoSegments.push(`<p${titleAttr}>${escapeHtml(evt.detailLabel)}</p>`);
        }
        infoSegments.push(`<div class="separator-h ${sepClass}"></div>`);
        const infoHtml = infoSegments.join('');

        const startText = toLocaleStringSafe(evt?.start);
        const endText = toLocaleStringSafe(evt?.end);
        const timeSegments = [`<p>${startText}</p>`];
        if (endText && endText !== startText) {
            timeSegments.push('<i class="fa fa-caret-right"></i>');
            timeSegments.push(`<p>${endText}</p>`);
        }
        const timeHtml = timeSegments.join('');

        const searchTokens = [
            meta.name,
            evt?.detailLabel,
            evt?.detailTitle,
            evt?.driverLabel,
            startText,
            endText,
            evt?.label,
            typeKey
        ].filter(Boolean);
        const searchText = searchTokens.join(' ').toLowerCase();
        evt.searchText = searchText;
        evt._searchText = searchText;

        const lat = Number(evt?.lat);
        const lng = Number(evt?.lng);
        let marker = null;
        if (Number.isFinite(lat) && Number.isFinite(lng) && RM?.map?.addOrUpdateMarker) {
            marker = RM.map.addOrUpdateMarker({
                id: eventId,
                lng,
                lat,
                tooltip: `<div class="wrapper-h blurred"></div>`,
                vehicle: window.currentVehicle,
                device: { gps: { Latitude: lat, Longitude: lng } },
                status: 'active',
                html: `<div class="wrapper-h nopadding j-center a-center">${iconMarkup}</div>`,
                hasPopup: false,
                classlist: `event-marker blurred`
            });
            if (marker?._element) {
                marker._element.dataset.event = evt.type || '';
                marker._element.dataset.eventType = typeKey;
                marker._element.dataset.evtid = eventId;
                marker._element.dataset.mapEvent = eventId;
                marker._element.dataset.eventHidden = 'false';
            }
        }

        markerRegistry.set(eventId, { marker, type: typeKey });
        sidebarRegistry.set(eventId, { type: typeKey, searchText, originalIdx: evt?.originalIdx ?? i });

        return `
            <div class="wrapper-h j-start event cg-1618" data-event-idx="${evt?.originalIdx || i}" data-event-type="${typeKey}" data-event-id="${eventId}" data-search-text="${escapeAttr(searchText)}">
                <div class="wrapper-h j-start nopadding w-min-content no_wrap cg-1618 ev-cell">
                    ${iconMarkup}
                    ${infoHtml}
                </div>
                <div class="wrapper-h j-end a-center nopadding cg-1618 ev-cell">
                    ${timeHtml}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `${html}<p class="muted" data-role="event-empty" style="display:none;">Nessun evento corrispondente.</p>`;

    applyEventFilters();

    if (!container._boundClick) {
        container.addEventListener('click', (ev) => {
            const item = ev.target.closest('[data-event-idx]');


            if (!item) return;
            const eventId = item.dataset.eventId;
            const sidebarMeta = window._eventSidebarRegistry?.get(eventId);
            const originalIdx = Number(sidebarMeta?.originalIdx ?? item.dataset.eventIdx);
            const fullList = window._eventTimelineAll || [];
            const eventData = Number.isFinite(originalIdx) ? fullList[originalIdx] : null;

            if (!eventData) return;

            container.querySelectorAll('.event.active').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            handleSidebarSelection(eventData);
        });
        container._boundClick = true;
    }
};

const ensureEventSearchBinding = () => {
    const input = document.querySelector('[data-role="event-search"]');
    if (!input || input._eventsBound) return;
    eventSearchInput = input;
    const handleSearch = (ev) => {
        window._eventSearchQuery = input.value.trim().toLowerCase();
        applyEventFilters();
        if (ev && RM) {
            RM.filterEvents(ev);

        }
        else if (RM && typeof RM.filterEvents === 'function') {
            RM.filterEvents();
        }
    };
    input.addEventListener('input', handleSearch);
    handleSearch();
    input._eventsBound = true;
};

const handleSidebarSelection = (eventData) => {
    if (!eventData) return;
    if (rmItems?.[1]) rmItems[1].click?.();
    focusRestEvent(eventData);
};

const focusRefuelEvent = (evt) => {
    const targetTs = Number(evt.startTs ?? evt.start);
    const refuels = Array.isArray(RM?.fuelEvents) ? RM.fuelEvents : [];
    let matchIdx = -1;
    if (Number.isFinite(targetTs)) {
        matchIdx = refuels.findIndex(re => {
            const compareTs = Number(re.startTs ?? re.start ?? re.at ?? re.timestamp);
            return Number.isFinite(compareTs) && Math.abs(compareTs - targetTs) <= 10 * 60 * 1000;
        });
    }
    if (matchIdx >= 0 && typeof RM?.focusEvent === 'function') {
        RM.focusEvent(matchIdx, { zoom: 14 });
        return;
    }
    const mapInstance = RM?.map?.map;
    if (!mapInstance || !Number.isFinite(evt.lng) || !Number.isFinite(evt.lat)) return;
    if (typeof mapInstance.flyTo === 'function') {
        mapInstance.flyTo({ center: [evt.lng, evt.lat], zoom: 18, essential: true });
    } else if (typeof mapInstance.jumpTo === 'function') {
        mapInstance.jumpTo({ center: [evt.lng, evt.lat], zoom: 18 });
    } else if (typeof mapInstance.setCenter === 'function') {
        mapInstance.setCenter([evt.lng, evt.lat]);
        if (typeof mapInstance.setZoom === 'function') mapInstance.setZoom(18);
    }
};

const focusRestEvent = (evt) => {
    const mapInstance = RM?.map?.map;
    if (!mapInstance || !Number.isFinite(evt.lng) || !Number.isFinite(evt.lat)) return;
    if (typeof mapInstance.flyTo === 'function') {
        mapInstance.flyTo({ center: [evt.lng, evt.lat], zoom: 14, essential: true });
    } else if (typeof mapInstance.jumpTo === 'function') {
        mapInstance.jumpTo({ center: [evt.lng, evt.lat], zoom: 14 });
    } else if (typeof mapInstance.setCenter === 'function') {
        mapInstance.setCenter([evt.lng, evt.lat]);
        if (typeof mapInstance.setZoom === 'function') mapInstance.setZoom(14);
    }
};

const renderMenu = document.querySelector('#renderMenu');
var rmItems = renderMenu.querySelectorAll('.sidebar-item')
rmItems.forEach((rmi) => {
    rmi.addEventListener('click', cycleVTabs)
})


function cycleVTabs(ev) {
    var idx = [...rmItems].indexOf(ev.currentTarget);
    window.activeBottomTab = idx;
    const vertSection = document.querySelector('#bottom_section')



    var scroll = `translateY(-${idx * (100 / rmItems.length)}%)`
    document.querySelector('#renderScroller').style.transform = scroll;


    [...rmItems].filter(element => element != ev.currentTarget).forEach(o => o.classList.remove('active'));
    ev.currentTarget.classList.add('active')
    // setTimeout(() => {
    //     if (idx == 1) {
    //         vertSection.style.maxHeight = "calc(100% - 74px)";
    //     }
    //     else {
    //         vertSection.style.maxHeight = "61.8%"
    //     }
    // }, 1000)

}

// [...rmItems][1].click();






const infoSelectors = [...document.querySelectorAll('.info-sel')]
infoSelectors.map((s) => {
    s.addEventListener('mouseover', openSelector)
    s.addEventListener('click', toggleSelector)
})

infoSelectors.forEach((_selector) => {
    var _x = [..._selector.querySelectorAll('.menu-item')].map((x) => {
        x.addEventListener('click', flagStat);
    })
})

const refuelOverlayHost = document.querySelector('[data-role="refuel-overlay-host"]');
const refuelOverlay = document.querySelector('#refueling_log_overlay');
const refuelSlider = refuelOverlay?.querySelector('[data-role="refuel-slider"]');
const refuelClose = refuelOverlay?.querySelector('[data-action="close-refuel-overlay"]');
let activeRefuelPanel = 'form';

const refuelMenuItems = [...document.querySelectorAll('.menu-item[data-action^="refuel-"]')];
refuelMenuItems.forEach((item) => {
    item.addEventListener('click', (ev) => {
        const action = ev.currentTarget.dataset.action;
        switch (action) {
            case 'refuel-register':
                toggleRefuelOverlay('form');
                break;
            case 'refuel-database':
                toggleRefuelOverlay('database');
                break;
            case 'refuel-report':
                hideRefuelOverlay();
                break;
            default:
                break;
        }
        hideNavMenu(ev.currentTarget.closest('.overlay.nav-menu'));
    });
});

if (refuelClose) {
    refuelClose.addEventListener('click', () => hideRefuelOverlay());
}

if (refuelOverlayHost) {
    refuelOverlayHost.addEventListener('click', (ev) => {
        if (ev.target === refuelOverlayHost) {
            hideRefuelOverlay();
        }
    });
}

function setRefuelPanel(panel) {
    if (!refuelSlider) return;
    activeRefuelPanel = panel;
    const offset = panel === 'database' ? '-50%' : '0';
    refuelSlider.style.transform = `translateX(${offset})`;
}

function showRefuelOverlay(panel = 'form') {
    if (!refuelOverlay) return;
    if (panel) setRefuelPanel(panel);
    refuelOverlay.classList.remove('outofview');
    refuelOverlayHost?.classList.remove('dead');
}

function hideRefuelOverlay() {
    if (!refuelOverlay) return;
    refuelOverlay.classList.add('outofview');
    refuelOverlayHost?.classList.add('dead');
}

function toggleRefuelOverlay(panel = 'form') {
    if (!refuelOverlay) return;
    const isHidden = refuelOverlay.classList.contains('outofview');
    const isSamePanel = panel === activeRefuelPanel;
    if (isHidden || !isSamePanel) {
        showRefuelOverlay(panel);
    } else {
        hideRefuelOverlay();
    }
}

const refuelTableColumns = [
    { name: 'Date Start', key: 'startDate', editable: true },
    { name: 'Date End', key: 'endDate', editable: true },
    { name: 'Liters', key: 'liters', editable: true },
    { name: 'Driver ID', key: 'driverId', editable: true },
    { name: 'Coordinates', key: 'coordinates', editable: true },
    { name: 'Location', key: 'location', editable: true },
];

const refuelTable = new Table('#refueling_database', refuelTableColumns, {
    defaultActionRenderer: ({ rowId }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.classList.add('btn', 'ghost', 'tiny');
        button.dataset.role = 'preview-refuel-document';
        button.dataset.rowId = rowId;
        button.setAttribute('aria-label', 'Mostra documento');
        button.title = 'Mostra documento';
        button.innerHTML = '<i class="fa fa-file-text-o"></i>';
        return button;
    }
});

window.refuelTable = refuelTable;
TrucklyMap.enableTableSorting('#refueling_database');

registerEventFilterInputs();
applyEventFilters();
if (RM && typeof RM.filterEvents === 'function') {
    RM.filterEvents();
}


function hideNavMenu(menuElement) {
    if (!menuElement) return;
    menuElement.classList.remove('open');
    const owner = menuElement.closest('.info-sel');
    if (owner) {
        owner.removeEventListener('mouseleave', closeSelector);
        owner.addEventListener('mouseover', openSelector);
    }
}

function flagStat(ev) {
    var checkbox = ev.currentTarget.querySelector('input[type="checkbox"]');
    if (checkbox && ev.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hideNavMenu(ev.currentTarget.closest('.overlay.nav-menu'));
}



function openSelector(ev) {
    if (window.activeBottomTab == 1) return;
    var menu = ev.currentTarget.querySelector('.overlay.nav-menu.v')
    menu.classList.add('open');
    ev.currentTarget.removeEventListener('mouseover', openSelector);
    ev.currentTarget.addEventListener('mouseleave', closeSelector);
}

function closeSelector(ev) {
    var menu = ev.currentTarget.querySelector('.overlay.nav-menu.v')
    menu.classList.remove('open');
    ev.currentTarget.removeEventListener('mouseleave', closeSelector);
    ev.currentTarget.addEventListener('mouseover', openSelector);
}

function toggleSelector(ev) {
    if (ev.target.closest('.menu-item')) return;
    var menu = ev.currentTarget.querySelector('.overlay.nav-menu.v')
    menu.classList.toggle('open');
}


initFrameBridge();

function initFrameBridge() {
    if (!mapFrameElement) return;
    const attemptBind = () => {
        const targetWindow = mapFrameElement.contentWindow;
        if (!targetWindow) return;
        bindFrameEvents(targetWindow);
        bootstrapVehiclesFromFrame(Boolean(targetWindow.__vrecBroadcasted));
    };

    mapFrameElement.addEventListener('load', () => {
        hasHandledVehicleSnapshot = false;
        attemptBind();
    });

    attemptBind();
}

function bindFrameEvents(targetWindow) {
    if (!targetWindow) return;
    if (frame) {
        frame.removeEventListener('vrec', handleVrec);
        frame.removeEventListener('vchange', handleVchange);
        frame.removeEventListener('deviceEvent', handleDeviceEvent);
    }
    frame = targetWindow;
    frame.addEventListener('vrec', handleVrec);
    frame.addEventListener('vchange', handleVchange);
    frame.addEventListener('deviceEvent', handleDeviceEvent);
}

function bootstrapVehiclesFromFrame(forceBootstrap = false) {
    if (hasHandledVehicleSnapshot || !frame) return;
    if (!forceBootstrap && !frame.__vrecBroadcasted) return;
    const vehicles = frame?.vehicles;
    if (Array.isArray(vehicles) && vehicles.length) {
        handleVrec({ detail: { vehicles } });
    }
}

function handleVrec(ev) {
    const vehicles = Array.isArray(ev?.detail?.vehicles) ? ev.detail.vehicles : [];
    if (!vehicles.length) {
        console.warn('[bottom] Nessun veicolo disponibile per l\'inizializzazione.');
        return;
    }
    hasHandledVehicleSnapshot = true;
    window.vehicles = vehicles;

    const searchInput = document.querySelector('input[data-role="vehicle-search-bar-bottom"]');
    if (searchInput) {
        const comboContainer = searchInput.parentNode;
        const options = vehicles.map((v) => ({ text: [v.nickname, v.plate.v, v.imei], value: v.imei }));
        if (!vehicleComboBox) {
            vehicleComboBox = new ComboBox(comboContainer, options, (selectedImei) => {
                if (!frame) return;
                const targetVehicle = window.vehicles.find((vehicle) => vehicle.imei == selectedImei);
                if (targetVehicle) {
                    frame.dispatchEvent(new CustomEvent('vchange', { detail: { vehicle: targetVehicle } }));
                }
            });
        } else {
            vehicleComboBox.setOptions(options);
        }
    }

    renderRightSection(ev, true);
}

function handleVchange(ev) {
    if (!ev?.detail?.vehicle) return;
    const sameVehicle = window.currentVehicle && window.currentVehicle.imei === ev.detail.vehicle.imei;
    if (sameVehicle) {
        return;
    }

    renderRightSection(ev, false);
}

function handleDeviceEvent(ev) {
    const device = ev?.detail?.device;
    if (!device?.imei) {
        return;
    }
    const status = computeVehicleStatusSnapshot(device);
    vehicleStatusCache.set(device.imei, status);
    if (window.currentVehicle?.imei === device.imei) {
        renderVehicleStatusPill(status);
    }
}

const handleRangeChange = () => {
    const fromMs = Date.parse(_start.value);
    const toMs = Date.parse(_stop.value);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
        console.warn('[bottom] intervallo non valido', _start.value, _stop.value);
        return;
    }
    if (fromMs >= toMs) {
        alert('Intervallo non valido: la data di fine deve essere successiva alla data di inizio.');
        return;
    }
    if (RM) {
        RM.clearMap();
    }
    const detail = {
        vehicles: window.vehicles || [],
        vehicle: window.currentVehicle || null
    };
    renderRightSection({ detail }, !RM);
};

[_start, _stop].forEach((input) => {
    if (input) input.addEventListener('change', handleRangeChange);
});



async function renderRightSection(ev, firstRequest) {

    const { vehicles } = ev?.detail;
    const [_from, _to] = [_start.value, _stop.value]
    const fromMs = parseTimestamp(_from);
    const toMs = parseTimestamp(_to);
    const overlay = document.querySelector('.overlay.blurred.fade');
    overlay.classList.remove('out');



    if (firstRequest) {
        window.currentVehicle = vehicles?.[0] || null;
    }
    else {
        window.currentVehicle = ev?.detail?.vehicle;
    }

    if (vehicleComboBox && window.currentVehicle?.imei) {
        vehicleComboBox.selectValue(window.currentVehicle.imei, true);
    }

    if (!window.currentVehicle) {
        if (refuelForm?.enabled) {
            refuelForm.setVehicle(null);
        }
        updateStatisticsUI({ general: null, driverStats: new Map(), driverList: [] });
        renderVehicleStatusPill(DEFAULT_VEHICLE_STATUS);
        return;
    }
    const { imei } = window.currentVehicle;
    if (imei && !vehicleStatusCache.has(imei)) {
        vehicleStatusCache.set(imei, computeVehicleStatusSnapshot(window.currentVehicle));
    }
    applyVehicleStatusFromCache(imei);
    if (refuelForm?.enabled && refuelForm.currentImei !== imei) {
        refuelForm.setVehicle(window.currentVehicle);
    }
    document.querySelector('#waiting_vehicle_name').textContent = window.currentVehicle.nickname
    try {
        const history = await DM.getHistory(imei, _from, _to, window.currentVehicle);
        const sortedHistory = Array.isArray(history?.raw)
            ? [...history.raw].sort((a, b) => a.timestamp - b.timestamp)
            : [];
        const normalizedHistory = normalizeHistorySamples({ raw: sortedHistory });
        if (!history.raw) {
            overlay.classList.add('out')
        }

        if (!RM) {
            const RMScrubber = new Scrubber('#rewindScrubber');
            RM = new RewindManager(imei, "sub_map", RMScrubber, sortedHistory, 3);
            RM.history = sortedHistory;
            var event_filters = document.querySelector('#event_switchs').querySelectorAll('input[type="checkbox"]:not([data-role=""]')
            event_filters.forEach((evtf) => {
                evtf.addEventListener('change', RM.filterEvents)
            })
        } else {
            RM.clearMap();
            RM.history = sortedHistory;
            if (!RM.history.length) {
                window.notify('bad', 'Storici insufficienti', "Questo veicolo non sembra avere storici utili nell'intervallo selezionato, prova a cambiare l'intervallo o il veicolo.")
                const emptyHistory = { raw: [] };
                const emptyEvents = [];
                _fuelChart.update(emptyHistory, emptyEvents);
                window._eventTimelineAll = [];
                renderEventSidebar(emptyEvents);
                ensureEventSearchBinding();
                if (RM?.map?.clearMarkers) {
                    RM.map.clearMarkers();
                }
                if (refuelForm?.enabled) {
                    refuelForm.setDetectedEvents(emptyEvents, { vehicle: window.currentVehicle });
                }
                updateStatisticsUI({ general: null, driverStats: new Map(), driverList: [] });
                overlay.classList.add('out')
                return
            }
            RM._routeFeaturesFull = [];
            RM._renderAll?.();
        }

        RM.imei = imei;
        RM.vehicle = window.currentVehicle;
        if (Number.isFinite(fromMs)) RM.from = fromMs;
        if (Number.isFinite(toMs)) RM.to = toMs;

        let fuelEvents = [];
        if (RM?.retrieveEvents) {
            fuelEvents = await RM.retrieveEvents({ from: fromMs, to: toMs });
        }
        if ((!fuelEvents || !fuelEvents.length) && Array.isArray(history?.fuelEvents) && history.fuelEvents.length) {
            fuelEvents = history.fuelEvents.map((evt) => ({ ...evt }));
            if (RM) RM.fuelEvents = fuelEvents;
        }

        if (_fuelChart) _fuelChart.update(history, fuelEvents);
        overlay.classList.add('out');

        const driverMeta = normalizedHistory?.driverMeta instanceof Map ? normalizedHistory.driverMeta : new Map();
        let driverEvents = Array.isArray(history?.driverEvents)
            ? history.driverEvents.map((evt) => ({ ...evt }))
            : [];
        if (!driverEvents.length) {
            const driverIds = collectDriverIdsFromMeta(driverMeta);
            if (driverIds.length && Number.isFinite(fromMs) && Number.isFinite(toMs)) {
                const fetchedDriverEvents = await fetchDriverEventsForRange(driverIds, {
                    imei,
                    fromMs,
                    toMs,
                    driverMeta
                });
                if (Array.isArray(fetchedDriverEvents) && fetchedDriverEvents.length) {
                    driverEvents = fetchedDriverEvents;
                }
            }
        }
        const refuelEvents = Array.isArray(fuelEvents)
            ? fuelEvents.map((o) => ({
                ...o,
                type: o.normalizedType || (o.type === 'rifornimento' ? 'refuel' : o.type)
            }))
            : [];
        if (refuelForm?.enabled) {
            refuelForm.setDetectedEvents(refuelEvents, { vehicle: window.currentVehicle });
        }
        const events = [...driverEvents, ...refuelEvents]
            .filter(Boolean)
            .sort((a, b) => (a.start - b.start))
            .map((evt, idx) => ({ ...evt, originalIdx: idx }));
        window._eventTimelineAll = events;

        const filteredEvents = (RM && typeof RM.filterEvents === 'function')
            ? RM.filterEvents(events)
            : events;

        renderEventSidebar(filteredEvents);
        ensureEventSearchBinding();

        const statsPayload = computeVehicleStatistics({ raw: sortedHistory }, refuelEvents, normalizedHistory);
        updateStatisticsUI(statsPayload);





    } catch (err) {
        console.log(err)
    }


}


