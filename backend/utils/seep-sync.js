const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cron = require("node-cron");
const { TachoSync } = require("./tacho");
const { SeepTrucker } = require("./seep");
const { SeepFileStatus } = require("../Models/Schemes");

const SYNC_INTERVAL = "*/5 * * * *";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseDateFromFilename = (fileName) => {
  if (!fileName) return null;
  const match = String(fileName).match(/_(\d{8})_(\d{4})_/);
  if (!match) return null;
  const [, ymd, hm] = match;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const day = Number(ymd.slice(6, 8));
  const hour = Number(hm.slice(0, 2));
  const minute = Number(hm.slice(2, 4));
  return new Date(Date.UTC(year, month, day, hour, minute, 0));
};

const resolvePeriod = (item) => {
  const schedule = item?.schedule || {};
  const from =
    item?.periodFrom ||
    item?.from ||
    item?.startDate ||
    item?.startTime ||
    item?.filePeriodFrom ||
    schedule?.activitiesFrom ||
    schedule?.periodFrom ||
    schedule?.from ||
    null;
  const to =
    item?.periodTo ||
    item?.to ||
    item?.endDate ||
    item?.endTime ||
    item?.filePeriodTo ||
    schedule?.activitiesTo ||
    schedule?.periodTo ||
    schedule?.to ||
    null;

  if (from || to) {
    return { from: toDate(from), to: toDate(to), source: "period" };
  }

  // Fallback: derive from filename timestamp or download time.
  const fromName = parseDateFromFilename(item?.fileName);
  const fallback = fromName || toDate(item?.downloadTime) || null;
  return {
    from: fallback,
    to: fallback,
    source: fallback ? "filename/downloadTime" : "unknown",
  };
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const telegramNotify = async (message) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
    });
  } catch (err) {
    console.warn("[seep-sync] telegram notify failed", err?.message || err);
  }
};

const listTeltonikaFiles = async (kind) => {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const params = {
      PageNumber: page,
      PageSize: PAGE_SIZE,
      OrderBy: "downloadTime",
      Descending: true,
      AllCompanies: true,
    };
    const res =
      kind === "driver"
        ? await TachoSync.listDriverFiles(params)
        : await TachoSync.listVehicleFiles(params);
    const items = Array.isArray(res?.items) ? res.items : [];
    if (!items.length) break;
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return all;
};

const upsertStatus = async (entry, extra = {}) => {
  await SeepFileStatus.updateOne(
    { teltonikaFileId: entry.teltonikaFileId },
    { $set: { ...entry, ...extra } },
    { upsert: true },
  );
};

const uploadOne = async (item, kind) => {
  const teltonikaFileId = String(item?.id || "");
  if (!teltonikaFileId) return { skipped: true };

  const period = resolvePeriod(item);
  const baseEntry = {
    teltonikaFileId,
    fileName: item?.fileName || null,
    source: kind,
    companyId: item?.company?.id || null,
    downloadTime: toDate(item?.downloadTime),
    periodFrom: period.from,
    periodTo: period.to,
    periodSource: period.source,
    lastCheckedAt: new Date(),
  };

  const tmpDir = path.join(process.cwd(), "tmp", "tacho");
  ensureDir(tmpDir);
  const fileName = item?.fileName || `${teltonikaFileId}.ddd`;
  const filePath = path.join(tmpDir, fileName);

  try {
    const response =
      kind === "driver"
        ? await TachoSync.downloadDriverFiles([teltonikaFileId], "DDD")
        : await TachoSync.downloadVehicleFiles([teltonikaFileId], "DDD");

    fs.writeFileSync(filePath, response.data);

    await SeepTrucker.auth();
    const uploadInfo = await SeepTrucker.uploadFile(filePath);
    const seepFileId = uploadInfo?.id || uploadInfo?.fileId || null;

    await upsertStatus(baseEntry, {
      seepUploaded: true,
      seepFileId,
      uploadedAt: new Date(),
      error: null,
    });

    return { uploaded: true, seepFileId };
  } catch (err) {
    const message = err?.message || String(err);
    await upsertStatus(baseEntry, {
      seepUploaded: false,
      error: message,
    });
    return { error: message };
  } finally {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }
};

const runSync = async () => {
  try {
    const [driverItems, vehicleItems] = await Promise.all([
      listTeltonikaFiles("driver"),
      listTeltonikaFiles("vehicle"),
    ]);

    const allItems = [
      ...driverItems.map((item) => ({ item, kind: "driver" })),
      ...vehicleItems.map((item) => ({ item, kind: "vehicle" })),
    ];

    const ids = allItems.map(({ item }) => String(item?.id || "")).filter(Boolean);
    const existing = await SeepFileStatus.find({ teltonikaFileId: { $in: ids } }).lean();
    const existingMap = new Map(existing.map((row) => [row.teltonikaFileId, row]));

    const pending = allItems.filter(({ item }) => {
      const id = String(item?.id || "");
      const row = existingMap.get(id);
      return !row || !row.seepUploaded;
    });

    if (!pending.length) return;

    await telegramNotify(`[seep-sync] Nuovi file da caricare: ${pending.length}`);

    for (const entry of pending) {
      const result = await uploadOne(entry.item, entry.kind);
      if (result?.error) {
        await telegramNotify(`[seep-sync] Upload fallito ${entry.item?.fileName}: ${result.error}`);
      }
    }
  } catch (err) {
    console.error("[seep-sync] error", err);
    await telegramNotify(`[seep-sync] Errore: ${err?.message || err}`);
  }
};

const startSeepSync = () => {
  const enabled =
    String(process.env.SEEP_SYNC_ENABLED || "true").toLowerCase() !== "false";
  if (!enabled) {
    console.log("[seep-sync] disabled");
    return;
  }
  cron.schedule(SYNC_INTERVAL, () => {
    runSync();
  });
  console.log(`[seep-sync] scheduled every 5 minutes (${SYNC_INTERVAL})`);
};

module.exports = {
  startSeepSync,
  runSync,
};
