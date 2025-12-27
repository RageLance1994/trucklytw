const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { SeepTrucker } = require("../utils/seep");
const Models = require("../Models/Schemes");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DRIVER_FILE = path.join(
  __dirname,
  "..",
  "ddd",
  "C_20251028_2210_F_SARR_I100000569493003.DDD",
);

const RANGE_DAYS = 7;
const DRIVER_ID_OVERRIDE = process.env.SEEP_DRIVER_ID || "";

const toIso = (date) => new Date(date).toISOString();

const getDateFromFilename = (filePath) => {
  const name = path.basename(filePath);
  const match = name.match(/C_(\d{8})_(\d{4})/i);
  if (!match) return null;
  const [, ymd, hm] = match;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6)) - 1;
  const day = Number(ymd.slice(6, 8));
  const hour = Number(hm.slice(0, 2));
  const minute = Number(hm.slice(2, 4));
  return new Date(Date.UTC(year, month, day, hour, minute, 0));
};

const normalizeMetricToHours = (value) => {
  if (!Number.isFinite(value)) return 0;
  const minutes = value > 1000 ? value / 60 : value;
  return minutes / 60;
};

const mapSeepMetrics = (metrics = {}) => ({
  driving_h: normalizeMetricToHours(metrics.totalDriving),
  work_h: normalizeMetricToHours(metrics.totalWork),
  break_h: normalizeMetricToHours(metrics.totalBreak),
  available_h: normalizeMetricToHours(metrics.totalAvailable),
  unknown_h: normalizeMetricToHours(metrics.totalUnknown),
  amplitude_h: normalizeMetricToHours(metrics.totalAmplitude),
});

const STATE_MAP = {
  driving: "driving",
  working: "working",
  resting: "resting",
  unknown: "unknown",
  unlogged: "resting",
  error: "unknown",
};

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

const addHours = (obj, key, hours) => {
  obj[key] = (obj[key] || 0) + hours;
};

const maskValue = (value) => {
  const str = `${value || ""}`;
  if (!str) return "--";
  if (str.length <= 4) return str;
  return `${str.slice(0, 2)}***${str.slice(-2)}`;
};

const splitIntervalByDay = (startMs, endMs, cb) => {
  let cursor = startMs;
  while (cursor < endMs) {
    const startDate = new Date(cursor);
    const nextDay = Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate() + 1,
      0,
      0,
      0,
    );
    const segmentEnd = Math.min(endMs, nextDay);
    cb(cursor, segmentEnd);
    cursor = segmentEnd;
  }
};

const computeDriverEventMetrics = (events, from, to) => {
  const buckets = {};
  if (!Array.isArray(events) || events.length < 2) return buckets;
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();

  for (let i = 1; i < events.length; i += 1) {
    const prev = events[i - 1];
    const curr = events[i];
    const start = new Date(prev.timestamp).getTime();
    const end = new Date(curr.timestamp).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const clampedStart = Math.max(start, fromMs);
    const clampedEnd = Math.min(end, toMs);
    if (clampedEnd <= clampedStart) continue;

    const stateKey = STATE_MAP[prev.to_state_name] || "unknown";
    splitIntervalByDay(clampedStart, clampedEnd, (segStart, segEnd) => {
      const hours = (segEnd - segStart) / 3_600_000;
      const key = dayKey(segStart);
      if (!buckets[key]) buckets[key] = { driving_h: 0, work_h: 0, rest_h: 0, unknown_h: 0 };
      if (stateKey === "driving") {
        addHours(buckets[key], "driving_h", hours);
        addHours(buckets[key], "work_h", hours);
      } else if (stateKey === "working") {
        addHours(buckets[key], "work_h", hours);
      } else if (stateKey === "resting") {
        addHours(buckets[key], "rest_h", hours);
      } else {
        addHours(buckets[key], "unknown_h", hours);
      }
    });
  }

  return buckets;
};

const printComparison = (dddMetrics, seepMetrics) => {
  const days = Array.from(new Set([...Object.keys(dddMetrics), ...Object.keys(seepMetrics)])).sort();
  const lines = days.map((day) => {
    const d = dddMetrics[day] || {};
    const s = seepMetrics[day] || {};
    return {
      day,
      d_drive: (d.driving_h || 0).toFixed(2),
      d_work: (d.work_h || 0).toFixed(2),
      d_rest: (d.rest_h || 0).toFixed(2),
      s_drive: (s.driving_h || 0).toFixed(2),
      s_work: (s.work_h || 0).toFixed(2),
      s_break: (s.break_h || 0).toFixed(2),
      s_avail: (s.available_h || 0).toFixed(2),
      s_unknown: (s.unknown_h || 0).toFixed(2),
    };
  });

  console.table(lines);
};

const run = async () => {
  const driverCard = path.basename(DRIVER_FILE).match(/I\d+/)?.[0];
  if (!driverCard) {
    throw new Error("Driver card ID not found in filename.");
  }

  const dddDate = getDateFromFilename(DRIVER_FILE) || new Date();
  const from = new Date(dddDate.getTime() - RANGE_DAYS * 24 * 60 * 60 * 1000);
  const to = new Date(dddDate.getTime() + RANGE_DAYS * 24 * 60 * 60 * 1000);

  await SeepTrucker.auth();
  const uploadInfo = await SeepTrucker.uploadFile(DRIVER_FILE);
  const uploadKeys = uploadInfo ? Object.keys(uploadInfo) : [];
  const uploadDriver = uploadInfo?.driver || null;
  const uploadDriverKeys = uploadDriver ? Object.keys(uploadDriver) : [];
  const uploadDriverId =
    uploadInfo?.driverId ||
    uploadInfo?.driver?.id ||
    uploadInfo?.driver_id ||
    null;

  let uploadFileInfo = null;
  if (uploadInfo?.id) {
    try {
      const { data } = await SeepTrucker.client.get(`/api/files/${uploadInfo.id}`, {
        headers: SeepTrucker._authHeaders(),
      });
      uploadFileInfo = data;
    } catch (err) {
      console.warn("[analyze-ddd] unable to read file details", err?.response?.status || err?.message || err);
    }
  }
  if (!uploadFileInfo) {
    try {
      const { data } = await SeepTrucker.client.get("/api/files", {
        headers: SeepTrucker._authHeaders(),
      });
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const fileName = path.basename(DRIVER_FILE);
      console.log(`[analyze-ddd] Seep files count: ${list.length}`);
      uploadFileInfo =
        list.find((item) => `${item?.id}` === `${uploadInfo?.id}`) ||
        list.find((item) => `${item?.name}` === fileName) ||
        list.find((item) => `${item?.name}`.includes(driverCardStr)) ||
        null;
    } catch (err) {
      console.warn("[analyze-ddd] unable to list files", err?.response?.status || err?.message || err);
    }
  }

  const uploadFileKeys = uploadFileInfo ? Object.keys(uploadFileInfo) : [];
  const uploadFileDriverId =
    uploadFileInfo?.driverId ||
    uploadFileInfo?.driver?.id ||
    uploadFileInfo?.driver_id ||
    null;

  const drivers = await SeepTrucker.drivers({ onlyActives: false });
  const driverList = Array.isArray(drivers) ? drivers : drivers?.items || [];
  const driverCardStr = `${driverCard}`.trim();
  const cardTail = driverCardStr.slice(-5);
  const targetDriver =
    driverList.find(
      (d) =>
        `${d.id}` === driverCardStr ||
        `${d.cardNumber}` === driverCardStr ||
        `${d.cardId}` === driverCardStr ||
        `${d.licenceNumber}` === driverCardStr ||
        `${d.licenceId}` === driverCardStr ||
        `${d.cardName}`.includes(driverCardStr),
    ) ||
    driverList.find((d) => `${d.cardNumber || ""}`.endsWith(cardTail)) ||
    driverList.find((d) => `${d.licenceNumber || ""}`.endsWith(cardTail)) ||
    (uploadDriverId ? driverList.find((d) => `${d.id}` === `${uploadDriverId}`) : null) ||
    (uploadFileDriverId ? driverList.find((d) => `${d.id}` === `${uploadFileDriverId}`) : null);

  let driverIdToUse = DRIVER_ID_OVERRIDE || targetDriver?.id || null;
  if (!driverIdToUse) {
    const driverKeys = driverList[0] ? Object.keys(driverList[0]) : [];
    const candidates = driverList
      .filter(
        (d) =>
          `${d.licenceNumber || ""}`.endsWith(cardTail) ||
          `${d.licenceId || ""}`.endsWith(cardTail) ||
          `${d.id || ""}`.endsWith(cardTail),
      )
      .map((d) => ({
        id: maskValue(d.id),
        licenceNumber: maskValue(d.licenceNumber),
        name: d.name ? `${d.name}`.slice(0, 2) + "***" : "--",
      }));
    if (candidates.length) {
      console.warn("[analyze-ddd] candidate drivers:", candidates);
    }
    console.warn(
      `[analyze-ddd] no SeepTrucker driver match for ${driverCard}; attempting fallback with card as driverId`,
    );
    const dumpPath = path.join(__dirname, "..", "ddd", "seep-drivers.json");
    const slimDrivers = driverList.map((d) => ({
      id: d.id,
      name: d.name,
      licenceNumber: d.licenceNumber,
      licenceId: d.licenceId,
      companyName: d.companyName,
      active: d.active,
    }));
    require("fs").writeFileSync(dumpPath, JSON.stringify(slimDrivers, null, 2));
    throw new Error(
      `SeepTrucker driver not found for card ${driverCard}. Driver keys: ${driverKeys.join(
        ", ",
      )}. Upload keys: ${uploadKeys.join(", ")}. Upload driver keys: ${uploadDriverKeys.join(
        ", ",
      )}. Upload file keys: ${uploadFileKeys.join(
        ", ",
      )}. Saved driver list to ${dumpPath}. Set SEEP_DRIVER_ID and rerun.`,
    );
  }

  let analysis = null;
  try {
    analysis = await SeepTrucker.driverActivity({
      driverId: driverIdToUse,
      startDate: toIso(from),
      endDate: toIso(to),
      timezone: "UTC",
    });
  } catch (err) {
    throw new Error(
      `SeepTrucker driver activity failed for ${driverIdToUse}: ${err?.message || err}`,
    );
  }

  const seepMetrics = {};
  const weeks = analysis?.activityAnalysis?.weeks || [];
  weeks.forEach((week) => {
    (week?.days || []).forEach((day) => {
      const key = day?.date ? day.date.slice(0, 10) : null;
      if (!key) return;
      seepMetrics[key] = mapSeepMetrics(day.metrics || {});
    });
  });

  const { driverEventSchema } = Models;
  const collectionName = `driver_${driverCard}_history`;
  const EventModel =
    mongoose.models[collectionName] ||
    mongoose.model(collectionName, driverEventSchema, collectionName);

  const mongoUrl = `mongodb://${process.env.MONGO_ROOT_USER}:${process.env.MONGO_ROOT_PASSWORD}@${process.env.MONGO_HOSTS}/?authSource=admin`;
  await mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });

  const events = await EventModel.find({
    timestamp: { $gte: from, $lte: to },
  })
    .sort({ timestamp: 1 })
    .lean();

  const dddMetrics = computeDriverEventMetrics(events, from, to);

  console.log(`Range: ${toIso(from)} -> ${toIso(to)}`);
  console.log(`Driver card: ${driverCard} (Seep id: ${driverIdToUse})`);
  console.log("Legend: d_* from driverEvents, s_* from SeepTrucker.");
  printComparison(dddMetrics, seepMetrics);

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("[analyze-ddd] failed:", err.message || err);
  process.exitCode = 1;
});
