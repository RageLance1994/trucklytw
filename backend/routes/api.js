const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { auth, imeiOwnership } = require('../utils/users');
const { Vehicles, getModel, avlSchema, getRefuelingModel, fuelEventSchema } = require('../Models/Schemes');
const { decryptString, decryptJSON } = require('../utils/encryption');
const { _Users } = require('../utils/database');
const { SeepTrucker } = require('../utils/seep');

const router = express.Router();
const HISTORY_BUCKET_MS = 60_000;

router.get('/session', async (req, res) => {
  const token = req.cookies?.auth_token;
  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const user = await _Users.get(token);
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    let companyName = null;
    if (user.companyEnc) {
      try {
        companyName = decryptString(user.companyEnc);
      } catch (err) {
        console.warn('[api] /session company decrypt error:', err?.message || err);
      }
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        companyName,
      },
    });
  } catch (err) {
    console.error('[api] /session error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Helper used by /api/vehicles to decrypt Enc fields
function decorateVehicle(raw) {
  if (!raw || typeof raw !== 'object') return raw;

  const v = { ...raw };

  try {
    if (v.plateEnc) {
      v.plate = decryptString(v.plateEnc);
    }
    if (v.brandEnc) {
      v.brand = decryptString(v.brandEnc);
    }
    if (v.modelEnc) {
      v.model = decryptString(v.modelEnc);
    }
    if (v.detailsEnc) {
      v.details = decryptJSON(v.detailsEnc);
    }
  } catch (e) {
    console.error('[api] decorateVehicle decryption error:', e.message);
  }

  return v;
}

// Lightweight JSON API for the React/Vite frontend.
// Returns the user's vehicles plus last known coordinates, similar
// to the Next.js /api/vehicles endpoint in truckly-refactor.
router.get('/vehicles', auth, async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const ownerValues = [user.id];
    if (mongoose.Types.ObjectId.isValid(user.id)) {
      ownerValues.push(new mongoose.Types.ObjectId(user.id));
    }

    const rows = await Vehicles.find({ owner: { $in: ownerValues } }).lean();

    // For each vehicle, fetch the latest monitoring document to derive lat/lon
    const vehiclesWithNulls = await Promise.all(
      rows.map(async (vehicle) => {
        const imei = vehicle.imei;
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
          } catch (e) {
            console.error('[api] /vehicles coordinates error for', imei, e.message);
          }
        }

        const decorated = decorateVehicle(vehicle);

        // Do not send vehicles without decrypted core fields
        if (!decorated.plate || !decorated.brand || !decorated.model || !decorated.details) {
          console.warn(
            '[api] /vehicles skipping vehicle missing decrypted fields',
            vehicle._id?.toString?.() || vehicle._id
          );
          return null;
        }

        return {
          ...decorated,
          lat,
          lon,
        };
      })
    );

    const vehicles = vehiclesWithNulls.filter(Boolean);

    return res.status(200).json({ vehicles });
  } catch (err) {
    console.error('[api] /vehicles error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

  const startMs = toFiniteNumber(source.startMs)
    ?? toMillis(source.start)
    ?? toMillis(source.eventStart);
  const endMs = toFiniteNumber(source.endMs)
    ?? toMillis(source.end)
    ?? toMillis(source.eventEnd)
    ?? startMs;

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
        },
        {
          eventStart: { $lte: new Date(toMs) },
          eventEnd: { $gte: new Date(fromMs) }
        }
      ]
    })
      .sort({ startMs: 1, start: 1 })
      .lean()
      .exec();

    return Array.isArray(docs) ? docs.map(mapFuelEventRecord).filter(Boolean) : [];
  } catch (err) {
    console.error('[api.fuel.history] unable to fetch fuel events', err);
    return [];
  }
};

const fetchDetectedFuelEvents = async (imei, fromMs, toMs) => {
  if (!imei || !Number.isFinite(fromMs) || !Number.isFinite(toMs)) return [];
  try {
    const Model = getModel(`${imei}_fuelevents`, fuelEventSchema);
    if (!Model) return [];
    const dayMs = 86_400_000;
    const docs = await Model.find({ startMs: { $gte: fromMs, $lte: toMs + dayMs } })
      .sort({ startMs: 1 })
      .lean()
      .exec();
    return Array.isArray(docs) ? docs.map(mapFuelEventRecord).filter(Boolean) : [];
  } catch (err) {
    console.error('[api.fuel.history] unable to fetch detected events', err);
    return [];
  }
};

router.post('/fuel/history', auth, imeiOwnership, async (req, res) => {
  const { from, to, imei } = req.body;

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
  const model = getModel(`${imei}_monitoring`, avlSchema);

  const historyStages = [
    {
      $match: {
        timestamp: {
          $gt: fromDate,
          $lte: toDate,
        },
      },
    },
    {
      $group: {
        _id: {
          $toLong: {
            $subtract: [
              { $toLong: '$timestamp' },
              { $mod: [{ $toLong: '$timestamp' }, HISTORY_BUCKET_MS] },
            ],
          },
        },
        doc: { $first: '$$ROOT' },
      },
    },
  ];

  try {
    const [raw, refuelEvents, detectedEvents] = await Promise.all([
      model.aggregate([
        ...historyStages,
        { $replaceRoot: { newRoot: '$doc' } },
        { $sort: { timestamp: 1 } },
      ]),
      fetchFuelEventsForRange(imei, fromMs, toMs),
      fetchDetectedFuelEvents(imei, fromMs, toMs)
    ]);
    const merged = new Map();
    [...refuelEvents, ...detectedEvents].forEach((evt) => {
      if (!evt) return;
      const key = evt.eventId || `${evt.start}-${evt.end}-${evt.type}`;
      merged.set(key, evt);
    });
    return res.status(200).json({ raw, fuelEvents: Array.from(merged.values()) });
  } catch (err) {
    console.error('[api.fuel.history] aggregation failed', err);
    return res.status(500).json({ message: 'Impossibile recuperare la cronologia.' });
  }
});

// === SeepTrucker test endpoint ===
// POST /api/seep/test
// Body: { driverId, startDate, endDate, timezone, regulation, penalty, onlyInfringementsGraphs, ignoreCountrySelectedInfringements }
// Optionally attach a multipart file under field "file" to upload a DDD before analysis.
router.post('/seep/test', async (req, res) => {
  try {
    const {
      driverId,
      startDate,
      endDate,
      timezone = 'UTC',
      regulation = 0,
      penalty = 0,
      onlyInfringementsGraphs = false,
      ignoreCountrySelectedInfringements = false,
    } = req.body || {};

    if (!driverId || !startDate || !endDate) {
      return res.status(400).json({ error: 'driverId, startDate, endDate are required' });
    }

    // Authenticate each call; wrapper caches token info internally
    await SeepTrucker.auth();

    // If a DDD file is provided, upload it first
    if (req.files && req.files.file) {
      const uploaded = req.files.file;
      const tmpPath = path.join(__dirname, '..', 'uploads', uploaded.name);
      await uploaded.mv(tmpPath);
      try {
        await SeepTrucker.uploadFile(tmpPath);
      } finally {
        try {
          fs.unlinkSync(tmpPath);
        } catch {}
      }
    }

    // Driver activity analysis to retrieve SVG graphs
    const analysis = await SeepTrucker.driverActivity({
      driverId,
      startDate,
      endDate,
      regulation,
      penalty,
      onlyInfringementsGraphs,
      ignoreCountrySelectedInfringements,
      timezone,
    });

    const graphs = SeepTrucker.extractDriverGraphs(analysis);

    return res.status(200).json({ analysis, graphs });
  } catch (err) {
    console.error('[api] /seep/test error:', err.message);
    return res.status(500).json({ error: err.message || 'INTERNAL_ERROR' });
  }
});
