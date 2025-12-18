const express = require('express');
const mongoose = require('mongoose');
const { auth } = require('../utils/users');
const { Vehicles, getModel, avlSchema } = require('../Models/Schemes');
const { decryptString, decryptJSON } = require('../utils/encryption');

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
