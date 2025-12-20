const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { auth } = require('../utils/users');
const { Vehicles, getModel, avlSchema } = require('../Models/Schemes');
const { decryptString, decryptJSON } = require('../utils/encryption');
const { SeepTrucker } = require('../utils/seep');

const router = express.Router();

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
