// routes/authRoutes.js
const fs = require('fs');
const path = require('path');
const Models = require('../Models/Schemes')
const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const { auth, imeiOwnership } = require('../utils/users')
const { _Users, _Devices, Device, _Vehicles, _Drivers, Driver } = require('../utils/database');
const { getModel, avlSchema, Vehicles, getRefuelingModel } = require('../Models/Schemes');
const { da, DriverAnalyst } = require('../datainspectors/_drivers');
const { fa, FuelAnalyst } = require('../datainspectors/_fuel')
const { decryptJSON, encryptJSON, encryptString, decryptString } = require('../utils/encryption');
const { TachoSync } = require('../utils/tacho')


const ALLOWED_TANK_UNITS = new Set(['litres', 'gallons']);
const HISTORY_BUCKET_MS = 60_000;
const HISTORY_BUCKET_MIN_MS = 60_000;
const HISTORY_BUCKET_MAX_MS = 3_600_000;
const HISTORY_INDEX_CACHE = new Set();
const FUEL_EVENT_INDEX_CACHE = new Set();
const REFUEL_INDEX_CACHE = new Set();
const MAX_REFUEL_ATTACHMENT_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED_REFUEL_ATTACHMENT_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

const getPrivilegeLevel = (user) => {
  if (!user) return 2;
  if (Number.isInteger(user.role)) return user.role;
  if (Number.isInteger(user.privilege)) return user.privilege;
  return 2;
};

const canManageVehicles = (user) => getPrivilegeLevel(user) === 0;

const permissionDeniedResponse = (message = "Non sei autorizzato ad eseguire quest'azione.") => ({
  error: 'PERMISSION_DENIED',
  message
});

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseDateInput = (value) => {
  if (!value && value !== 0) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? new Date(ms) : null;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    const date = new Date(asNumber);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
};

const ensureVehicleOwnership = async (user, imei) => {
  if (!user || !imei) return false;
  try {
    const vehicles = await user.vehicles.list();
    return Array.isArray(vehicles) && vehicles.some((v) => `${v.imei}` === `${imei}`);
  } catch (err) {
    console.warn('[refuelings] impossibile verificare ownership', err);
    return false;
  }
};

const encodeAttachments = (files) => {
  if (!files) return [];
  const list = Array.isArray(files) ? files : [files];
  const sanitized = [];
  for (const file of list) {
    if (!file?.data || !file.name || !file.mimetype) continue;

    if (!ALLOWED_REFUEL_ATTACHMENT_MIMES.has(file.mimetype) && !file.mimetype.startsWith('image/')) {
      throw new Error(`Tipo file non supportato: ${file.mimetype}`);
    }

    if (file.size > MAX_REFUEL_ATTACHMENT_SIZE) {
      throw new Error(`File troppo grande (${file.name}). Massimo ${(MAX_REFUEL_ATTACHMENT_SIZE / (1024 * 1024)).toFixed(1)}MB`);
    }

    sanitized.push({
      name: file.name,
      mimeType: file.mimetype,
      size: file.size,
      dataEnc: encryptJSON({
        name: file.name,
        mimeType: file.mimetype,
        size: file.size,
        data: file.data.toString('base64')
      })
    });
  }
  return sanitized;
};

const mapRefuelingDoc = (doc) => {
  if (!doc) return null;
  const source = doc.toObject ? doc.toObject({ getters: true, virtuals: false }) : doc;
  return {
    imei: source.imei,
    eventId: source.eventId,
    eventStart: source.eventStart,
    eventEnd: source.eventEnd,
    liters: toFiniteNumber(source.liters),
    pricePerUnit: toFiniteNumber(source.pricePerUnit),
    tankPrimary: toFiniteNumber(source.tankPrimary),
    tankSecondary: toFiniteNumber(source.tankSecondary),
    station: source.station || null,
    invoiceRef: source.invoiceRef || null,
    metadata: source.metadata || {},
    attachments: Array.isArray(source.attachments)
      ? source.attachments.map(({ name, mimeType, size }) => ({ name, mimeType, size }))
      : [],
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
};

const normaliseTank = (tank) => {
  if (!tank || typeof tank !== 'object') return null;
  const capacity = Number(tank.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) return null;
  const unitRaw = typeof tank.unit === 'string' ? tank.unit.trim().toLowerCase() : null;
  if (!unitRaw || !ALLOWED_TANK_UNITS.has(unitRaw)) return null;
  return { capacity, unit: unitRaw };
};



const calibrateClusters = async (req, imeis) => {
  if (!Array.isArray(imeis) || !imeis.length) {
    return res.status(400).json({ message: "Nessun IMEI specificato." });
  }

  let ownedVehicles = [];
  try {
    ownedVehicles = await req.user.vehicles.list();
  } catch (err) {
    console.warn('[calibrate] Impossibile recuperare la lista veicoli per utente.', err);
  }
  const vehicleMap = new Map(ownedVehicles.map((vehicle) => [vehicle.imei, vehicle]));

  const result = await Promise.all(
    imeis.map(async (imei) => {
      try {
        const model = getModel(`${imei}_monitoring`, avlSchema);
        const maxDoc1 = await model.findOne({ "io.analogInput1": { $ne: null } })
          .sort({ "io.analogInput1": -1 })
          .select("io.analogInput1")
          .lean();
        const maxDoc2 = await model.findOne({ "io.analogInput1": { $ne: null } })
          .sort({ "io.analogInput1": -1 })
          .select("io.analogInput1")
          .lean();

        const [probe1, probe2] = [maxDoc1?.io?.analogInput1 || 0, maxDoc2?.io?.analogInput2 || 0]
        const analogMax = Number(probe1 + probe2);
        const hasSensor = analogMax >= 100;
        const vehicleDoc = vehicleMap.get(imei);
        const { tanks } = vehicleDoc.details
        const totalCapacity = tanks?.primary?.capacity || 0 + tanks?.secondary?.capacity || 0;
        const primaryUnit = tanks?.primary.unit ?? null;
        const analogPerLiter = hasSensor && totalCapacity
          ? analogMax / totalCapacity
          : null;
        const literPerAnalog = analogPerLiter && analogPerLiter > 0
          ? 1 / analogPerLiter
          : null;
        return {
          imei,
          hasSensor,
          max: hasSensor ? totalCapacity : null,
          min: hasSensor ? 0 : null,
          tanks,
          capacity: totalCapacity,
          unit: primaryUnit,
          conversion: {
            analogPerLiter,
            literPerAnalog
          }
        };
      } catch (err) {
        console.error(`[calibrate] Errore durante l'elaborazione dell'IMEI ${imei}.`, err);
        return {
          imei,
          hasSensor: false,
          max: null,
          min: null,
          tanks: null,
          capacity: null,
          unit: null,
          conversion: {
            analogPerLiter: null,
            literPerAnalog: null
          }
        };
      }
    })
  );

  return (result);

}


const sanitizeDetailsForStorage = (rawDetails) => {
  if (!rawDetails || typeof rawDetails !== 'object') return {};
  const result = { ...rawDetails };

  const sanitizeSimDetails = (rawSim) => {
    if (!rawSim || typeof rawSim !== 'object') return null;
    const toStr = (v) => typeof v === 'string' ? v.trim() : '';
    const sim = {
      prefix: toStr(rawSim.prefix),
      number: toStr(rawSim.number),
      iccid: toStr(rawSim.iccid)
    };
    const pruned = Object.fromEntries(Object.entries(sim).filter(([, v]) => v));
    return Object.keys(pruned).length ? pruned : null;
  };

  if (rawDetails.tanks && typeof rawDetails.tanks === 'object') {
    const sanitizedTanks = {};
    const primary = normaliseTank(rawDetails.tanks.primary);
    if (primary) sanitizedTanks.primary = primary;

    const secondary = normaliseTank(rawDetails.tanks.secondary);
    if (secondary) sanitizedTanks.secondary = secondary;

    if (Object.keys(sanitizedTanks).length) {
      result.tanks = sanitizedTanks;
    } else {
      delete result.tanks;
    }
  }

  const sim = sanitizeSimDetails(rawDetails.sim);
  if (sim) {
    result.sim = sim;
  } else {
    delete result.sim;
  }

  return result;
};

const parseVehicleDetails = (detailsEnc) => {
  if (!detailsEnc) return null;
  try {
    return decryptJSON(detailsEnc);
  } catch (err) {
    console.warn('[vehicle-details] Unable to decrypt vehicle details.', err);
    return null;
  }
};

const normalizePlateForCollection = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'OLDPLATE';
};

const renameMonitoringCollection = async (imei, oldPlate) => {
  const db = mongoose.connection?.db;
  if (!db || !imei) return { skipped: true, reason: 'no-db' };
  const from = `${imei}_monitoring`;
  const targetBase = `${imei}_${normalizePlateForCollection(oldPlate)}_monitoring`;
  const fromExists = await db.listCollections({ name: from }).hasNext();
  if (!fromExists) return { skipped: true, reason: 'missing-source' };
  let target = targetBase;
  const targetExists = await db.listCollections({ name: target }).hasNext();
  if (targetExists) {
    target = `${targetBase}_${Date.now()}`;
  }
  await db.collection(from).rename(target);
  return { renamed: true, to: target };
};

const normalizeTankDetails = (details) => {
  if (!details || typeof details !== 'object' || !details.tanks) return null;

  const primary = normaliseTank(details.tanks.primary);
  const secondary = normaliseTank(details.tanks.secondary);

  if (!primary && !secondary) return null;

  const unit = primary?.unit || secondary?.unit || null;
  let totalCapacity = 0;
  if (primary) totalCapacity += primary.capacity;
  if (secondary) totalCapacity += secondary.capacity;
  if (!Number.isFinite(totalCapacity) || totalCapacity <= 0) {
    totalCapacity = null;
  }

  return {
    primary: primary || null,
    secondary: secondary || null,
    unit,
    totalCapacity
  };
};

const roundValue = (value, digits = 2) => {
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(digits)) : null;
};

const toMillis = (value) => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const mapFuelEventRecord = (input) => {
  if (!input) return null;
  const source = input.toObject ? input.toObject({ getters: true, virtuals: false }) : input;
  const eventId = source.eventId ? String(source.eventId) : null;
  if (!eventId) return null;

  const startMs = toFiniteNumber(source.startMs) ?? toMillis(source.start);
  const endMs = toFiniteNumber(source.endMs) ?? toMillis(source.end) ?? startMs;

  const liters = toFiniteNumber(source.liters ?? source.delta);
  const delta = toFiniteNumber(source.delta);
  const durationMs = toFiniteNumber(
    source.durationMs ?? (Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : null)
  );
  const startFuel = toFiniteNumber(source.startFuel);
  const endFuel = toFiniteNumber(source.endFuel);
  const confidence = toFiniteNumber(source.confidence);
  const lat = toFiniteNumber(source.lat);
  const lng = toFiniteNumber(source.lng);

  return {
    eventId,
    imei: source.imei ? String(source.imei) : null,
    type: source.type || 'rifornimento',
    normalizedType: source.normalizedType || 'refuel',
    start: startMs,
    end: endMs,
    startMs,
    endMs,
    durationMs,
    liters,
    delta,
    startFuel,
    endFuel,
    driverId: source.driverId ? String(source.driverId) : null,
    confidence,
    lat,
    lng,
    createdAt: toMillis(source.createdAt),
    updatedAt: toMillis(source.updatedAt)
  };
};

const fetchFuelEventsForRange = async (imei, fromMs, toMs) => {
  if (!imei || !Number.isFinite(fromMs) || !Number.isFinite(toMs)) return [];
  try {
    const Model = getRefuelingModel(imei);
    if (!Model) return [];
    ensureRefuelingIndexes(Model);

    const docs = await Model.find({
      imei: `${imei}`,
      $or: [
        {
          startMs: { $exists: true, $lte: toMs },
          endMs: { $exists: true, $gte: fromMs }
        },
        {
          startMs: { $exists: false },
          endMs: { $exists: false },
          start: { $lte: new Date(toMs) },
          end: { $gte: new Date(fromMs) }
        }
      ]
    })
      .sort({ startMs: 1, start: 1 })
      .lean()
      .exec();

    return Array.isArray(docs) ? docs.map(mapFuelEventRecord).filter(Boolean) : [];
  } catch (err) {
    console.error('[history.fuelEvents] unable to fetch fuel events', err);
    return [];
  }
};

const fetchDetectedFuelEvents = async (imei, fromMs, toMs) => {
  if (!imei || !Number.isFinite(fromMs) || !Number.isFinite(toMs)) return [];
  try {
    const Model = getModel(`${imei}_fuelevents`, Models.fuelEventSchema);
    if (!Model) return [];
    ensureFuelEventIndexes(Model);
    const dayMs = 86_400_000;
    const docs = await Model.find({ startMs: { $gte: fromMs, $lte: toMs + dayMs } })
      .sort({ startMs: 1 })
      .lean()
      .exec();
    return Array.isArray(docs) ? docs.map(mapFuelEventRecord).filter(Boolean) : [];
  } catch (err) {
    console.error('[history.fuelEvents] unable to fetch detected events', err);
    return [];
  }
};

const mergeFuelEvents = (lists = []) => {
  const merged = new Map();
  lists.flat().forEach((evt) => {
    if (!evt) return;
    const key = evt.eventId || `${evt.start}-${evt.end}-${evt.type}`;
    merged.set(key, evt);
  });
  return Array.from(merged.values());
};

const resolveBucketMs = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return HISTORY_BUCKET_MS;
  return Math.min(Math.max(numeric, HISTORY_BUCKET_MIN_MS), HISTORY_BUCKET_MAX_MS);
};

const HISTORY_IO_FIELDS = {
  ignition: "$io.ignition",
  ignitionState: "$io.ignitionState",
  engine: "$io.engine",
  engineStatus: "$io.engineStatus",
  speed: "$io.speed",
  vehicleSpeed: "$io.vehicleSpeed",
  vehicle_speed: "$io.vehicle_speed",
  movement: "$io.movement",
  vehicleMovement: "$io.vehicleMovement",
  motion: "$io.motion",
  moving: "$io.moving",
  totalOdometer: "$io.totalOdometer",
  odometer: "$io.odometer",
  tripOdometer: "$io.tripOdometer",
  mileage: "$io.mileage",
  current_fuel: "$io.current_fuel",
  currentFuel: "$io.currentFuel",
  fuel_total: "$io.fuel_total",
  fuel: "$io.fuel",
  tank: "$io.tank",
  tankLiters: "$io.tankLiters",
  tank1: "$io.tank1",
  tank_1: "$io.tank_1",
  tank2: "$io.tank2",
  tank_2: "$io.tank_2",
  tankPrimary: "$io.tankPrimary",
  tankSecondary: "$io.tankSecondary",
  primaryTankCapacity: "$io.primaryTankCapacity",
  secondaryTankCapacity: "$io.secondaryTankCapacity",
  current_fuel_percent: "$io.current_fuel_percent",
  currentFuelPercent: "$io.currentFuelPercent",
  fuel_percent: "$io.fuel_percent",
  tankPerc: "$io.tankPerc",
  driver1Id: "$io.driver1Id",
  driver1Name: "$io.driver1Name",
  driver1CardPresence: "$io.driver1CardPresence",
  driver1WorkingState: "$io.driver1WorkingState",
  driver2Id: "$io.driver2Id",
  driver2Name: "$io.driver2Name",
  driver2CardPresence: "$io.driver2CardPresence",
  driver2WorkingState: "$io.driver2WorkingState"
};

const HISTORY_GPS_FIELDS = {
  Longitude: "$gps.Longitude",
  Latitude: "$gps.Latitude",
  Speed: "$gps.Speed",
  Odometer: "$gps.Odometer",
  odometer: "$gps.odometer"
};

const buildHistoryPipeline = ({ fromDate, toDate, bucketMs }) => ([
  {
    $match: {
      timestamp: {
        $gt: fromDate,
        $lte: toDate,
      },
    },
  },
  { $sort: { timestamp: 1 } },
  {
    $project: {
      timestamp: 1,
      gps: HISTORY_GPS_FIELDS,
      io: HISTORY_IO_FIELDS
    }
  },
  {
    $group: {
      _id: {
        $toLong: {
          $subtract: [
            { $toLong: '$timestamp' },
            { $mod: [{ $toLong: '$timestamp' }, bucketMs] },
          ],
        },
      },
      doc: { $first: '$$ROOT' },
    },
  },
  { $replaceRoot: { newRoot: '$doc' } },
  { $sort: { timestamp: 1 } },
]);

const ensureIndexOnce = async (cache, key, task) => {
  if (cache.has(key)) return;
  cache.add(key);
  try {
    await task();
  } catch (err) {
    console.warn('[indexes] failed to create index for', key, err?.message || err);
    cache.delete(key);
  }
};

const ensureHistoryIndexes = (model) => {
  if (!model?.collection?.name) return;
  const key = `${model.collection.name}:timestamp`;
  void ensureIndexOnce(HISTORY_INDEX_CACHE, key, () =>
    model.collection.createIndex({ timestamp: 1 }, { background: true })
  );
};

const ensureFuelEventIndexes = (model) => {
  if (!model?.collection?.name) return;
  const key = `${model.collection.name}:startMs`;
  void ensureIndexOnce(FUEL_EVENT_INDEX_CACHE, key, () =>
    model.collection.createIndex({ startMs: 1 }, { background: true })
  );
};

const ensureRefuelingIndexes = (model) => {
  if (!model?.collection?.name) return;
  const key = `${model.collection.name}:eventStart`;
  void ensureIndexOnce(REFUEL_INDEX_CACHE, key, () =>
    model.collection.createIndex({ imei: 1, eventStart: 1 }, { background: true })
  );
};

const mapFuelAnalysis = (analysis = {}, metaExtras = {}) => {
  const history = Array.isArray(analysis.series)
    ? analysis.series.map((point) => ({
      time: point.timestamp,
      analog: roundValue(point.rawFuel, 2),
      smoothedAnalog: roundValue(point.smoothedFuel, 2),
      liters: roundValue(point.liters, 2),
      smoothedLiters: roundValue(point.smoothedLiters ?? point.liters, 2),
      deltaAnalog: roundValue(point.delta, 2),
      deltaLiters: roundValue(point.deltaLiters, 2),
      ratePerHourAnalog: roundValue(point.ratePerHour, 2),
      ratePerHourLiters: roundValue(point.ratePerHourLiters, 2),
      isIdle: point.isIdle,
      speed: point.speed,
      latitude: point.latitude,
      longitude: point.longitude,
      altitude: point.altitude
    }))
    : [];

  const events = Array.isArray(analysis.events)
    ? analysis.events.map((evt) => ({
      type: evt.type,
      startTime: evt.startTime,
      stopTime: evt.stopTime,
      durationMs: Number.isFinite(evt.durationMs) ? evt.durationMs : null,
      changeAnalog: roundValue(evt.change, 2),
      changeLiters: roundValue(evt.changeLiters ?? evt.liters, 2),
      startAnalog: roundValue(evt.startAnalog, 2),
      stopAnalog: roundValue(evt.stopAnalog, 2),
      startLiters: roundValue(evt.startLiters, 2),
      stopLiters: roundValue(evt.stopLiters, 2),
      latitude: evt.latitude ?? null,
      longitude: evt.longitude ?? null,
      altitude: evt.altitude ?? null
    }))
    : [];

  const stats = analysis.stats || {};
  const meta = {
    capacity: roundValue(metaExtras.capacity, 0),
    unit: metaExtras.unit || 'litres',
    tanks: metaExtras.tanks ?? null,
    analogMax: roundValue(metaExtras.analogMax ?? stats.analogMax, 2),
    analogMin: roundValue(metaExtras.analogMin ?? stats.analogMin, 2),
    analogPerLiter: roundValue(metaExtras.analogPerLiter ?? stats.unitsPerLiter, 6),
    literPerAnalog: roundValue(metaExtras.literPerAnalog ?? stats.literPerAnalog, 6),
    sampleCount: Number.isFinite(metaExtras.sampleCount)
      ? metaExtras.sampleCount
      : (Number.isFinite(stats.sampleCount) ? stats.sampleCount : history.length)
  };

  return {
    history,
    events,
    meta
  };
};



// Login
router.get('/', auth, async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;
  if (isProduction) {
    const distPath = path.join(__dirname, "..", "dist", "index.html");
    return res.sendFile(distPath);
  }

  const privilege = Number.isInteger(req.user?.privilege) ? req.user.privilege : null;
  const role = Number.isInteger(req.user?.role) ? req.user.role : null;

  return (res.render('dashboard/dashboard', {
    rParams: {
      user: {
        privilege,
        role,
        effectivePrivilege: getPrivilegeLevel(req.user)
      }
    }
  }));
});


router.get('/map', auth, async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;
  if (isProduction) {
    const distPath = path.join(__dirname, "..", "dist", "index.html");
    return res.sendFile(distPath);
  }

  var vehicles = await req.user.vehicles.list() || [];

  return (res.render('frames/mapFrame.ejs', { rParams: { vehicles } }))
})

// JSON vehicles API for the React dashboard.
// Returns user's vehicles with last known coordinates and fuel calibration.
router.get('/vehicles', auth, async (req, res) => {
  try {
    const list = await req.user.vehicles.list();
    const vehicles = Array.isArray(list) ? list : [];

    const imeis = vehicles.map((v) => v.imei).filter(Boolean);

    let calibrationByImei = {};
    try {
      if (imeis.length) {
        const calibrationList = await calibrateClusters(req, imeis);
        if (Array.isArray(calibrationList)) {
          calibrationByImei = Object.fromEntries(
            calibrationList.map((entry) => [`${entry.imei}`, entry])
          );
        }
      }
    } catch (err) {
      console.warn('[dashboard]/vehicles calibration error:', err?.message || err);
    }

    const enriched = await Promise.all(
      vehicles.map(async (vehicle) => {
        const src = vehicle.toObject ? vehicle.toObject({ getters: true, virtuals: false }) : vehicle;
        const imei = src.imei;
        let lat = null;
        let lon = null;

        if (imei) {
          try {
            const Model = getModel(`${imei}_monitoring`, avlSchema);
            const latest = await Model.findOne().sort({ timestamp: -1 }).lean();
            if (latest) {
              const gps = latest.gps || latest.data?.gps || latest;
              const toNumber = (val) => {
                const num = Number(val);
                return Number.isFinite(num) ? num : null;
              };
              lat = toNumber(
                gps?.lat ||
                gps?.latitude ||
                gps?.Latitude ||
                gps?.position?.lat ||
                gps?.position?.Latitude
              );
              lon = toNumber(
                gps?.lon ||
                gps?.lng ||
                gps?.longitude ||
                gps?.Longitude ||
                gps?.position?.lon ||
                gps?.position?.Longitude
              );
            }
          } catch (err) {
            console.error('[dashboard]/vehicles coordinates error for', imei, err?.message || err);
          }
        }

        return {
          ...src,
          lat,
          lon,
          fuelCalibration: calibrationByImei[`${imei}`] || null,
        };
      })
    );

    return res.status(200).json({ vehicles: enriched });
  } catch (err) {
    console.error('[dashboard]/vehicles error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});



router.post('/vehicles/:action', auth, async (req, res) => {
  if (!canManageVehicles(req.user)) {
    return res.status(403).json(permissionDeniedResponse("Non sei autorizzato ad eseguire quest'azione."));
  }


  const {
    nickname,
    plate,
    brand,
    model,
    imei,
    tags,
    deviceModel,
    codec,
    companyId,
    details,
    from,
    to,
    limit = 1000,
    skip = 0
  } = req.body;


  var device = null;




  switch (req.params.action) {
    case 'create':
      try {
        const sanitizedDetails = sanitizeDetailsForStorage(details);
        try {
          console.debug('[vehicles:create][backend] received details.sim', {
            iccid: sanitizedDetails?.sim?.iccid || null,
            number: sanitizedDetails?.sim?.number || null,
            prefix: sanitizedDetails?.sim?.prefix || null
          });
        } catch { }

        let ownerIds = [];
        if (getPrivilegeLevel(req.user) === 0) {
          const targetCompanyId = typeof companyId === 'string' ? companyId.trim() : '';
          if (!targetCompanyId) {
            return res.status(400).json(permissionDeniedResponse("Seleziona una azienda per il veicolo."));
          }
          const owners = await UserModel.find({ companyId: targetCompanyId }, { _id: 1 }).lean();
          ownerIds = owners.map((owner) => owner._id);
          if (!ownerIds.length) {
            return res.status(400).json(permissionDeniedResponse("Azienda selezionata senza utenti."));
          }
        }

        const vehicle = await req.user.vehicles.create({
          nickname,
          plate,
          brand,
          model,
          imei,
          codec,
          deviceModel,
          tags,
          details: sanitizedDetails,
          ownerIds,
        });

        await _Devices.authorize(imei, {
          label: nickname || plate,
          deviceModel
        });

        res.status(200).send(vehicle);
      } catch (err) {
        if (err?.code === 'PERMISSION_DENIED') {
          return res.status(403).json(permissionDeniedResponse("Non hai i permessi per creare o modificare veicoli."));
        }
        console.error("Errore creazione veicolo:", err);
        res.status(500).send({ message: "Errore interno" });
      }
      break;
    case 'update':
      try {
        const vehicleId = typeof req.body.id === 'string' ? req.body.id.trim() : '';
        if (!vehicleId) {
          return res.status(400).json({ message: 'ID veicolo richiesto.' });
        }

        const existing = await Vehicles.findById(vehicleId);
        if (!existing) {
          return res.status(404).json({ message: 'Veicolo non trovato.' });
        }

        const ownsVehicle = await ensureVehicleOwnership(req.user, existing.imei);
        if (!ownsVehicle) {
          return res.status(404).json({ message: 'Veicolo non trovato.' });
        }

        const oldPlate = decryptString(existing.plateEnc || '') || '';
        const oldBrand = decryptString(existing.brandEnc || '') || '';
        const oldModel = decryptString(existing.modelEnc || '') || '';

        const nextPlate = typeof plate === 'string' ? plate.trim() : '';
        const nextBrand = typeof brand === 'string' ? brand.trim() : '';
        const nextModel = typeof model === 'string' ? model.trim() : '';

        const plateChanged = nextPlate && nextPlate.toLowerCase() !== oldPlate.trim().toLowerCase();
        const brandChanged = nextBrand && nextBrand.toLowerCase() !== oldBrand.trim().toLowerCase();
        const modelChanged = nextModel && nextModel.toLowerCase() !== oldModel.trim().toLowerCase();
        const monitoringPolicy =
          req.body.monitoringPolicy === 'rename'
            ? 'rename'
            : req.body.monitoringPolicy === 'append'
              ? 'append'
              : null;

        if ((plateChanged || brandChanged || modelChanged) && !monitoringPolicy) {
          return res.status(409).send('Seleziona come gestire lo storico per targa/marca/modello aggiornati.');
        }

        if (monitoringPolicy === 'rename' && (plateChanged || brandChanged || modelChanged)) {
          try {
            await renameMonitoringCollection(existing.imei, oldPlate || nextPlate);
          } catch (err) {
            console.error('[vehicles:update] rename monitoring failed', err);
            return res.status(500).json({ message: 'Impossibile rinominare lo storico.' });
          }
        }

        const sanitizedDetails = sanitizeDetailsForStorage(details);
        const normalizedTags = Array.isArray(tags)
          ? tags.map((tag) => String(tag).trim()).filter(Boolean)
          : [];

        const update = {
          nickname: typeof nickname === 'string' ? nickname.trim() : existing.nickname,
          plateEnc: encryptString(nextPlate || oldPlate),
          brandEnc: encryptString(nextBrand || oldBrand),
          modelEnc: encryptString(nextModel || oldModel),
          detailsEnc: encryptJSON(sanitizedDetails),
          deviceModel: typeof deviceModel === 'string' ? deviceModel.trim() : existing.deviceModel,
          codec: typeof codec === 'string' ? codec.trim() : existing.codec,
          tags: normalizedTags
        };

        const updated = await Vehicles.findByIdAndUpdate(vehicleId, { $set: update }, { new: true });
        return res.status(200).json({ vehicle: updated });
      } catch (err) {
        if (err?.code === 'PERMISSION_DENIED') {
          return res.status(403).json(permissionDeniedResponse("Non hai i permessi per modificare veicoli."));
        }
        console.error("Errore aggiornamento veicolo:", err);
        return res.status(500).send({ message: "Errore interno" });
      }
    case 'delete':
      try {
        const vehicleId = typeof req.body.id === 'string' ? req.body.id.trim() : '';
        if (!vehicleId) {
          return res.status(400).json({ message: 'ID veicolo richiesto.' });
        }

        const existing = await Vehicles.findById(vehicleId);
        if (!existing) {
          return res.status(404).json({ message: 'Veicolo non trovato.' });
        }

        const ownsVehicle = await ensureVehicleOwnership(req.user, existing.imei);
        if (!ownsVehicle) {
          return res.status(404).json({ message: 'Veicolo non trovato.' });
        }

        await Vehicles.findByIdAndDelete(vehicleId);
        if (Array.isArray(existing.owner) && existing.owner.length) {
          await Models.UserModel.updateMany(
            { _id: { $in: existing.owner } },
            { $pull: { vehicles: vehicleId } }
          );
        }
        if (existing.imei) {
          await _Devices.unauthorize(existing.imei);
        }
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error("Errore eliminazione veicolo:", err);
        return res.status(500).send({ message: "Errore interno" });
      }
  }
});


router.post('/history/:action?', auth, imeiOwnership, async (req, res) => {
  const { action } = req.params;
  const { from, to, imei, bucketMs: bucketMsRaw } = req.body;

  const normaliseDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  };

  const fromDate = normaliseDate(from);
  const toDate = normaliseDate(to);

  if (!fromDate || !toDate || toDate < fromDate) {
    return res.status(400).json({ message: 'Intervallo non valido.' });
  }

  const fromMs = fromDate.getTime();
  const toMs = toDate.getTime();
  const bucketMs = resolveBucketMs(bucketMsRaw);

  const model = getModel(`${imei}_monitoring`, avlSchema);
  ensureHistoryIndexes(model);
  const historyStages = buildHistoryPipeline({ fromDate, toDate, bucketMs });

  switch (action) {
    case 'preview':
      try {
        const [aggregation, first, last] = await Promise.all([
          model.aggregate([...historyStages, { $count: 'total' }]).allowDiskUse(true),
          model.findOne({ timestamp: { $gt: fromDate, $lte: toDate } }).sort({ timestamp: 1 }),
          model.findOne({ timestamp: { $gt: fromDate, $lte: toDate } }).sort({ timestamp: -1 }),
        ]);
        const count = Number(aggregation?.[0]?.total) || 0;
        const chunks = Math.max(1, Math.ceil(count / 1000));
        return res.status(200).json({ count, chunks, first, last, bucketMs });
      } catch (err) {
        console.error('[history.preview] aggregation failed', err);
        return res.status(500).json({ message: 'Impossibile calcolare l\'anteprima.' });
      }

    case 'events':
      try {
        const [refuelEvents, detectedEvents] = await Promise.all([
          fetchFuelEventsForRange(imei, fromMs, toMs),
          fetchDetectedFuelEvents(imei, fromMs, toMs)
        ]);
        const fuelEvents = mergeFuelEvents([refuelEvents, detectedEvents]);
        return res.status(200).json({ fuelEvents });
      } catch (err) {
        console.error('[history.events] aggregation failed', err);
        return res.status(500).json({ message: 'Impossibile recuperare gli eventi carburante.' });
      }

    case 'get':
      try {
        const [raw, refuelEvents, detectedEvents] = await Promise.all([
          model.aggregate(historyStages).allowDiskUse(true),
          fetchFuelEventsForRange(imei, fromMs, toMs),
          fetchDetectedFuelEvents(imei, fromMs, toMs)
        ]);
        const fuelEvents = mergeFuelEvents([refuelEvents, detectedEvents]);
        return res.status(200).json({ raw, fuelEvents, bucketMs });
      } catch (err) {
        console.error('[history.get] aggregation failed', err);
        return res.status(500).json({ message: 'Impossibile recuperare la cronologia.' });
      }

    default:
      return res.status(200).json({ m: 'OK' });
  }
});


router.post('/calibrate/:cluster?', auth, async (req, res) => {
  const { imeis } = req.body;

  var result = await calibrateClusters(req, imeis);

  return res.status(200).json(result);
});


router.post('/fuel', auth, imeiOwnership, async (req, res) => {
  if (!req.vehicle || !req.user) {
    return res.status(500).json({ message: 'Errore server, contattare il supporto.' });
  }

  try {
    const {
      from,
      to,
      imei,
      reduceBy,
      medianWindow,
      averageWindow,
      noiseLiters,
      minEventLiters,
      reduceModuloSeconds
    } = req.body;

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime()) || toDate <= fromDate) {
      return res.status(400).json({ message: 'Intervallo non valido.' });
    }

    const vehicleRecord = req.vehicle?.record || null;
    const rawDetails = vehicleRecord ? parseVehicleDetails(vehicleRecord.detailsEnc) : null;
    const tanks = normalizeTankDetails(rawDetails);
    const totalCapacity = tanks?.totalCapacity ?? null;
    const unit = tanks?.unit ?? null;

    const requestedUnitsPerLiter = Number(req.body.unitsPerLiter);
    const unitsPerLiter = Number.isFinite(requestedUnitsPerLiter) && requestedUnitsPerLiter > 0
      ? requestedUnitsPerLiter
      : null;

    const analysisOptions = {
      medianWindow: Number(medianWindow),
      averageWindow: Number(averageWindow),
      noiseLiters: Number(noiseLiters),
      minEventLiters: Number(minEventLiters),
      capacity: totalCapacity,
      reduceModuloSeconds: Number(reduceModuloSeconds),
      reduceBy: Number(reduceBy),
      unitsPerLiter
    };

    const analyst = new FuelAnalyst();
    const analysis = await analyst.buildHistory(imei, fromDate, toDate, analysisOptions);

    const step = Number.isInteger(reduceBy) && reduceBy > 1 ? reduceBy : 1;
    const sampledSeries = step > 1
      ? (Array.isArray(analysis?.series) ? analysis.series.filter((_, idx) => idx % step === 0 || idx === analysis.series.length - 1) : [])
      : (analysis?.series || []);

    const analogMax = analysis?.stats?.analogMax ?? null;
    const analogPerLiter = analysis?.stats?.unitsPerLiter ?? null;
    const inferredCapacity = (totalCapacity ?? ((analogPerLiter && analogMax) ? analogMax / analogPerLiter : null)) || null;

    const downsampledAnalysis = {
      ...analysis,
      series: sampledSeries
    };

    const payload = mapFuelAnalysis(downsampledAnalysis, {
      capacity: inferredCapacity,
      unit: unit || 'litres',
      tanks,
      analogPerLiter: unitsPerLiter ?? analysis?.stats?.unitsPerLiter,
      analogMax: analysis?.stats?.analogMax,
      analogMin: analysis?.stats?.analogMin,
      sampleCount: sampledSeries.length
    });

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[fuel] unable to analyze fuel history:', err);
    return res.status(500).json({ message: 'Errore interno nell\'analisi del carburante.' });
  }
})

router.get('/refuelings/:imei', auth, async (req, res) => {
  const { imei } = req.params;
  if (!imei) {
    return res.status(400).json({ message: 'IMEI richiesto.' });
  }

  const ownsVehicle = await ensureVehicleOwnership(req.user, imei);
  if (!ownsVehicle) {
    return res.status(404).json({ message: 'Veicolo non trovato.' });
  }

  try {
    const Model = getRefuelingModel(imei);
    const docs = await Model.find({ imei }).sort({ eventStart: -1 });
    const payload = docs.map(mapRefuelingDoc).filter(Boolean);
    return res.status(200).json({ items: payload });
  } catch (err) {
    console.error('[refuelings.list] errore nel recupero', err);
    return res.status(500).json({ message: 'Impossibile recuperare i rifornimenti.' });
  }
});

router.post('/refuelings', auth, async (req, res) => {
  const {
    imei,
    eventId,
    eventStart,
    eventEnd,
    liters,
    pricePerUnit,
    tankPrimary,
    tankSecondary,
    station,
    invoiceRef,
    eventMeta,
    source
  } = req.body || {};

  if (!imei || !eventId) {
    return res.status(400).json({ message: 'imei ed eventId sono obbligatori.' });
  }

  const ownsVehicle = await ensureVehicleOwnership(req.user, imei);
  if (!ownsVehicle) {
    return res.status(404).json({ message: 'Veicolo non trovato o non associato all\'utente.' });
  }

  const startDate = parseDateInput(eventStart);
  const endDate = parseDateInput(eventEnd);
  if (!startDate || !endDate || endDate < startDate) {
    return res.status(400).json({ message: 'Intervallo evento non valido.' });
  }

  let attachments = [];
  try {
    attachments = encodeAttachments(req.files?.attachments);
  } catch (err) {
    return res.status(400).json({ message: err.message || 'File non valido.' });
  }

  let metadata = {};
  if (eventMeta) {
    try {
      const parsed = typeof eventMeta === 'string' ? JSON.parse(eventMeta) : eventMeta;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed;
      }
    } catch (err) {
      console.warn('[refuelings] Impossibile parsare eventMeta', err);
    }
  }
  metadata = {
    ...metadata,
    source: typeof source === 'string' && source.length ? source : (metadata.source || 'manual')
  };

  const setPayload = {
    imei: `${imei}`,
    eventId: `${eventId}`,
    eventStart: startDate,
    eventEnd: endDate,
    liters: toFiniteNumber(liters),
    pricePerUnit: toFiniteNumber(pricePerUnit),
    tankPrimary: toFiniteNumber(tankPrimary),
    tankSecondary: toFiniteNumber(tankSecondary),
    station: typeof station === 'string' ? station.trim() || null : null,
    invoiceRef: typeof invoiceRef === 'string' ? invoiceRef.trim() || null : null,
    metadata
  };

  const update = { $set: setPayload };
  if (attachments.length) {
    update.$set.attachments = attachments;
  }

  try {
    const Model = getRefuelingModel(imei);
    const doc = await Model.findOneAndUpdate(
      { imei: `${imei}`, eventId: `${eventId}` },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const mapped = mapRefuelingDoc(doc);
    return res.status(200).json({ item: mapped });
  } catch (err) {
    console.error('[refuelings.save] errore salvataggio', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Evento rifornimento gi� registrato.' });
    }
    return res.status(500).json({ message: 'Impossibile salvare il rifornimento.' });
  }
});

router.post('/tooltip/:action?', auth, imeiOwnership, async (req, res) => {
  const safeNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const { vehicle, device, status, imei, fuelSummary } = req.body || {};


  const io = device?.data?.io || {};


  var driver = io.tachoDriverIds ? _Drivers.get(io.tachoDriverIds.driver1) : null;



  var driverEvents = [{ to_state_name: "unlogged", eventflags: ["rest_start"] }];
  if (driver) {
    var _hist = await driver.relevanthistory()
    driverEvents = _hist.length > 0 ? _hist : driverEvents;
  }


  switch (req.params.action) {
    case 'mainmap':
      res.render('wrappers/vehicleTooltip.ejs', {
        vehicle,
        device,
        status,
        fuelSummary,
        driverEvents,

        formatDate: (d) => new Date(d).toLocaleString('it-IT')
      });
      break;
    default:
      res.status(400).json({ message: 'Azione tooltip non supportata.' });
  }
});


router.get('/test/tooltip', auth, async (req, res) => {
  // Dati mock per testare il rendering
  const mockVehicle = {
    imei: '356789123456789',
    nickname: 'Volvo FH16',
    plate: { v: 'AB123CD' }
  };

  const mockDevice = {
    data: {
      timestamp: Date.now(),
      io: { driver1Id: 'I100000569493003', tachoDriverIds: { driver1: "I100000569493003" }, driver1CardPresence: 1, driver1WorkingState: 3 },
      gps: {
        Latitude: 15,
        Longitude: 15,
        Speed: 400,
        Location: {
          City: "Ladispoli",
          Zip: "80120",
          Address: "Via Delle Milizie 22",
          Provence: "RO",
        }
      }
    }
  };

  const mockStatus = {
    class: 'success',
    status: 'In marcia'
  };

  const mockData = {
    vehicle: mockVehicle,
    device: mockDevice,
    status: mockStatus,
    fuelSummary: {
      liters: 612,
      capacity: 800,
      percent: 0.765,
      tank1Capacity: 400,
      tank2Capacity: 400,
      unit: 'litri'
    },
    timeLeft: '73%',
    formatDate: (d) => new Date(d).toLocaleString('it-IT'),
    driverEvents: [
      {
        _id: new String("69090522998b18598ea73de8"),
        timestamp: "2025-10-20T04:14:00.863Z",
        from_state: 0,
        to_state: 3,
        from_state_name: 'resting',
        to_state_name: 'driving',
        lat: 43.721905,
        lng: 10.7719833,
        eventflags: ['drive_start', 'rest_stop'],
        elapsed: 7642
      },
      {
        _id: new String("69090522998b18598ea73deb"),
        timestamp: "2025-10-20T04:42:01.001Z",
        from_state: 3,
        to_state: 2,
        from_state_name: 'driving',
        to_state_name: 'working',
        lat: 43.6586233,
        lng: 10.6065316,
        eventflags: ['drive_stop', 'work_start'],
        elapsed: 7643
      },
      {
        _id: new String("69090522998b18598ea73ded"),
        timestamp: "2025-10-20T05:19: 20.187Z",
        from_state: 2,
        to_state: 0,
        from_state_name: 'working',
        to_state_name: 'resting',
        lat: 43.6586333,
        lng: 10.6065116,
        eventflags: ['work_stop', 'rest_start'],
        elapsed: 270
      },
      {
        _id: new String("69090522998b18598ea73def"),
        timestamp: "2025-10-20T05:20:00.188Z",
        from_state: 0,
        to_state: 3,
        from_state_name: 'resting',
        to_state_name: 'driving',
        lat: 43.6587266,
        lng: 10.60687,
        eventflags: ['drive_start', 'rest_stop'],
        elapsed: 1642
      },
      {
        _id: new String("69090522998b18598ea73df1"),
        timestamp: "2025-10-20T05:23:00.202Z",
        from_state: 3,
        to_state: 2,
        from_state_name: 'driving',
        to_state_name: 'working',
        lat: 43.6575116,
        lng: 10.6072033,
        eventflags: ['drive_stop', 'work_start'],
        elapsed: 1642
      },
      {
        _id: new String("69090522998b18598ea73df3"),
        timestamp: "2025-10-20T05:25:00.212Z",
        from_state: 2,
        to_state: 3,
        from_state_name: 'working',
        to_state_name: 'driving',
        lat: 43.6575533,
        lng: 10.6071866,
        eventflags: ['drive_start', 'work_stop'],
        elapsed: 2160
      },
      {
        _id: new String("69090522998b18598ea73df5"),
        timestamp: "2025-10- 20T0800: 46.988Z",
        from_state: 3,
        to_state: 0,
        from_state_name: 'driving',
        to_state_name: 'resting',
        lat: 43.6575216,
        lng: 10.6072233,
        eventflags: ['drive_stop', 'rest_start'],
        elapsed: 228
      },
      {
        _id: new String("69090522998b18598ea73df7"),
        timestamp: "2025-10-20T08:29:00.124Z",
        from_state: 0,
        to_state: 3,
        from_state_name: 'resting',
        to_state_name: 'driving',
        lat: 43.6570183,
        lng: 10.607705,
        eventflags: ['drive_start', 'rest_stop'],
        elapsed: 9643
      },
      {
        _id: new String("69090522998b18598ea73df9"),
        timestamp: "2025-10-20T08:30:00.129Z",
        from_state: 3,
        to_state: 2,
        from_state_name: 'driving',
        to_state_name: 'working',
        lat: 43.6570183,
        lng: 10.6077083,
        eventflags: ['drive_stop', 'work_start'],
        elapsed: 9643
      },
      {
        _id: new String("69090522998b18598ea73dfb"),
        timestamp: "2025-10-20T08: 39:00.173Z",
        from_state: 2,
        to_state: 0,
        from_state_name: 'working',
        to_state_name: 'resting',
        lat: 43.6570233,
        lng: 10.607705,
        eventflags: ['work_stop', 'rest_start'],
        elapsed: 643
      }
    ]
  };

  res.render('wrappers/vehicleTooltip', mockData);
});


router.get('/test/riepilogodriver', auth, async (req, res) => {

  var { d = "", from, to } = req.query;
  return (res.render('wrappers/riepilogoDriver',))

})


router.post('/fueldump', auth, imeiOwnership, async (req, res) => {
  try {
    let { imei, from, to } = req.body;


    

    if (!imei || !from || !to) {
      return res.status(400).json({ error: "imei, from e to sono obbligatori" });
    }



    const HISTORY_BUCKET_MS = 300_000;

    const fuelStages = [
      {
        $match: {
          timestamp: { $gt: new Date(from), $lte: new Date(to) },

          "io.current_fuel": { $exists: true, $ne: null },
          "io.tank1": { $exists: true, $ne: null },
          "io.tank2": { $exists: true, $ne: null }


        }
      },

      {
        $group: {
          _id: {
            $toLong: {
              $subtract: [
                { $toLong: "$timestamp" },
                { $mod: [{ $toLong: "$timestamp" }, HISTORY_BUCKET_MS] }
              ]
            }
          },
          doc: { $first: "$$ROOT" }
        }
      },

      {
        $project: {
          _id: 0,
          gps: "$doc.gps",
          timestamp: "$doc.timestamp",
          current_fuel: "$doc.io.current_fuel",
          tank1: "$doc.io.tank1",
          tank2: "$doc.io.tank2",
          odometer: "$doc.io.odometer",
          io: {
            current_fuel: "$doc.io.current_fuel",
            currentFuel: "$doc.io.currentFuel",
            fuel_total: "$doc.io.fuel_total",
            fuel: "$doc.io.fuel",
            tank: "$doc.io.tank",
            tankLiters: "$doc.io.tankLiters",
            tank1: "$doc.io.tank1",
            tank2: "$doc.io.tank2",
            odometer: "$doc.io.odometer",
            totalOdometer: "$doc.io.totalOdometer",
            tripOdometer: "$doc.io.tripOdometer",
            mileage: "$doc.io.mileage",
            movement: "$doc.io.movement",
            vehicleMovement: "$doc.io.vehicleMovement",
            motion: "$doc.io.motion",
            moving: "$doc.io.moving",
            vehicleSpeed: "$doc.io.vehicleSpeed",
            speed: "$doc.io.speed",
            vehicle_speed: "$doc.io.vehicle_speed",
            ignition: "$doc.io.ignition",
            ignitionState: "$doc.io.ignitionState",
            engine: "$doc.io.engine",
            engineStatus: "$doc.io.engineStatus",
            driver1Id: "$doc.io.driver1Id",
            driver1Name: "$doc.io.driver1Name",
            driver1CardPresence: "$doc.io.driver1CardPresence",
            driver1WorkingState: "$doc.io.driver1WorkingState",
            driver2Id: "$doc.io.driver2Id",
            driver2Name: "$doc.io.driver2Name",
            driver2CardPresence: "$doc.io.driver2CardPresence",
            driver2WorkingState: "$doc.io.driver2WorkingState"
          }
        }
      },

      { $sort: { timestamp: 1 } }
    ];


    const model = getModel(`${imei}_monitoring`, Models.avlSchema);
    const results = await model.aggregate(fuelStages).allowDiskUse(true);
    const femodel = getModel(`${imei}_fuelevents`, Models.fuelEventSchema)
    const events = await femodel.find({ startMs: { $gt: from, $lte: to } });
    

    return res.json({
      imei,
      from,
      to,
      count: results.length,
      data: results,
      events
    });

  } catch (err) {
    console.error("fueldump error:", err);
    return res.status(500).json({ error: "Errore interno" });
  }
});


router.post('/fuelevents/:action?', auth, imeiOwnership, async (req, res) => {
  let { imei, from, to } = req.body;
  switch (req.params.action) {

    case 'history':
      let model = getModel(`${imei}_fuelevents`, Models.fuelEventSchema);
      var dayms = 86_400_000;
      var start = new Date(from).getTime();
      var stop = new Date(to).getTime() + dayms;
      var _res = await model.find({ startMs: { $gte: start, $lte: stop } })//startMs:{$gte:start}, endMs:{$lte:stop}});       
      return res.status(200).send(_res)
  }

})


router.post('/driverdump', auth, imeiOwnership, async (req, res) => {
  const { driver, imei } = req.body;
  let model = getModel(`driver_${driver}_history`, Models.driverEventSchema);
  let now = new Date();
  let b = new Date(now.getTime() - (now.getTime() % 86_400_000));
  
  var dayOfWeek = b.getDay();

  const totalDays = 7 + dayOfWeek;
  b.setHours(-(24 * totalDays), 0, 0);

  const history = await model.find({timestamp:{$gte:new Date(b), $lt:new Date()  }})
  
  var first = history?.at(0);
  if(!first) return(res.status(200).send([])); 
  var filtered = []
  for(var i = 0; i < history.length; i++){
    
    var record = history[i]; 
    if(i == 0 || i == history.length -1) {filtered.push(record); continue;}
    var delta = new Date(record.timestamp).getTime() - new Date(first.timestamp).getTime()
    var minDelta = 60 * 60 * 1000; 
    var prev_status  = first.to_state;
    var current_status = record.to_state; 
     
    if(delta < minDelta ||current_status == prev_status) continue; 
    filtered.push(record);


  }

  

  let tachoDriver = null;
  if (driver) {
    try {
      const companies = await TachoSync.companies();
      
      const list = Array.isArray(companies?.items) ? companies.items : Array.isArray(companies) ? companies : [];
      const queue = [];
      const enqueue = (c) => {
        if (!c) return;
        queue.push(c);
        if (Array.isArray(c.childCompanies)) {
          c.childCompanies.forEach(enqueue);
        }
      };
      list.forEach(enqueue);
      for (const company of queue) {
        const drivers = await TachoSync.drivers(company.id);
        
        
        const match = Array.isArray(drivers) ? drivers.find((d) => `${d.cardNumber}` === `${driver}`) : null;
        
        if (match) {
          tachoDriver = { ...match, company: match.company || { id: company.id, name: company.name } };
          break;
        }
      }
    } catch (err) {
      console.warn('[driverdump] unable to fetch tacho driver', err?.message || err);
    }
  }

  res.status(200).send({count: filtered.length ?? 0, data: filtered ?? [], tacho: tachoDriver});
})

router.post('/drivers/:action?', auth, async (req, res) => {
  let { imei, from, to, d } = req.body;
  switch (req.params.action) {

    case 'history':
      if (!d) {
        return res.status(400).json({ message: 'Driver id mancante' });
      }
      let model = getModel(`driver_${d}_history`, Models.driverEventSchema);
      var start = new Date(from).getTime();
      var stop = new Date(to).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(stop)) {
        return res.status(400).json({ message: 'Intervallo non valido' });
      }

      var _res = await model.find({ timestamp: { $gte: new Date(start), $lte: new Date(stop) } }).sort({ timestamp: 1 });
      return (res.status(200).send(_res))
  }

})





module.exports = router;
