import mongoose, { ChangeStream } from "mongoose";
import { getModel } from "../models/getModel";
import { avlSchema } from "../models/Avl";

type AVLDoc = mongoose.Document & {
  imei: string;
  timestamp: Date;
};

type WsClient = {
  send: (message: string) => void;
  deviceImeis?: Set<string>;
};

class DeviceMonitoringService {
  private clients = new Set<WsClient>();
  private watchers = new Map<string, ChangeStream<AVLDoc>>();
  private buffer = new Map<string, AVLDoc>();
  private flushInterval = 150;
  private loopStarted = false;

  private startLoop() {
    if (this.loopStarted) return;
    this.loopStarted = true;
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
            ws.send(
              JSON.stringify({
                type: "update",
                imei,
                data,
              })
            );
          }
        }
      }
    }, this.flushInterval);
  }

  addClient(ws: WsClient) {
    this.clients.add(ws);
    this.startLoop();
  }

  removeClient(ws: WsClient) {
    this.clients.delete(ws);
  }

  async ensureWatcherForImei(imei: string) {
    if (this.watchers.has(imei)) return;

    const colName = `${imei}_monitoring`;
    const Model = getModel<AVLDoc>(colName, avlSchema);
    console.log(`ĐY"­ Starting watcher for ${colName}`);

    const changeStream = Model.watch([], {
      fullDocument: "updateLookup",
    }) as ChangeStream<AVLDoc>;
    changeStream.on("change", (change) => {
      if (change.fullDocument) {
        this.buffer.set(imei, change.fullDocument as AVLDoc);
      }
    });
    changeStream.on("error", (err) => {
      console.error(`ƒ?O ChangeStream error on ${imei}`, err);
    });

    this.watchers.set(imei, changeStream);
  }

  async sendInitialState(ws: WsClient, imeis: string[]) {
    for (const imei of imeis) {
      const colName = `${imei}_monitoring`;
      const Model = getModel<AVLDoc>(colName, avlSchema);
      const last = await Model.findOne().sort({ timestamp: -1 }).lean();

      if (last) {
        ws.send(
          JSON.stringify({
            type: "snapshot",
            imei,
            data: last,
          })
        );
      }

      await this.ensureWatcherForImei(imei);
    }
  }
}

export const DeviceMonitoring = new DeviceMonitoringService();
