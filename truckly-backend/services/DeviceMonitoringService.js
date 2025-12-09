// /services/DeviceMonitoringService.js
import mongoose from "mongoose";
import { getModel } from "../models/getModel.js";
import { avlSchema } from "../models/Avl.js";

class DeviceMonitoringService {

  constructor() {
    this.clients = new Set();      // tutti i ws connessi
    this.watchers = new Map();     // imei -> changeStream
    this.buffer = new Map();       // imei -> last update
    this.flushInterval = 150;      // ms (anti flood)
    this._startFlushLoop();
  }

  addClient(ws) {
    this.clients.add(ws);
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  // 🚀 Quando un client si iscrive a un IMEI: creiamo il watcher se non esiste
  async ensureWatcherForImei(imei) {
    if (this.watchers.has(imei)) return;

    const colName = `${imei}_monitoring`;
    const Model = getModel(colName, avlSchema);

    console.log(`📡 Starting watcher for ${colName}`);

    const changeStream = Model.watch([], { fullDocument: "updateLookup" });

    changeStream.on("change", (change) => {
      if (change.fullDocument) {
        this.buffer.set(imei, change.fullDocument);
      }
    });

    changeStream.on("error", (err) => {
      console.error(`❌ ChangeStream error on ${imei}`, err);
    });

    this.watchers.set(imei, changeStream);
  }

  // 🚀 Invio snapshot iniziale al singolo client
  async sendInitialState(ws, imeis) {
    for (const imei of imeis) {
      const colName = `${imei}_monitoring`;
      const Model = getModel(colName, avlSchema);

      const last = await Model.findOne().sort({ timestamp: -1 }).lean();

      if (last) {
        ws.send(JSON.stringify({
          type: "snapshot",
          imei,
          data: last
        }));
      }

      // attiva watcher IMEI se non lo avevamo ancora acceso
      await this.ensureWatcherForImei(imei);
    }
  }

  // 🚀 flush periodico (push ai client che lo richiedono)
  _startFlushLoop() {
    setInterval(() => {
      if (this.buffer.size === 0) return;

      const payloads = [...this.buffer.entries()].map(([imei, data]) => ({
        imei,
        data,
      }));

      this.buffer.clear();

      for (const ws of this.clients) {
        if (!ws.deviceImeis || ws.deviceImeis.size === 0) continue;

        for (const { imei, data } of payloads) {
          if (ws.deviceImeis.has(imei)) {
            ws.send(JSON.stringify({
              type: "update",
              imei,
              data
            }));
          }
        }
      }

    }, this.flushInterval);
  }
}

export const DeviceMonitoring = new DeviceMonitoringService();
