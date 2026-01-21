const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { auth, imeiOwnership } = require('../utils/users');
const { Vehicles, Companies, UserModel, getModel, avlSchema, getRefuelingModel, fuelEventSchema } = require('../Models/Schemes');
const { decryptString, decryptJSON, encryptString, encryptJSON } = require('../utils/encryption');
const { _Users } = require('../utils/database');
const { SeepTrucker } = require('../utils/seep');
const { TachoSync } = require('../utils/tacho');

const router = express.Router();
const HISTORY_BUCKET_MS = 60_000;

const isSuperAdmin = (user) => {
  const role = Number.isInteger(user?.role) ? user.role : null;
  return Number.isInteger(role) && role <= 1;
};

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
    const companyId = user.companyId || null;
    if (companyId) {
      try {
        const company = await Companies.findById(companyId).lean();
        companyName = company?.name || null;
      } catch (err) {
        console.warn('[api] /session company lookup error:', err?.message || err);
      }
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        companyId,
        companyName,
        role: Number.isInteger(user.role) ? user.role : null,
        privilege: Number.isInteger(user.privilege) ? user.privilege : null,
      },
    });
  } catch (err) {
    console.error('[api] /session error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/admin/companies', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const search = String(req.query.search || '').trim();
  const sortFieldRaw = String(req.query.sortField || 'name');
  const sortDirRaw = String(req.query.sortDir || 'asc').toLowerCase();
  const sortDir = sortDirRaw === 'desc' ? -1 : 1;
  const sortFields = new Set(['name', 'createdAt', 'updatedAt', 'status']);
  const sortField = sortFields.has(sortFieldRaw) ? sortFieldRaw : 'name';

  const filter = search ? { name: { $regex: search, $options: 'i' } } : {};

  try {
    const companies = await Companies.find(filter).sort({ [sortField]: sortDir }).lean();
    const companyIds = companies.map((company) => company._id);
    const users = await UserModel.find({ companyId: { $in: companyIds } }).lean();

    const usersByCompany = new Map();
    users.forEach((user) => {
      const key = user.companyId?.toString?.() || '';
      if (!usersByCompany.has(key)) usersByCompany.set(key, []);
      usersByCompany.get(key).push({
        id: user._id?.toString?.() || user._id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email,
        role: Number.isInteger(user.role) ? user.role : null,
        privilege: Number.isInteger(user.privilege) ? user.privilege : null,
        status: Number.isInteger(user.status) ? user.status : null,
        createdAt: user.createdAt || null,
      });
    });

    const payload = companies.map((company) => {
      const key = company._id?.toString?.() || '';
      const list = usersByCompany.get(key) || [];
      list.sort((a, b) => (a.privilege ?? 99) - (b.privilege ?? 99));
      return {
        id: key,
        name: company.name,
        status: company.status ?? 0,
        createdAt: company.createdAt || null,
        updatedAt: company.updatedAt || null,
        userCount: list.length,
        users: list,
      };
    });

    return res.status(200).json({ companies: payload });
  } catch (err) {
    console.error('[api] /admin/companies error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/admin/companies', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const {
    name,
    taxId,
    vatId,
    sdiCode,
    billingAddress,
    legalAddress,
    tkCompanyId,
    registerTeltonika,
    parentCompanyId
  } = req.body || {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Nome azienda richiesto.' });
  }

  try {
    let resolvedTkCompanyId = typeof tkCompanyId === 'string' && tkCompanyId.trim()
      ? tkCompanyId.trim()
      : null;

    const shouldRegisterTeltonika =
      registerTeltonika === true ||
      registerTeltonika === 1 ||
      registerTeltonika === '1' ||
      registerTeltonika === 'true' ||
      registerTeltonika === 'on';

    if (shouldRegisterTeltonika) {
      let parentId = typeof parentCompanyId === 'string' && parentCompanyId.trim()
        ? parentCompanyId.trim()
        : null;
      if (!parentId) {
        const companyTree = await TachoSync.companies();
        const list = Array.isArray(companyTree?.items)
          ? companyTree.items
          : Array.isArray(companyTree)
            ? companyTree
            : [];
        parentId = list[0]?.id || null;
      }
      if (!parentId) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'Parent company Teltonika mancante.' });
      }
      const created = await TachoSync.createCompany({
        name: trimmedName,
        parentCompanyId: parentId
      });
      if (!created?.id) {
        return res.status(502).json({ error: 'TELTONIKA_ERROR', message: 'Impossibile creare azienda Teltonika.' });
      }
      resolvedTkCompanyId = created.id;
    }

    const company = await Companies.create({
      name: trimmedName,
      tkCompanyId: resolvedTkCompanyId,
      taxIdEnc: (taxId || vatId) ? encryptString(String(taxId || vatId)) : null,
      sdiCodeEnc: sdiCode ? encryptString(String(sdiCode)) : null,
      billingAddressEnc: (billingAddress || legalAddress)
        ? encryptJSON({ legalAddress: billingAddress || legalAddress })
        : null,
    });
    return res.status(201).json({
      company: {
        id: company._id?.toString?.() || company._id,
        name: company.name,
        tkCompanyId: company.tkCompanyId || null,
        status: company.status ?? 0,
        createdAt: company.createdAt || null,
      },
    });
  } catch (err) {
    console.error('[api] /admin/companies create error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/tacho/companies', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  try {
    const companies = await TachoSync.companiesFlat();
    const payload = companies.map((company) => ({
      id: company.id,
      name: company.name,
      parentId: company.parentId || null,
      depth: Number.isFinite(company.depth) ? company.depth : 0,
    }));
    return res.status(200).json({ companies: payload });
  } catch (err) {
    console.error('[api] /tacho/companies error:', err?.message || err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/tacho/files', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const source = String(req.query.source || 'all').toLowerCase();
  const pageNumber = Number(req.query.pageNumber || req.query.page || 1) || 1;
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 50) || 50, 1), 100);
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : null;
  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;
  const containsRaw = typeof req.query.contains === 'string' ? req.query.contains : null;
  const contains = containsRaw && containsRaw.trim().length >= 3 ? containsRaw.trim() : null;

  const params = {
    PageNumber: pageNumber,
    PageSize: pageSize,
    OrderBy: 'downloadTime',
    Descending: true,
    AllCompanies: companyId ? false : true,
    CompanyId: companyId || undefined,
    From: from || undefined,
    To: to || undefined,
    Contains: contains || undefined,
  };

  const wantsDriver = source !== 'vehicle';
  const wantsVehicle = source !== 'driver';

  try {
    const [driverRes, vehicleRes] = await Promise.all([
      wantsDriver ? TachoSync.listDriverFiles(params) : Promise.resolve(null),
      wantsVehicle ? TachoSync.listVehicleFiles(params) : Promise.resolve(null),
    ]);

    const driverItems = Array.isArray(driverRes?.items) ? driverRes.items : [];
    const vehicleItems = Array.isArray(vehicleRes?.items) ? vehicleRes.items : [];

    const normalize = (item, kind) => ({
      id: item?.id,
      fileName: item?.fileName || null,
      downloadTime: item?.downloadTime || null,
      company: item?.company || null,
      driver: item?.driver || null,
      vehicle: item?.vehicle || null,
      source: kind,
    });

    const allItems = [
      ...driverItems.map((item) => normalize(item, 'driver')),
      ...vehicleItems.map((item) => normalize(item, 'vehicle')),
    ];

    const filtered = allItems.filter((item) => {
      const name = typeof item.fileName === 'string' ? item.fileName.toLowerCase() : '';
      return !name || name.endsWith('.ddd');
    });

    filtered.sort((a, b) => {
      const ta = a.downloadTime ? new Date(a.downloadTime).getTime() : 0;
      const tb = b.downloadTime ? new Date(b.downloadTime).getTime() : 0;
      return tb - ta;
    });

    return res.status(200).json({
      items: filtered,
      total: filtered.length,
      sources: {
        driverCount: driverItems.length,
        vehicleCount: vehicleItems.length,
      },
    });
  } catch (err) {
    console.error('[api] /tacho/files error:', err?.message || err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/tacho/files/download', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const source = String(req.query.source || 'vehicle').toLowerCase();
  const id = typeof req.query.id === 'string' ? req.query.id : null;
  const ids = Array.isArray(req.query.ids) ? req.query.ids : id ? [id] : [];
  const format = typeof req.query.format === 'string' && req.query.format.trim()
    ? req.query.format.trim()
    : 'DDD';
  const fileName = typeof req.query.name === 'string' && req.query.name.trim()
    ? req.query.name.trim()
    : null;

  if (!ids.length) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'id richiesto' });
  }

  try {
    const response = source === 'driver'
      ? await TachoSync.downloadDriverFiles(ids, format)
      : await TachoSync.downloadVehicleFiles(ids, format);

    const contentType = response.headers?.['content-type'] || 'application/octet-stream';
    const dispositionName = fileName || (ids.length > 1 ? 'tacho-files.zip' : 'tacho-file.ddd');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${dispositionName}"`);
    return res.status(200).send(response.data);
  } catch (err) {
    console.error('[api] /tacho/files/download error:', err?.message || err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/admin/users', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const {
    firstName,
    lastName,
    phone,
    email,
    password,
    companyId,
    role = 1,
    status = 0,
    privilege = 2,
  } = req.body || {};

  if (!firstName || !lastName || !phone || !email || !password || !companyId) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Campi obbligatori mancanti.' });
  }

  try {
    const user = await _Users.new(
      String(firstName),
      String(lastName),
      String(phone),
      String(email),
      String(password),
      companyId,
      Number(role),
      Number(status),
      Number(privilege),
    );
    return res.status(201).json({
      user: {
        id: user._id?.toString?.() || user.id,
        email: user.email,
        role: user.role,
        privilege: user.privilege,
      },
    });
  } catch (err) {
    console.error('[api] /admin/users create error:', err);
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
