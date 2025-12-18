const express = require('express');
const mongoose = require('mongoose');
const { getModel, avlSchema } = require('../Models/Schemes');
const {authWS} = require('../utils/users')

const router = express.Router();
const driversCache = new Map()


// ✅ WebSocket via router.ws
router.ws('/', (ws, req) => {
  console.log('📡 Nuovo client WebSocket connesso da', req.user?.email);
  deviceClients.add(ws);

  ws.on('message', async (msg) => {
    try {
      const parsed = JSON.parse(msg);

      if (parsed.action === 'subscribe' && Array.isArray(parsed.deviceIds)) {
        // autorizza solo IMEI appartenenti all'utente
        const allowedImeis = new Set(
          req.user.vehicles.map(v => v.imei).filter(Boolean)
        );

        const validSubscriptions = parsed.deviceIds.filter(imei => allowedImeis.has(imei));
        ws.deviceImeis = new Set(validSubscriptions);

        console.log(`✅ ${req.user.email} subscribed to:`, validSubscriptions);

        // Risposta immediata con ultima posizione nota
        const responses = await Promise.all(validSubscriptions.map(async (imei) => {
          try {
            const model = getModel(`${imei}_monitoring`, avlSchema);
            const latest = await model.findOne().sort({ timestamp: -1 });
            return latest ? { imei, data: latest } : null;
          } catch (e) {
            console.error(`❌ Errore fetch iniziale per ${imei}:`, e.message);
            return null;
          }
        }));

        const filtered = responses.filter(item => item !== null);
        if (filtered.length > 0) {
          ws.send(JSON.stringify({ devices: filtered }));
        }
      }
    } catch (err) {
      console.error('❌ Errore parsing messaggio WS:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('❌ Client WS disconnesso', req.user?.email);
    deviceClients.delete(ws);
  });
});

// ✅ Endpoint di test (opzionale)
router.get('/', (req, res) => {
  res.send('Device Stream API attivo');
});

module.exports = router;
