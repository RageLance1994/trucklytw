import mongoose from "mongoose";
import type { WebSocket } from "ws";
import { getModel } from "@/lib/server/models/getModel";
import { avlSchema } from "@/lib/server/models/Avl";

type HubClient = WebSocket & {
  deviceImeis?: Set<string>;
};

type DeviceSnapshot = { imei: string; data: any };

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

class StreamHub {
  private initialized = false;
  private clients = new Set<HubClient>();
  private buffer: DeviceSnapshot[] = [];
  private driverCache = new Map<string, Record<string, any>>();
  private flushTimer?: NodeJS.Timeout;
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_INTERVAL = 1000;

  async ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;

    const pipeline = [{ $match: { "ns.coll": { $regex: "_monitoring$" } } }];
    const changeStream = mongoose.connection.watch(pipeline, {
      fullDocument: "updateLookup",
    });

    changeStream.on("change", (change) => {
      const coll = change.ns?.coll;
      if (!coll || !coll.endsWith("_monitoring")) return;
      const imei = coll.replace("_monitoring", "");
      const doc = change.fullDocument;
      if (!doc) return;
      const enriched = this.applyDriverCache(imei, doc);
      this.buffer.push({ imei, data: enriched });
      if (this.buffer.length >= this.BATCH_SIZE) {
        this.flushBuffer();
      }
    });

    changeStream.on("error", (err) => {
      console.error("[WS Hub] Change stream error", err);
    });

    this.flushTimer = setInterval(
      () => this.flushBuffer(),
      this.BATCH_INTERVAL
    );
  }

  addClient(client: HubClient) {
    this.clients.add(client);
  }

  removeClient(client: HubClient) {
    this.clients.delete(client);
  }

  updateSubscriptions(client: HubClient, imeis: string[]) {
    client.deviceImeis = new Set(imeis);
  }

  async sendInitialSnapshots(client: HubClient, imeis: string[]) {
    if (!imeis.length) return;
    const snapshots = (
      await Promise.all(imeis.map((imei) => this.getLatestSnapshot(imei)))
    ).filter(Boolean) as DeviceSnapshot[];

    if (snapshots.length && client.readyState === 1) {
      client.send(JSON.stringify({ devices: snapshots }));
    }
  }

  async getLatestSnapshot(imei: string) {
    if (!imei) return null;
    const Model = getModel(`${imei}_monitoring`, avlSchema);
    const latest = await Model.findOne().sort({ timestamp: -1 }).lean<any>();
    if (!latest) return null;
    await this.ensureDriverInfo(imei, latest);
    return { imei, data: latest };
  }

  async getLastKnownCoordinates(imei: string) {
    const snapshot = await this.getLatestSnapshot(imei);
    if (!snapshot) return { lat: null, lon: null };
    const gps = snapshot.data?.gps || snapshot.data?.data?.gps || snapshot.data;
    const lat = toNumber(
      gps?.lat ||
        gps?.latitude ||
        gps?.Latitude ||
        gps?.position?.lat ||
        gps?.position?.Latitude
    );
    const lon = toNumber(
      gps?.lon ||
        gps?.lng ||
        gps?.longitude ||
        gps?.Longitude ||
        gps?.position?.lon ||
        gps?.position?.Longitude
    );
    return { lat, lon };
  }

  private flushBuffer() {
    if (this.buffer.length === 0) return;
    const payload = this.buffer.splice(0, this.buffer.length);
    for (const client of this.clients) {
      if (client.readyState !== 1 || !client.deviceImeis?.size) continue;
      const filtered = payload.filter((item) =>
        client.deviceImeis!.has(item.imei)
      );
      if (filtered.length) {
        client.send(JSON.stringify({ devices: filtered }));
      }
    }
  }

  private cacheDriverFields(imei: string, io: Record<string, any>) {
    if (!io) return;
    const driverKeys = Object.keys(io).filter((key) =>
      key.toLowerCase().includes("driver")
    );
    if (!driverKeys.length) return;
    const snapshot: Record<string, any> = {};
    driverKeys.forEach((key) => {
      snapshot[key] = io[key];
    });
    if (Object.keys(snapshot).length) {
      this.driverCache.set(imei, snapshot);
    }
  }

  private applyDriverCache(imei: string, doc: any) {
    doc.io = doc.io || {};
    if (doc.io.tachoDriverIds) {
      this.cacheDriverFields(imei, doc.io);
      return doc;
    }
    const cache = this.driverCache.get(imei);
    if (cache) {
      Object.assign(doc.io, cache);
    }
    return doc;
  }

  private async ensureDriverInfo(imei: string, doc: any) {
    this.applyDriverCache(imei, doc);
    if (doc.io?.tachoDriverIds || this.driverCache.has(imei)) return doc;

    try {
      const Model = getModel(`${imei}_monitoring`, avlSchema);
      const withDriver = await Model.findOne({
        "io.tachoDriverIds": { $ne: null },
      })
        .sort({ timestamp: -1 })
        .lean<any>();
      if (withDriver?.io) {
        this.cacheDriverFields(imei, withDriver.io);
        this.applyDriverCache(imei, doc);
      }
    } catch (err) {
      console.warn("[WS Hub] Failed fetching driver cache for", imei, err);
    }
    return doc;
  }
}

let hub: StreamHub | null = null;

export function getStreamHub() {
  if (!hub) {
    hub = new StreamHub();
  }
  return hub;
}
