const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toTimestamp = (value) => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const normaliseEvents = (rawEvents = []) => {
  return rawEvents
    .filter(Boolean)
    .map((evt) => {
      const clone = { ...evt };
      const start = toTimestamp(evt.start) ?? toTimestamp(evt.startMs);
      const end = toTimestamp(evt.end) ?? toTimestamp(evt.endMs) ?? start;
      clone.start = start;
      clone.end = end;
      clone.startMs = start;
      clone.endMs = end;
      clone.liters = toFiniteNumber(clone.liters ?? clone.delta);
      clone.delta = toFiniteNumber(clone.delta);
      clone.durationMs = toFiniteNumber(
        clone.durationMs ?? (
          Number.isFinite(end) && Number.isFinite(start)
            ? end - start
            : null
        )
      );
      clone.startFuel = toFiniteNumber(clone.startFuel);
      clone.endFuel = toFiniteNumber(clone.endFuel);
      clone.lat = toFiniteNumber(clone.lat);
      clone.lng = toFiniteNumber(clone.lng);
      return clone;
    })
    .filter((evt) => Number.isFinite(evt.start) && Number.isFinite(evt.end));
};

const extractFuelPoints = (raw = []) => {
  const points = [];

  const readFuelSnapshot = (io = {}) => {
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
    if (!Number.isFinite(liters)) return null;

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

    return Number.isFinite(liters) ? liters : null;
  };

  for (const entry of raw) {
    if (!entry?.io) continue;
    const liters = readFuelSnapshot(entry.io);
    if (!Number.isFinite(liters)) continue;
    const stamp = toTimestamp(entry.timestamp ?? entry.ts);
    if (!Number.isFinite(stamp)) continue;
    points.push([stamp, liters]);
  }

  points.sort((a, b) => a[0] - b[0]);
  return points;
};

export const buildFuelSeries = (history = {}) => {
  const rawEvents = Array.isArray(history?.fuelEvents)
    ? history.fuelEvents
    : Array.isArray(history?.refuelEvents)
      ? history.refuelEvents
      : [];

  const refuelEvents = normaliseEvents(rawEvents);
  const rawPoints = extractFuelPoints(Array.isArray(history?.raw) ? history.raw : []);

  if (!rawPoints.length) {
    return { timestamps: [], values: [], refuelEvents };
  }

  const timestamps = new Float64Array(rawPoints.length);
  const values = new Float32Array(rawPoints.length);
  for (let i = 0; i < rawPoints.length; i++) {
    timestamps[i] = rawPoints[i][0];
    values[i] = rawPoints[i][1];
  }

  return {
    timestamps,
    values,
    refuelEvents
  };
};
