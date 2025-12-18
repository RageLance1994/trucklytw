import { ChartWrapper } from "/assets/js/charts.js";
import { FuelChart } from "/assets/js/overlays/components/fuelChart.js";
import { RewindManager } from "/assets/js/managers/_rewindManager.js";
import { DM } from "/assets/js/managers/_dataManager.js"
import { ComboBox } from "/assets/js/comboBox.js";
import { DriverChart } from "/assets/js/_driverChart.js";
const frameElement = document.querySelector('iframe#mainmapframe') || document.querySelector('iframe');
const rewinderContainer = document.querySelector('.rewind_scrubber_container');
const mainMapOverlay = document.querySelector('#main_map_overlay');
let vrecAlready = false;
var nowDate = new Date();
var now = nowDate.getTime()
var start = new Date();
start.setHours(-48, 0, 0, 0);
var _start = start.getTime();

var stop = new Date();
stop.setHours(24, 0, 0, 0);

var _stop = stop.getTime()





const setMainMapOverlay = (visible) => {
  if (!mainMapOverlay || !mainMapOverlay.classList) return;
  mainMapOverlay.classList.toggle('hidden', !visible);
};

const fuelWaitOverlay = document.querySelector('#fuel_wait_overlay');
let lastFuelImei = null;
let lastDriverImei = null;
const getActiveImei = () => window.currentAnalysisImei || window.currentVehicle?.imei || lastFuelImei || lastDriverImei || null;
const setActiveImei = (imei) => {
  if (!imei) return;
  window.currentAnalysisImei = imei;
  lastFuelImei = imei;
  lastDriverImei = imei;
};
let vehicleComboBox = null;

const toMsFromInput = (input) => {
  if (!input?.value) return null;
  const ms = Date.parse(input.value);
  return Number.isFinite(ms) ? ms : null;
};

const initFuelControls = () => {
  const controls = document.querySelector('#fuelChartControls');
  if (!controls) return;
  const [fromInput, toInput] = controls.querySelectorAll('input[type="datetime-local"]') || [];
  const exportToggle = controls.querySelector('.info-sel');
  const exportMenu = controls.querySelector('.overlay.nav-menu');

  const setInputValue = (input, ms) => {
    if (!input || !Number.isFinite(ms)) return;
    const iso = new Date(ms).toISOString().slice(0, 16);
    input.value = iso;
  };

  setInputValue(fromInput, _start);
  setInputValue(toInput, _stop);

  const handleRangeChange = () => {
    const fromMs = toMsFromInput(fromInput);
    const toMs = toMsFromInput(toInput);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return;
    _start = fromMs;
    _stop = toMs;
    if (lastFuelImei) {
      fetchFuelData(lastFuelImei);
    }
  };

  fromInput?.addEventListener('change', handleRangeChange);
  toInput?.addEventListener('change', handleRangeChange);

  const closeMenu = () => exportMenu?.classList.remove('open');
  const toggleMenu = (ev) => {
    ev.stopPropagation();
    if (!exportMenu) return;
    exportMenu.classList.toggle('open');
  };
  exportToggle?.addEventListener('click', toggleMenu);
  document.addEventListener('click', (ev) => {
    if (!controls.contains(ev.target)) {
      closeMenu();
    }
  });
};

const initVehicleComboBox = () => {
  const searchInput = document.querySelector('input[data-role="vehicle-search-bar-bottom"]');
  if (!searchInput || !Array.isArray(window.vehicles) || !window.vehicles.length) return;
  const comboContainer = searchInput.parentNode;
  const options = window.vehicles.map((v) => ({ text: [v.nickname, v.plate?.v, v.imei].filter(Boolean), value: v.imei }));
  const onChange = (selectedImei) => {
    if (!selectedImei) return;
    window.currentAnalysisImei = selectedImei;
    fetchFuelData(selectedImei);
    spawnDriverFromMap(selectedImei);
  };
  if (!vehicleComboBox) {
    vehicleComboBox = new ComboBox(comboContainer, options, onChange);
  } else {
    vehicleComboBox.setOptions(options);
  }
};

const afo = [
  { overlay: 'right', actions: ['fuel', 'driver', 'alert'] },
  { overlay: 'bottom', actions: ['report', 'tachosync'] },
]

let fuelChartInstance = null;
let fetchFuelData = () => Promise.resolve(null);
let driverChartInstance = null;

const ensureFuelChartHostSizing = (host) => {
  if (!host || host.dataset.fuelLayoutFixed === 'true') return;
  host.dataset.fuelLayoutFixed = 'true';
  host.style.width = host.style.width || '100%';
  host.style.height = host.style.height || '100%';
  host.style.maxHeight = host.style.maxHeight || 'calc(100% - 80px)';
  host.style.minHeight = host.style.minHeight || '260px';
  host.style.flex = host.style.flex || '1 1 auto';
  host.style.overflow = host.style.overflow || 'hidden';

  const parent = host.parentElement;
  if (parent) {
    if (!parent.style.display) parent.style.display = 'flex';
    if (!parent.style.flexDirection) parent.style.flexDirection = 'column';
    if (!parent.style.alignItems) parent.style.alignItems = 'stretch';
    if (!parent.style.width) parent.style.width = '100%';
    if (!parent.style.height) parent.style.height = '100%';
    if (!parent.style.flex) parent.style.flex = '1 1 auto';
    if (!parent.style.minHeight) parent.style.minHeight = '260px';
    if (!parent.style.overflow) parent.style.overflow = 'hidden';
  }
};


const setDriverField = (key, value) => {
  const el = document.querySelector(`[data-driver-field="${key}"]`);
  if (el) el.textContent = value ?? '--';
};
const resetDriverUI = () => {
  setDriverField("id-value", "--");
  setDriverField("license-value", "--");
  setDriverField("state-value", "--");
  setDriverHeader({ name: "--", state: "--" });
  if (driverChartInstance) {
    try { driverChartInstance.renderEvents([]); } catch {}
  }
};
const getDriverIdFromStore = (imei) => {
  try {
    const store = frameElement?.contentWindow?.__lastAvlByImei;
    const avl = store?.get(imei);
    return avl?.data?.io?.tachoDriverIds?.driver1 || avl?.data?.io?.driver1Id || null;
  } catch {
    return null;
  }
};
const setDriverHeader = ({ name, state, statusClass }) => {
  const nameEl = document.querySelector('[data-driver-info="name-sur-id"]');
  if (nameEl) nameEl.textContent = name || '--';
  const pill = nameEl?.parentElement?.querySelector('.pill');
  if (pill) {
    pill.textContent = state || '--';
    pill.classList.remove('success', 'danger', 'warning');
    if (statusClass) pill.classList.add(statusClass);
  }
};
const resolveStatus = ({ workingState, tachoActivity, timelineStateName }) => {
  const normalizeActivity = (text) => {
    if (!text) return null;
    const t = String(text).toLowerCase();
    if (t.includes('drive') || t.includes('guida')) return 3;
    if (t.includes('rest') || t.includes('riposo')) return 0;
    if (t.includes('work') || t.includes('lavor')) return 2;
    return null;
  };
  const numeric = Number.isFinite(workingState) ? Number(workingState) : null;
  const fromTimeline = timelineStateName ? normalizeActivity(timelineStateName) : null;
  const fromTacho = normalizeActivity(tachoActivity);
  const stateCode = numeric ?? fromTacho ?? fromTimeline;
  switch (stateCode) {
    case 3:
      return { text: 'Alla guida', cls: 'success' };
    case 0:
      return { text: 'Riposo', cls: 'danger' };
    case 2:
      return { text: 'Lavoro', cls: 'warning' };
    default:
      return { text: stateCode != null ? String(stateCode) : '--', cls: null };
  }
};


const STAT_KEYS = [
  'avg-consumption',
  'hourly-consumption',
  'trip-consumption',
  'engine-hours',
  'refuel-count',
  'total-consumption',
  'moving-consumption',
  'idle-consumption'
];

const MIN_DISTANCE_FOR_VALID_AVG_KM = 5;
const MAX_REASONABLE_CONSUMPTION_PER_100KM = 60;
const DRIVER_CARD_KEYS = [
  { idKey: 'driver1Id', nameKey: 'driver1Name' },
  { idKey: 'driver2Id', nameKey: 'driver2Name' }
];

const formatStatNumber = (val, digits = 2) => {
  if (!Number.isFinite(val)) return null;
  const fixed = Number(val).toFixed(digits);
  return fixed.replace(/\.00$/, '').replace(/\.0$/, '');
};

const normalizeAvgConsumption = (avgValue, distanceKm) => {
  if (!Number.isFinite(avgValue)) return null;
  if (Number.isFinite(distanceKm) && distanceKm < MIN_DISTANCE_FOR_VALID_AVG_KM) return null;
  if (avgValue > MAX_REASONABLE_CONSUMPTION_PER_100KM) return null;
  return avgValue;
};

const formatStatsForUI = (record) => {
  const fallback = STAT_KEYS.reduce((acc, key) => ({ ...acc, [key]: '--' }), {});
  if (!record) return fallback;
  const withUnit = (value, unit) => (Number.isFinite(value) ? `${formatStatNumber(value)} ${unit}` : '--');
  const normalizedAvg = normalizeAvgConsumption(
    record.avgConsumptionPer100Km,
    record.distanceKm ?? record.totalDistanceKm
  );
  return {
    'avg-consumption': withUnit(normalizedAvg, 'L/100km'),
    'hourly-consumption': withUnit(record.consumptionPerHour, 'L/h'),
    'trip-consumption': withUnit(record.tripConsumption, 'L'),
    'engine-hours': withUnit(record.engineHours, 'h'),
    'refuel-count': Number.isFinite(record.refuelCount) ? record.refuelCount : '--',
    'total-consumption': withUnit(record.totalConsumption ?? record.tripConsumption, 'L'),
    'moving-consumption': withUnit(record.movingConsumption, 'L'),
    'idle-consumption': withUnit(record.idleConsumption, 'L')
  };
};

function renderDriverStats(statsPayload) {
  const container = document.querySelector('[data-role="driver-stats"]');
  if (!container) return;
  const formatted = formatStatsForUI(statsPayload);
  STAT_KEYS.forEach((key) => setStatValue(container, key, formatted[key] ?? '--'));
  if (statsPayload?.driverId) {
    container.dataset.driverId = statsPayload.driverId;
    if (statsPayload.driverLabel) container.dataset.driverLabel = statsPayload.driverLabel;
  } else {
    delete container.dataset.driverId;
    delete container.dataset.driverLabel;
  }
}

function setStatValue(container, key, value) {
  if (!container) return;
  const row = container.querySelector(`.stat[data-stat-key="${key}"]`);
  const target = row?.querySelector('[data-role="stat-value"]');
  if (target) target.textContent = value ?? '--';
}

function renderGeneralStats(payload) {
  const container = document.querySelector('[data-role="general-stats"]');
  if (!container) return;
  STAT_KEYS.forEach((key) => setStatValue(container, key, payload?.[key] ?? '--'));
}

function computeFuelStats(data = [], events = []) {
  
  const toMs = (value) => {
    if (value instanceof Date) return value.getTime();
    const num = Number(value);
    if (Number.isFinite(num)) return num < 1e12 ? num * 1000 : num;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const toNum = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const formatNumber = (val, digits = 2) => {
    if (!Number.isFinite(val)) return null;
    const fixed = Number(val).toFixed(digits);
    return fixed.replace(/\.00$/, '').replace(/\.0$/, '');
  };

  const samples = Array.isArray(data)
    ? data
      .map((d) => {
        const ts = toMs(d.timestamp ?? d.ts ?? d.time);
        const liters = toNum(
          d.current_fuel ?? d.currentFuel ?? d.fuel ?? d.liters ?? d.value ?? d.tank ?? d.tankLiters
        );
        const odometer = toNum(
          d.odometer ?? d.totalOdometer ?? d.tripOdometer ?? d.mileage ?? d.Odometer
        );
        return Number.isFinite(ts) && Number.isFinite(liters) ? { ts, liters, odometer } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.ts - b.ts)
    : [];

  if (!samples.length) {
    return STAT_KEYS.reduce((acc, key) => ({ ...acc, [key]: '--' }), {});
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const durationHours = Math.max(0, (last.ts - first.ts) / 3_600_000);
  const totalDrop = (first.liters ?? 0) - (last.liters ?? 0);
  const netConsumption = totalDrop >= 0 ? totalDrop : 0;
  const hourly = durationHours > 0 ? netConsumption / durationHours : null;
  let startOdometer = null;
  for (let i = 0; i < samples.length; i++) {
    const candidate = samples[i]?.odometer;
    if (Number.isFinite(candidate)) {
      startOdometer = candidate;
      break;
    }
  }
  let endOdometer = null;
  for (let i = samples.length - 1; i >= 0; i--) {
    const candidate = samples[i]?.odometer;
    if (Number.isFinite(candidate)) {
      endOdometer = candidate;
      break;
    }
  }
  const deltaDistanceKm = Number.isFinite(startOdometer) && Number.isFinite(endOdometer)
    ? Math.max(0, endOdometer - startOdometer) / 1000
    : null;
  const avgConsumptionPer100Km = deltaDistanceKm > 0 && netConsumption > 0
    ? netConsumption / (deltaDistanceKm / 100)
    : null;
  const normalizedAvg = normalizeAvgConsumption(avgConsumptionPer100Km, deltaDistanceKm);
  const refuelCount = Array.isArray(events)
    ? events.filter((e) => (e.normalizedType || e.type || '').toLowerCase() === 'refuel').length
    : 0;

  return {
    'avg-consumption': Number.isFinite(normalizedAvg) ? `${formatNumber(normalizedAvg)} L/100km` : '--',
    'hourly-consumption': Number.isFinite(hourly) ? `${formatNumber(hourly)} L/h` : '--',
    'trip-consumption': Number.isFinite(netConsumption) ? `${formatNumber(netConsumption)} L` : '--',
    'engine-hours': Number.isFinite(durationHours) ? `${formatNumber(durationHours)} h` : '--',
    'refuel-count': refuelCount || 0,
    'total-consumption': Number.isFinite(netConsumption) ? `${formatNumber(netConsumption)} L` : '--',
    'moving-consumption': '--',
    'idle-consumption': '--'
  };
}

const MOVING_SPEED_THRESHOLD_KMH = 3;
const MAX_SEGMENT_DURATION_MS = 45 * 60 * 1000;
const MIN_CONSUMPTION_LITERS = 0.25;
const MAX_CONSUMPTION_LITERS = 600;
const MIN_DISTANCE_FOR_AVG_KM = 5;

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseTimestamp = (value) => {
  if (!value && value !== 0) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
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
    const val = toFiniteNumber(candidate);
    if (Number.isFinite(val)) {
      liters = val;
      break;
    }
  }

  const tank1 = toFiniteNumber(io.tank1 ?? io.tank_1 ?? io.tankPrimary ?? io.primaryTankCapacity);
  const tank2 = toFiniteNumber(io.tank2 ?? io.tank_2 ?? io.tankSecondary ?? io.secondaryTankCapacity);
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
    const val = toFiniteNumber(candidate);
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

  return { liters, percent, capacity, tank1, tank2 };
};

function extractOdometerValue(entry = {}) {
  const io = entry?.io || entry;
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

function normalizeFuelSamples(data = []) {
  const driverMeta = new Map();
  const samples = Array.isArray(data)
    ? data.map((entry) => {
      const timestamp = parseTimestamp(entry?.timestamp ?? entry?.ts ?? entry?.time);
      if (!Number.isFinite(timestamp)) return null;
      const io = entry?.io || entry;
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
      const odometer = extractOdometerValue({ io, gps });
      const drivers = extractDriversFromIO(io, timestamp, driverMeta);
      return {
        ts: timestamp,
        liters: toFiniteNumber(liters),
        speed,
        movement,
        ignition,
        odometer,
        drivers
      };
    }).filter(Boolean).sort((a, b) => a.ts - b.ts)
    : [];
  return { samples, driverMeta };
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
    const deltaMs = curr.ts - prev.ts;
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
    idleConsumption: Number.isFinite(idleConsumption) ? idleConsumption : null,
    distanceKm: Number.isFinite(totalDistanceKm) ? totalDistanceKm : null
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

function computeFuelStatistics(rawData = [], events = []) {
  const normalized = normalizeFuelSamples(rawData);
  if (!normalized.samples.length) {
    return { general: null, driverStats: new Map(), driverList: [] };
  }
  const eventsSummary = summarizeFuelEvents(events, normalized.driverMeta);
  const stats = computeStatsFromSamples(normalized.samples, eventsSummary, normalized.driverMeta);
  const driverList = buildDriverList(normalized.driverMeta, stats.driverStats, eventsSummary.perDriver);
  return { ...stats, driverList };
}

function selectDriverStat(statsPayload) {
  if (!statsPayload) return null;
  const list = Array.isArray(statsPayload.driverList) ? statsPayload.driverList : [];
  const map = statsPayload.driverStats instanceof Map ? statsPayload.driverStats : null;
  if (!map || !map.size) return null;
  const desiredId = list[0]?.id || [...map.keys()][0];
  const record = map.get(desiredId);
  if (!record) return null;
  return {
    ...record,
    driverId: desiredId,
    driverLabel: record.label || desiredId
  };
}


function getFuelChart() {
  // Reuse any existing fuel chart instance (e.g. created elsewhere) to avoid stacking multiple charts
  const host = document.querySelector('#fuelChart');
  if (host) {
    ensureFuelChartHostSizing(host);
  }
  if (fuelChartInstance) return fuelChartInstance;
  if (window._fuelChart) {
    fuelChartInstance = window._fuelChart;
    return fuelChartInstance;
  }
  if (!host) return null;
  try {
    const wrapper = new ChartWrapper(host);
    fuelChartInstance = new FuelChart(wrapper);
    window._fuelChart = fuelChartInstance;
    return fuelChartInstance;
  } catch (err) {
    console.warn('[tooltipInteractions] unable to init fuel chart', err);
    return null;
  }
}

fetchFuelData = (imei) => {
  const activeImei = imei || getActiveImei();
  if (!activeImei) return Promise.resolve(null);
  const isSame = lastFuelImei && activeImei === lastFuelImei;
  if (isSame && fuelChartInstance) {
    return Promise.resolve(null);
  }
  setActiveImei(activeImei);
  const inferredDriver = getDriverIdFromStore(imei);
  if (inferredDriver) {
    lastDriverImei = activeImei;
  }
  const chart = getFuelChart();
  if (!chart) return Promise.resolve(null);
  try { chart.update({ data: [], events: [], fuelEvents: [], refuelEvents: [] }, []); } catch {}
  fuelWaitOverlay?.classList.remove('hidden');
  const request = window._post(`/dashboard/fueldump`, { imei, from: _start, to: _stop }).then((data) => {
    const payload = data || {};
    const events = Array.isArray(payload?.events)
      ? payload.events
      : Array.isArray(payload?.fuelEvents)
        ? payload.fuelEvents
        : Array.isArray(payload?.refuelEvents)
          ? payload.refuelEvents
          : [];
    chart.update({
      data: Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.raw) ? payload.raw : [],
      events,
      fuelEvents: payload?.fuelEvents,
      refuelEvents: payload?.refuelEvents
    }, events);

    const statsPayload = computeFuelStatistics(payload?.data || payload?.raw, events);
    const generalStats = statsPayload?.general
      ? formatStatsForUI(statsPayload.general)
      : computeFuelStats(payload?.data || payload?.raw, events);
    renderGeneralStats(generalStats);
    renderDriverStats(selectDriverStat(statsPayload));
  }).catch((err) => console.error(err))
    .finally(() => {
      setTimeout(() => {
        fuelWaitOverlay?.classList.add('hidden');
      }, 300);
    });
  return request;
};

initFuelControls();



function waitForTooltipStore({ frame, timeout = 10000, interval = 100 }) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    const attempt = () => {
      const store = frame?.contentWindow?.__tooltipStore;


      if (store && store.size >= window.vehicles.length) {

        resolve(store);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('tooltip store not available'));
        return;
      }
      setTimeout(attempt, interval);
    };

    if (!frame) {
      reject(new Error('iframe not found'));
      return;
    }

    if (frame.contentWindow && frame.contentDocument?.readyState === 'complete') {
      attempt();
    } else {
      frame.addEventListener('load', () => attempt(), { once: true });
    }
  });
}

function getTrucklyMap() {
  return frameElement?.contentWindow?.__trucklyMap || null;
}

function updateMarkerManualVisibility(marker, hidden) {
  if (!marker) return;
  const el = typeof marker.getElement === 'function' ? marker.getElement() : marker._element;
  if (!el) return;
  if (hidden) {
    el.dataset.rewindHidden = 'true';
    el.style.display = 'none';
  } else {
    delete el.dataset.rewindHidden;
    if (el.dataset.eventHidden === 'true') {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  }
}

function refreshMapClusters(instance) {
  if (instance && typeof instance.updateClusters === 'function') {
    instance.updateClusters();
  }
}


export function handleVehicleInteraction(tooltip, ev, imei) {

  console.clear()
  console.warn(tooltip, ev, imei);

  var action = ev.currentTarget.dataset.interaction;
  var vehicle = window.vehicles.find(element => element.imei == imei);
  


  var isOverlayAction = afo.find(element => element.actions.includes(action));
  if (isOverlayAction) {
    document.querySelector(`#${isOverlayAction.overlay}_section`).classList.remove('scrolled');
    switch (isOverlayAction.overlay) {
      case 'right':
        document.querySelector('[data-role="vehicle-search-bar-bottom"]').value = vehicle.nickname;

        break;
    }

  }


  switch (action) {
    case 'routes':
      spawnRewinder(tooltip, imei);
      break;
    case 'fuel':
      spawnFuelFromMap(imei);
      break;

    case 'driver': 
      spawnDriverFromMap(imei);
  }



}


frameElement.contentWindow.addEventListener('vrec', (ev) => {
  if (vrecAlready) return;
  vrecAlready = true;
  waitForTooltipStore({ frame: frameElement }).then(async (store) => {
    window.tooltipStore = store;
    
    store.forEach((entry) => {
      const { root, imei } = entry || {};
      if (!root) return;
      const wrapper = root.querySelector('[data-controls="vehicle-interactions"]');
      if (!wrapper) return;

      const buttons = wrapper.querySelectorAll('a[data-interaction]');
      buttons.forEach((btn) => {
        btn.addEventListener('click', (ev) => handleVehicleInteraction(entry, ev, imei));
      });
    });
  }).catch((err) => console.warn('[tooltipInteractions] unable to access tooltip store', err));
});

waitForTooltipStore({ frame: frameElement, timeout: 10000, interval: 100 }).then((store) => {
  initVehicleComboBox();
}).catch(() => { });


document.querySelector('a[data-close="rewind_scrubber"]').addEventListener('click', (ev) => {
  toggleRewinder(false, null, null);
})


async function toggleRewinder(mode, imei, tooltip) {
  try {
    const frameWin = frameElement?.contentWindow;
    if (frameWin) frameWin.__rewindActiveImei = mode ? imei : null;
    window.__rewindActiveImei = mode ? imei : null;
  } catch { }
  const mapInstance = frameElement.contentWindow.__trucklyMap;

  if (!mapInstance || !mapInstance.markers) return;

  if (mode) {
    mapInstance.resetClusterState?.({ animate: false });
    tooltip?.marker?.togglePopup?.();
    try {
      mapInstance.__rewindMarkerCache = mapInstance.__rewindMarkerCache instanceof Map ? mapInstance.__rewindMarkerCache : new Map();
      const currentMarker = typeof mapInstance.markers?.get === 'function' ? mapInstance.markers.get(imei) : null;
      const lngLat = currentMarker?.getLngLat?.();
      if (currentMarker && lngLat) {
        mapInstance.__rewindMarkerCache.set(imei, {
          lng: lngLat.lng,
          lat: lngLat.lat,
          device: currentMarker.device || null,
          vehicle: currentMarker.vehicle || null,
          status: currentMarker.status || null,
          tooltipEntry: currentMarker._tooltipEntry || null,
        });
      }
    } catch { }
    mapInstance.markers.forEach((marker, key) => {
      const markerId = key ?? marker?.device?.imei;
      const isTarget = imei && (markerId === imei || marker?.device?.imei === imei);
      updateMarkerManualVisibility(marker, !isTarget);
    });
    rewinderContainer?.classList.remove('oos');
  } else {


    rewinderContainer?.classList.add('oos');
    try { window.rewindManager?.unloadPath?.(); } catch { }
    mapInstance.markers.forEach((marker) => {
      updateMarkerManualVisibility(marker, false);
    });
    mapInstance.hoveringMarker = false;
    mapInstance.resetClusterState?.({ animate: false });
    mapInstance.updateClusters?.();
  }
  refreshMapClusters(mapInstance);
}



function spawnRewinder(tooltip, imei) {
  toggleRewinder(true, imei, tooltip);
  if (!window.dataManager) {
    window.dataManager = DM;
  }
  setMainMapOverlay(true);
  window.dataManager.getHistory(imei, _start, _stop).then((data) => {
    const history = data?.raw || [];
    if (!window.rewindManager) {
      window.rewindManager = new RewindManager(imei, window.RMScrubber, history);
    } else {
      try { window.rewindManager.switchVehicle?.(imei); } catch { }
      window.rewindManager.history = history;
    }

    if (window.rewindManager) {
      return window.rewindManager.loadPath(history, _start, _stop, { imei });
    }
  }).catch((err) => console.error(err))
    .finally(() => setMainMapOverlay(false));

}



function spawnFuelFromMap(imei) {
  document.querySelector('#right_side_scroller_menu').querySelector('.feature[data-tab="tab_rightfuel"]').click();
  fetchFuelData(imei);
}


async function spawnDriverFromMap(imei){

  const targetImei = imei || getActiveImei();
  if (!targetImei) return null;
  if (targetImei !== lastDriverImei) {
    resetDriverUI();
  }
  setActiveImei(targetImei);
  const store = frameElement.contentWindow.__lastAvlByImei; 
  if(!store){
    return null;
  }
  var avl = store.get(targetImei)
  var driver = avl?.data?.io?.tachoDriverIds?.driver1
  if(!driver){
    return null;
  }
  lastDriverImei = targetImei || lastDriverImei;

  try{
    const history = await window._post('/dashboard/driverdump',{driver,imei});
    const timeline = history?.data ?? history ?? [];
    const tacho = history?.tacho;
    setDriverField("id-value", tacho?.id || driver || "--");
    setDriverField("license-value", tacho?.cardNumber || driver || "--");
    const lastTimelineState = timeline?.length
      ? (timeline.at(-1)?.to_state_name || timeline.at(-1)?.state_name || timeline.at(-1)?.to_state)
      : null;
    const avlState = Number(avl?.data?.io?.driver1WorkingState);
    const status = resolveStatus({ workingState: avlState, tachoActivity: tacho?.lastActivity, timelineStateName: lastTimelineState });
    setDriverField("state-value", status.text);
    const displayName = tacho?.cardName || driver || "--";
    setDriverHeader({ name: displayName, state: status.text, statusClass: status.cls });
    if(!driverChartInstance){
      const host = document.getElementById('timeline-container');
      if(host){
        driverChartInstance = new DriverChart('timeline-container');
      }
    }
    if(driverChartInstance){
      driverChartInstance.renderEvents(timeline);
    }
    return history;
  }catch(err){
    console.warn('[tooltipInteractions] unable to load driver timeline', err);
    return null;
  }

}

window.rightPanelActions = {
  refreshFuel: (imei) => fetchFuelData(imei || getActiveImei()),
  refreshDriver: (imei) => {
    const targetImei = imei || getActiveImei();
    setActiveImei(targetImei);
    return spawnDriverFromMap(targetImei);
  }
};


// var testInterval = setInterval(async() => {
//   var result = await spawnDriverFromMap('864275071761426'); 
// },2000)
// spawnDriverFromMap('864275071761426')
