const express = require('express');
const router = express.Router();
const { _Devices, Device } = require('../utils/database');
const { auth, authWS } = require('../utils/users');
const streamRoutes = require('./_stream');
const mongoose = require('mongoose')
const { getModel, avlSchema } = require('../Models/Schemes')

const ldCache = new Map()

const deviceClients = new Set();
let changeBuffer = []; // { imei, data }

const BATCH_SIZE = 10;
const BATCH_INTERVAL = 1000;

// ✅ Watcher globale su tutto Mongo
(async function deployGlobalWatcher() {
    try {
        await new Promise(res => setTimeout(res, 1500));

        const changeStream = mongoose.connection.watch([], { fullDocument: 'updateLookup' });

        function sendBufferedDeviceChanges() {
            if (changeBuffer.length === 0) return;

            deviceClients.forEach((client) => {
                if (client.readyState !== 1) return;

                // manda solo i device sottoscritti dall'utente
                const filtered = changeBuffer.filter(change => {
                    return client.deviceImeis && client.deviceImeis.has(change.imei);
                });

                if (filtered.length > 0) {
                    client.send(JSON.stringify({ devices: filtered }));
                }
            });

            changeBuffer = [];
        }

        changeStream.on('change', (change) => {
            if (!change.ns || !change.ns.coll.includes('_monitoring')) return;

            const imei = change.ns.coll.replace('_monitoring', '');
            var deviceUpdate = change.fullDocument;
            if (!deviceUpdate || deviceClients.size === 0) return;
            var cachedDriver = ldCache.get(imei)
            if(!deviceUpdate.io.tachoDriverIds && cachedDriver ){
                
                Object.keys(cachedDriver).map((k) => {
                    deviceUpdate.io[k] = cachedDriver[k];
                })
            }
            else{
                var newCache = null; 
                var driverKeys =  Object.keys(deviceUpdate.io).filter(k => k.toLowerCase().includes('driver'))
                if(driverKeys.length > 0){
                    newCache = {}
                    driverKeys.map((k) => {
                        newCache[k] = deviceUpdate.io[k];
                    })
                    
                    ldCache.set(imei,newCache); 

                }
            }

            


            changeBuffer.push({ imei, data: deviceUpdate });

            if (changeBuffer.length >= BATCH_SIZE) {
                sendBufferedDeviceChanges();
            }
        });

        setInterval(sendBufferedDeviceChanges, BATCH_INTERVAL);
        console.log('✅ Global device watcher attivato!');
    } catch (e) {
        console.error('❌ Errore nel deploy del watcher globale:', e.message);
    }
})();


router.ws('/devicepreview', async (ws, req) => {
    const { imei } = req.query;

    let wasAuthorized = false;
    let _device = null;

    try {
        const exists = await _Devices.isAuthorized(imei);

        if (exists) {
            wasAuthorized = true;
            _device = new Device(imei);

            ws.send(JSON.stringify(await _device.lastKnown()));

            await _device.listen((ev) => {
                ws.send(JSON.stringify(ev));
            });

            console.log(`[devicepreview] IMEI ${imei} già autorizzato → watcher attivo`);
        } else {
            wasAuthorized = false;
            await _Devices.authorize(imei);
            console.log(`[devicepreview] IMEI ${imei} non autorizzato → autorizzazione provvisoria creata`);
        }
    } catch (err) {
        console.error(`[devicepreview] Errore gestione IMEI ${imei}:`, err.message);
        ws.close(1011, "Errore server");
        return;
    }

    ws.on('close', async () => {
        try {
            if (_device) {
                await _device.mute();
            }

            if (!wasAuthorized) {
                await AuthorizedIMEIS.unauthorize({ imei });
                console.log(`[devicepreview] IMEI ${imei} deautorizzato (chiusura senza registrazione)`);
            }
        } catch (err) {
            console.error(`[devicepreview] Errore in chiusura socket per ${imei}:`, err.message);
        }
    });
});

router.ws('/stream', authWS, async (ws, req) => {
    console.log('📡 Nuovo client WebSocket connesso da', req.user?.email);
    
    deviceClients.add(ws);

    ws.on('message', async (msg) => {
        try {
            const parsed = JSON.parse(msg);
            console.log(parsed); 
            
            
            if (parsed.action === 'subscribe' && Array.isArray(parsed.deviceIds)) {
                // autorizza solo IMEI appartenenti all'utente
                const allowedImeis = new Set(
                    (await req.user.vehicles.list()).map(v => v.imei).filter(Boolean)
                );

                const validSubscriptions = parsed.deviceIds.filter(imei => allowedImeis.has(imei));
                ws.deviceImeis = new Set(validSubscriptions);

                console.log(`✅ ${req.user.email} subscribed to:`, validSubscriptions);

                // Risposta immediata con ultima posizione nota
                const responses = await Promise.all(validSubscriptions.map(async (imei) => {
                    try {
                        const model = getModel(`${imei}_monitoring`, avlSchema);
                        const latest = await model.findOne().sort({ timestamp: -1 });
                        if (!latest) return null;
                        if (!latest.io.tachoDriverIds) {
                            
                            var latestWithDriver = await model.findOne({ "io.tachoDriverIds": { $ne: null } }).sort({ timestamp: -1 }).lean();
                            var lastDriverCache = null;
                            if (latestWithDriver) {
                                lastDriverCache = {};

                                Object.keys(latestWithDriver.io).filter(element => element.toLowerCase().includes('driver')).map((k) => {
                                    lastDriverCache[k] = latestWithDriver.io[k];
                                })

                                if (Object.keys(lastDriverCache).length > 0) {
                                    ldCache.set(imei, lastDriverCache);
                                    Object.keys(lastDriverCache).map((k) => {
                                        latest.io[k] = lastDriverCache[k]
                                    })
                                }
                            }
                        }
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

})

// delega tutta la logica di streaming a streamRoutes

module.exports = router;
