const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const XLSX = require('xlsx');
const { auth, imeiOwnership } = require('../utils/users');
const { Vehicles, Drivers, Companies, UserModel, getModel, avlSchema, getRefuelingModel, fuelEventSchema, SeepFileStatus } = require('../Models/Schemes');
const { _Devices } = require('../utils/database');
const { decryptString, decryptJSON, encryptString, encryptJSON } = require('../utils/encryption');
const { _Users } = require('../utils/database');
const { SeepTrucker } = require('../utils/seep');
const { TachoSync } = require('../utils/tacho');
const { getSyncStatus, runSync, SYNC_INTERVAL } = require('../utils/seep-sync');

const router = express.Router();
const HISTORY_BUCKET_MS = 60_000;

const getPrivilegeLevel = (user) => {
  if (!user) return 2;
  if (Number.isInteger(user.role)) return user.role;
  if (Number.isInteger(user.privilege)) return user.privilege;
  return 2;
};

const isSuperAdmin = (user) => getPrivilegeLevel(user) === 0;
const canManageUsers = (user) => getPrivilegeLevel(user) <= 2;
const canEditVehicles = (user) => getPrivilegeLevel(user) <= 1;
const canManageDrivers = (user) => getPrivilegeLevel(user) <= 1;

const DEFAULT_ROUTING_PROVIDER = "ors";
const ROUTING_TIMEOUT_MS = 12_000;

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeLngLat = (raw = {}) => {
  const lng = toFiniteNumber(raw?.lng ?? raw?.lon ?? raw?.longitude);
  const lat = toFiniteNumber(raw?.lat ?? raw?.latitude);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lng, lat };
};

const resolveRoutingProvider = (requested = null) => {
  const normalized = String(requested || process.env.ROUTING_PROVIDER || DEFAULT_ROUTING_PROVIDER)
    .trim()
    .toLowerCase();
  return normalized === "google" ? "google" : "ors";
};

const withTimeoutFetch = async (url, options = {}, timeoutMs = ROUTING_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

const geocodeWithORS = async (query) => {
  const apiKey = process.env.ORS_API_KEY || "";
  if (!apiKey) throw new Error("ORS_API_KEY missing");
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(query)}&size=6`;
  const res = await withTimeoutFetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ORS geocode failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const payload = await res.json();
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features
    .map((feature) => {
      const coords = feature?.geometry?.coordinates;
      const lng = toFiniteNumber(Array.isArray(coords) ? coords[0] : null);
      const lat = toFiniteNumber(Array.isArray(coords) ? coords[1] : null);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const label = feature?.properties?.label || feature?.properties?.name || `${lat},${lng}`;
      return { label, lat, lng };
    })
    .filter(Boolean);
};

const geocodeWithGoogle = async (query) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY missing");
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}&language=it`;
  const res = await withTimeoutFetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google geocode failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const payload = await res.json();
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  return rows.slice(0, 6)
    .map((item) => {
      const lat = toFiniteNumber(item?.geometry?.location?.lat);
      const lng = toFiniteNumber(item?.geometry?.location?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        label: item?.formatted_address || `${lat},${lng}`,
        lat,
        lng,
      };
    })
    .filter(Boolean);
};

const routeWithORS = async ({ from, to }) => {
  const apiKey = process.env.ORS_API_KEY || "";
  if (!apiKey) throw new Error("ORS_API_KEY missing");
  const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
  const body = {
    coordinates: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    instructions: false,
  };
  const res = await withTimeoutFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ORS route failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const payload = await res.json();
  const feature = Array.isArray(payload?.features) ? payload.features[0] : null;
  const summary = feature?.properties?.summary || {};
  const geometry = feature?.geometry || null;
  return {
    provider: "ors",
    hasTraffic: false,
    distanceKm: Number.isFinite(summary?.distance) ? Number((summary.distance / 1000).toFixed(2)) : null,
    durationMin: Number.isFinite(summary?.duration) ? Number((summary.duration / 60).toFixed(1)) : null,
    durationTrafficMin: null,
    geometry,
    raw: { summary },
  };
};

const routeWithGoogle = async ({ from, to, departureTime }) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY missing");
  const dep = Number.isFinite(departureTime) ? Math.floor(departureTime / 1000) : "now";
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(`${from.lat},${from.lng}`)}&destination=${encodeURIComponent(`${to.lat},${to.lng}`)}&departure_time=${encodeURIComponent(dep)}&traffic_model=best_guess&key=${encodeURIComponent(apiKey)}&language=it`;
  const res = await withTimeoutFetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google route failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const payload = await res.json();
  const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
  const leg = Array.isArray(route?.legs) ? route.legs[0] : null;
  const polyline = route?.overview_polyline?.points || null;
  const distanceMeters = toFiniteNumber(leg?.distance?.value);
  const durationSeconds = toFiniteNumber(leg?.duration?.value);
  const trafficSeconds = toFiniteNumber(leg?.duration_in_traffic?.value);
  return {
    provider: "google",
    hasTraffic: Number.isFinite(trafficSeconds),
    distanceKm: Number.isFinite(distanceMeters) ? Number((distanceMeters / 1000).toFixed(2)) : null,
    durationMin: Number.isFinite(durationSeconds) ? Number((durationSeconds / 60).toFixed(1)) : null,
    durationTrafficMin: Number.isFinite(trafficSeconds) ? Number((trafficSeconds / 60).toFixed(1)) : null,
    geometry: polyline ? { type: "EncodedPolyline", polyline } : null,
    raw: {
      status: payload?.status || null,
      warnings: Array.isArray(route?.warnings) ? route.warnings : [],
    },
  };
};

const LUL_REPORT_TYPES = {
  D01: { code: 'D01', label: 'Report di attivita e infrazioni', seep: 'activity_infringements' },
  D02: { code: 'D02', label: 'Dichiarazione di attivita', seep: 'registered_places' },
  D03: { code: 'D03', label: 'Report dei tempi di attivita', seep: 'activity_times' },
  D04: { code: 'D04', label: 'Rapporto dei tempi di lavoro', seep: 'work_times' },
  D05: { code: 'D05', label: 'Report tessere inserite', seep: 'inserted_cards' },
};

const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const metricToMinutes = (value) => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    return value > 1000 ? Math.round(value / 60) : Math.round(value);
  }
  const str = String(value || '').trim();
  const hm = str.match(/^(\d+)\s*h\s*(\d+)?/i);
  if (hm) return (Number(hm[1] || 0) * 60) + Number(hm[2] || 0);
  const hhmm = str.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return (Number(hhmm[1] || 0) * 60) + Number(hhmm[2] || 0);
  return 0;
};

const minutesToHHMM = (minutes) => {
  const total = Math.max(0, Number(minutes) || 0);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const toTimeFromIso = (value) => {
  const raw = String(value || '');
  const m = raw.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '--';
};

const normalizeSheetText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const isWeeklyTotalsRow = (value) =>
  normalizeSheetText(value).toLowerCase().startsWith('totali settimanali');

const isWeekHeaderRow = (value) => {
  const normalized = normalizeSheetText(value);
  return /^\d{4}\s*\|\s*Settimana\s*\d+/i.test(normalized);
};

const isDayRow = (value) => /^\d{4}-\d{2}-\d{2}\b/.test(String(value || '').trim());

const withDash = (value) => {
  const v = String(value == null ? '' : value).trim();
  return v || '-';
};

const parseWorkTimesRowsFromXlsx = (xlsxBuffer) => {
  const wb = XLSX.read(xlsxBuffer, { type: 'buffer' });
  const firstSheet = wb.SheetNames?.[0];
  if (!firstSheet) {
    return {
      periodTotals: { workTotal: '-', workDay: '-', workNight: '-', kms: '-' },
      weeklySections: [],
      dailyRows: [],
    };
  }
  const ws = wb.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const periodTotals = { workTotal: '-', workDay: '-', workNight: '-', kms: '-' };
  const weeklySections = [];
  const dailyRows = [];

  for (let i = 0; i < rows.length; i += 1) {
    const cols = rows[i] || [];
    const col0 = String(cols?.[0] || '').trim();
    if (!col0) continue;

    const normalized = normalizeSheetText(col0).toLowerCase();
    if (normalized.startsWith('totali periodo analizzato')) {
      const totalValues = rows[i + 2] || [];
      periodTotals.workTotal = withDash(totalValues?.[0]);
      periodTotals.workDay = withDash(totalValues?.[1]);
      periodTotals.workNight = withDash(totalValues?.[2]);
      periodTotals.kms = withDash(totalValues?.[3]);
      i += 2;
      continue;
    }

    if (!isWeekHeaderRow(col0)) continue;

    const weekSection = {
      label: col0,
      rows: [],
      totals: { workTotal: '-', workDay: '-', workNight: '-', kms: '-' },
    };

    for (i = i + 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const first = String(row?.[0] || '').trim();
      if (!first) continue;

      if (isWeekHeaderRow(first)) {
        i -= 1;
        break;
      }

      if (isWeeklyTotalsRow(first)) {
        weekSection.totals.workTotal = withDash(row?.[4]);
        weekSection.totals.workDay = withDash(row?.[5]);
        weekSection.totals.workNight = withDash(row?.[6]);
        weekSection.totals.kms = withDash(row?.[7]);
        break;
      }

      if (!isDayRow(first)) continue;

      const [isoDateRaw, dayNameRaw] = first.split(',');
      const dayRow = {
        date: withDash(isoDateRaw),
        dayName: withDash(dayNameRaw),
        startTime: withDash(row?.[1]),
        endTime: withDash(row?.[2]),
        amplitude: withDash(row?.[3]),
        workTotal: withDash(row?.[4]),
        workDay: withDash(row?.[5]),
        workNight: withDash(row?.[6]),
        kms: withDash(row?.[7]),
      };
      weekSection.rows.push(dayRow);
      dailyRows.push(dayRow);
    }

    if (weekSection.rows.length || weekSection.totals.workTotal !== '-') {
      weeklySections.push(weekSection);
    }
  }

  return { periodTotals, weeklySections, dailyRows };
};

const pickWorkActivityBounds = (activities = []) => {
  const list = Array.isArray(activities) ? activities : [];
  const active = list.filter((activity) => {
    const type = String(activity?.activityType || '').toLowerCase();
    return type && type !== 'break' && type !== 'unknown';
  });
  const target = active.length ? active : list;
  const first = target[0] || null;
  const last = target[target.length - 1] || null;
  return {
    first: first?.startDateTime ? toTimeFromIso(first.startDateTime) : '--',
    last: last?.endDateTime ? toTimeFromIso(last.endDateTime) : '--',
  };
};

const buildLulPreviewHtml = ({
  companyName,
  driverName,
  driverCardId,
  reportCode,
  reportLabel,
  generatedAt,
  startDate,
  endDate,
  rows,
  workTimesData,
}) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const parsedWorkTimes = workTimesData && typeof workTimesData === 'object' ? workTimesData : null;
  const periodTotals = parsedWorkTimes?.periodTotals || {
    workTotal: '-',
    workDay: '-',
    workNight: '-',
    kms: '-',
  };
  const weeklySections = Array.isArray(parsedWorkTimes?.weeklySections) ? parsedWorkTimes.weeklySections : [];
  const weeklyTablesHtml = weeklySections.map((week) => {
    const weekRows = Array.isArray(week?.rows) ? week.rows : [];
    const rowsHtml = weekRows.map((row) => `
        <tr>
          <td>${escapeHtml(row.date)}, ${escapeHtml(row.dayName)}</td>
          <td>${escapeHtml(row.startTime)}</td>
          <td>${escapeHtml(row.endTime)}</td>
          <td>${escapeHtml(row.amplitude)}</td>
          <td>${escapeHtml(row.workTotal)}</td>
          <td>${escapeHtml(row.workDay)}</td>
          <td>${escapeHtml(row.workNight)}</td>
          <td>${escapeHtml(row.kms)}</td>
        </tr>
      `).join('');
    return `
      <table class="weekly-table">
        <thead>
          <tr>
            <th>${escapeHtml(week?.label || 'Settimana')}</th>
            <th>Inizio giornata</th>
            <th>Fine del giorno</th>
            <th>Ampiezza</th>
            <th>Lavoro totale</th>
            <th>Lavoro diurno</th>
            <th>Lavoro notturno</th>
            <th>Kms</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="week-total-row">
            <td class="week-total-label">Totali settimanali</td>
            <td></td>
            <td></td>
            <td></td>
            <td class="week-total-value">${escapeHtml(week?.totals?.workTotal || '-')}</td>
            <td class="week-total-value">${escapeHtml(week?.totals?.workDay || '-')}</td>
            <td class="week-total-value">${escapeHtml(week?.totals?.workNight || '-')}</td>
            <td class="week-total-value">${escapeHtml(week?.totals?.kms || '-')}</td>
          </tr>
        </tbody>
      </table>
    `;
  }).join('');
  const fallbackRowsHtml = safeRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.startTime)}</td>
        <td>${escapeHtml(row.endTime)}</td>
        <td>${escapeHtml(row.amplitude)}</td>
        <td>${escapeHtml(row.workTotal)}</td>
        <td>${escapeHtml(row.kms)}</td>
      </tr>
    `).join('');

  const logoPath = path.join(__dirname, '..', 'views', 'assets', 'images', 'logo_black.png');
  let logoDataUri = '';
  try {
    const logoBytes = fs.readFileSync(logoPath);
    logoDataUri = `data:image/png;base64,${logoBytes.toString('base64')}`;
  } catch (_) {
    logoDataUri = '';
  }

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Generatore LUL</title>
    <style>
      :root { --ink:#0f172a; --muted:#475569; --line:#d4d4d8; --accent:#ff6a00; --accent-soft:#ffedd5; --bg:#ffffff; }
      html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);font-family:Segoe UI,Arial,sans-serif;}
      *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
      .page{padding:24px;}
      .head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:2px solid #e5e7eb;padding-bottom:14px;margin-bottom:16px;}
      .brand-block{display:flex;flex-direction:column;gap:6px;align-items:flex-start;}
      .logo{height:44px;width:240px;display:block;align-self:flex-start;object-fit:contain;object-position:left center;}
      .driver-name{font-size:30px;line-height:1.05;font-weight:900;letter-spacing:.02em;margin:0;text-transform:uppercase;}
      .driver-card{margin:0;color:#334155;font-size:13px;font-weight:600;}
      .sub{margin:4px 0 0;color:var(--muted);font-size:12px;}
      .meta{display:grid;grid-template-columns:auto auto;gap:4px 16px;font-size:12px;}
      .meta strong{font-weight:700;}
      .section{margin-top:12px;}
      .section h2{margin:0 0 8px;font-size:14px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      thead th{background:var(--accent) !important;color:#111827;border:1px solid #f59e0b;padding:6px;text-align:left;font-weight:800;white-space:nowrap;}
      tbody td{border:1px solid var(--line);padding:6px;white-space:nowrap;}
      tbody tr:nth-child(even){background:#fafafa;}
      .small{font-size:12px;color:var(--muted);}
      .totals-table tbody td{font-weight:800;background:var(--accent-soft) !important;}
      .weekly-table{margin-bottom:14px;}
      .week-total-label{font-weight:800;background:var(--accent) !important;color:#111827;border-color:#f59e0b;}
      .week-total-value{font-weight:800;background:var(--accent-soft) !important;}
      @page{size:A4 portrait;margin:10mm;}
      @media print{
        html,body{background:#fff !important;}
        .page{padding:0;}
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="head">
        <div class="brand-block">
          ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="Truckly" />` : ''}
          <h1 class="driver-name">${escapeHtml(driverName || 'Autista')}</h1>
          <p class="driver-card">ID Carta: ${escapeHtml(driverCardId || '--')}</p>
          <p class="sub">${escapeHtml(reportCode)} - ${escapeHtml(reportLabel)}</p>
        </div>
        <div class="meta">
          <strong>Generato il</strong><span>${escapeHtml(generatedAt)}</span>
          <strong>Azienda</strong><span>${escapeHtml(companyName)}</span>
          <strong>Da</strong><span>${escapeHtml(startDate)}</span>
          <strong>A</strong><span>${escapeHtml(endDate)}</span>
        </div>
      </div>

      <div class="section">
        <h2>Totali periodo analizzato</h2>
        <table class="totals-table">
          <thead>
            <tr>
              <th>Lavoro totale</th>
              <th>Lavoro diurno</th>
              <th>Lavoro notturno</th>
              <th>Kms</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(periodTotals.workTotal)}</td>
              <td>${escapeHtml(periodTotals.workDay)}</td>
              <td>${escapeHtml(periodTotals.workNight)}</td>
              <td>${escapeHtml(periodTotals.kms)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <h2>Tabelle settimanali</h2>
        ${weeklyTablesHtml || '<p class="small">Nessun riepilogo settimanale disponibile.</p>'}
      </div>

      ${!weeklyTablesHtml && fallbackRowsHtml ? `
      <div class="section">
        <h2>Dettaglio giornaliero</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Inizio giornata</th>
              <th>Fine giornata</th>
              <th>Ampiezza</th>
              <th>Lavoro totale</th>
              <th>Kms</th>
            </tr>
          </thead>
          <tbody>${fallbackRowsHtml}</tbody>
        </table>
      </div>` : ''}
    </div>
  </body>
</html>`;
};

const parseHexColor = (value, fallback = [0.07, 0.1, 0.15]) => {
  const raw = String(value || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    return rgb(fallback[0], fallback[1], fallback[2]);
  }
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
};

const normalizePdfProvider = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'seep') return 'seep';
  return 'truckly';
};

const applyTrucklyBrandingToPdf = async (buffer, options = {}) => {
  const primary = parseHexColor(options.primaryColor || '111827', [0.07, 0.1, 0.15]);
  const companyName = String(options.companyName || 'Truckly').trim() || 'Truckly';
  const logoPath = path.join(__dirname, '..', 'views', 'assets', 'images', 'logo_black.png');

  const doc = await PDFDocument.load(buffer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logoImage = null;
  try {
    const logoBytes = fs.readFileSync(logoPath);
    logoImage = await doc.embedPng(logoBytes);
  } catch (_) {
    logoImage = null;
  }

  const pages = doc.getPages();
  pages.forEach((page) => {
    const { width, height } = page.getSize();

    // Clear only the top header strip so we do not crop underlying section titles.
    const stripY = height - 74;
    const stripH = 58;
    page.drawRectangle({ x: 0, y: stripY, width, height: stripH, color: rgb(1, 1, 1) });

    if (logoImage) {
      const scaled = logoImage.scale(0.27);
      page.drawImage(logoImage, {
        x: 18,
        y: height - 69,
        width: scaled.width,
        height: scaled.height,
      });
    } else {
      page.drawText(companyName, { x: 20, y: height - 54, size: 24, font: fontBold, color: primary });
    }
  });

  return Buffer.from(await doc.save());
};

const recolorAndNormalizeSeepPdf = (buffer) => {
  try {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'seep-pdf-postprocess.py');
    if (!fs.existsSync(scriptPath)) return buffer;
    const nonce = crypto.randomBytes(8).toString('hex');
    const inputPath = path.join(os.tmpdir(), `seep_in_${nonce}.pdf`);
    const outputPath = path.join(os.tmpdir(), `seep_out_${nonce}.pdf`);
    fs.writeFileSync(inputPath, buffer);
    const run = spawnSync('python', [scriptPath, inputPath, outputPath], {
      encoding: 'utf8',
      timeout: 20_000,
    });
    if (run.status !== 0 || !fs.existsSync(outputPath)) {
      try { fs.unlinkSync(inputPath); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
      return buffer;
    }
    const out = fs.readFileSync(outputPath);
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
    return out;
  } catch (_) {
    return buffer;
  }
};

const resolveDriverGraphsPayload = async (payload = {}) => {
  const {
    localDriverId,
    tachoDriverId: requestedTachoDriverId,
    seepDriverId,
    startDate,
    endDate,
    timezone = 'UTC',
    regulation = 0,
    penalty = 0,
    onlyInfringementsGraphs = false,
    ignoreCountrySelectedInfringements = false,
  } = payload || {};

  if (!startDate || !endDate) {
    const err = new Error('startDate e endDate sono obbligatori.');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }
  if (!localDriverId && !requestedTachoDriverId && !seepDriverId) {
    const err = new Error('Serve almeno uno tra localDriverId, tachoDriverId o seepDriverId.');
    err.statusCode = 400;
    err.code = 'BAD_REQUEST';
    throw err;
  }

  let resolvedLocalDriver = null;
  let resolvedTachoDriverId = requestedTachoDriverId ? String(requestedTachoDriverId).trim() : null;
  if (localDriverId && mongoose.Types.ObjectId.isValid(String(localDriverId))) {
    resolvedLocalDriver = await Drivers.findById(localDriverId).lean();
    if (!resolvedLocalDriver) {
      const err = new Error('Autista locale non trovato.');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (!resolvedTachoDriverId) {
      resolvedTachoDriverId = resolvedLocalDriver?.tachoDriverId
        ? String(resolvedLocalDriver.tachoDriverId).trim()
        : null;
    }
  }

  const output = await SeepTrucker.driverGraphs({
    localDriverId: localDriverId ? String(localDriverId).trim() : null,
    tachoDriverId: resolvedTachoDriverId,
    seepDriverId: seepDriverId ? String(seepDriverId).trim() : null,
    localDriverName: resolvedLocalDriver?.name || null,
    localDriverSurname: resolvedLocalDriver?.surname || null,
    startDate,
    endDate,
    timezone,
    regulation,
    penalty,
    onlyInfringementsGraphs,
    ignoreCountrySelectedInfringements,
  });

  return {
    output,
    resolvedLocalDriver,
    request: {
      localDriverId: localDriverId ? String(localDriverId).trim() : null,
      tachoDriverId: resolvedTachoDriverId,
      seepDriverId: seepDriverId ? String(seepDriverId).trim() : null,
      startDate,
      endDate,
      timezone,
    },
  };
};

const normalizeCompanyName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const resolveCompanyByTachoId = async (tachoCompanyId) => {
  if (!tachoCompanyId) return null;
  const rawId = String(tachoCompanyId).trim();
  if (!rawId) return null;
  if (mongoose.Types.ObjectId.isValid(rawId)) {
    const local = await Companies.findById(rawId).lean();
    if (local) return local;
  }
  const direct = await Companies.findOne({ tkCompanyId: rawId }).lean();
  if (direct) return direct;
  try {
    const flat = await TachoSync.companiesFlat();
    const list = Array.isArray(flat) ? flat : [];
    const byId = new Map(list.map((company) => [String(company.id), company]));
    let currentId = rawId;
    const visited = new Set();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const entry = byId.get(currentId);
      if (!entry?.parentId) break;
      const parentId = String(entry.parentId);
      const parentMatch = await Companies.findOne({ tkCompanyId: parentId }).lean();
      if (parentMatch) return parentMatch;
      currentId = parentId;
    }

    const directEntry = byId.get(rawId);
    const tachoName = directEntry?.name ? normalizeCompanyName(directEntry.name) : '';
    if (tachoName) {
      const locals = await Companies.find({}, { name: 1, tkCompanyId: 1 }).lean();
      const matches = locals.filter(
        (company) => normalizeCompanyName(company?.name) === tachoName
      );
      if (matches.length === 1) {
        console.warn('[api] resolveCompanyByTachoId matched by name', {
          tachoCompanyId: rawId,
          companyId: matches[0]?._id?.toString?.() || matches[0]?._id || null,
          name: matches[0]?.name || null,
        });
        return matches[0];
      }
      if (matches.length > 1) {
        console.warn('[api] resolveCompanyByTachoId multiple name matches', {
          tachoCompanyId: rawId,
          name: directEntry?.name || null,
          matches: matches.map((company) => company?._id?.toString?.() || company?._id),
        });
      }
    }
  } catch (err) {
    console.warn('[api] unable to resolve tacho company parent', err?.message || err);
  }
  return null;
};

const resolveCompanyFromRequest = async (req, tachoCompanyId) => {
  if (isSuperAdmin(req.user)) {
    if (tachoCompanyId) {
      const company = await resolveCompanyByTachoId(tachoCompanyId);
      return company || null;
    }
    return null;
  }
  if (!req.user?.companyId) return null;
  return Companies.findById(req.user.companyId).lean();
};

const ensureVehicleOwnership = async (user, imei) => {
  if (!user || !imei) return false;
  try {
    const vehicles = await user.vehicles.list();
    return Array.isArray(vehicles) && vehicles.some((v) => `${v.imei}` === `${imei}`);
  } catch (err) {
    console.warn('[api] unable to verify vehicle ownership', err);
    return false;
  }
};

const normalizePlateForCollection = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'OLDPLATE';
};

const renameMonitoringCollection = async (imei, oldPlate) => {
  const db = mongoose.connection?.db;
  if (!db || !imei) return { skipped: true, reason: 'no-db' };
  const from = `${imei}_monitoring`;
  const targetBase = `${imei}_${normalizePlateForCollection(oldPlate)}_monitoring`;
  const fromExists = await db.listCollections({ name: from }).hasNext();
  if (!fromExists) return { skipped: true, reason: 'missing-source' };
  let target = targetBase;
  const targetExists = await db.listCollections({ name: target }).hasNext();
  if (targetExists) {
    target = `${targetBase}_${Date.now()}`;
  }
  await db.collection(from).rename(target);
  return { renamed: true, to: target };
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
        effectivePrivilege: getPrivilegeLevel(user),
      },
    });
  } catch (err) {
    console.error('[api] /session error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/admin/companies', auth, async (req, res) => {
  const privilegeLevel = getPrivilegeLevel(req.user);
  if (privilegeLevel > 2) {
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
    if (!isSuperAdmin(req.user)) {
      const companyId = req.user?.companyId || null;
      if (!companyId) {
        return res.status(200).json({ companies: [] });
      }
      const company = await Companies.findById(companyId).lean();
      if (!company) {
        return res.status(200).json({ companies: [] });
      }
      const users = await UserModel.find({ companyId }).lean();
      const list = users.map((user) => ({
        id: user._id?.toString?.() || user._id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email,
        role: Number.isInteger(user.role) ? user.role : null,
        privilege: Number.isInteger(user.privilege) ? user.privilege : null,
        status: Number.isInteger(user.status) ? user.status : null,
        createdAt: user.createdAt || null,
      }));
      list.sort((a, b) => (a.privilege ?? 99) - (b.privilege ?? 99));
      return res.status(200).json({
        companies: [
          {
            id: company._id?.toString?.() || company._id,
            name: company.name,
            status: company.status ?? 0,
            createdAt: company.createdAt || null,
            updatedAt: company.updatedAt || null,
            userCount: list.length,
            users: list,
          },
        ],
      });
    }

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

    const canDumpDebug = process.env.NODE_ENV !== 'production' && !process.env.K_SERVICE;
    if (canDumpDebug) {
      try {
        const dumpPath = path.join(process.cwd(), 'Files_info.json');
        fs.writeFileSync(
          dumpPath,
          JSON.stringify(
            {
              fetchedAt: new Date().toISOString(),
              source,
              request: {
                companyId,
                from,
                to,
                contains,
                pageNumber,
                pageSize,
              },
              teltonikaParams: params,
              driverSample: driverItems[0] || null,
              vehicleSample: vehicleItems[0] || null,
            },
            null,
            2,
          ),
          'utf8',
        );
        console.log('[api] dumped files info to', dumpPath);
      } catch (err) {
        console.warn('[api] failed to dump files info', err?.message || err);
      }
    }

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
      if (from || to) return { from, to, source: 'period' };
      const fallback = item?.downloadTime || null;
      return { from: fallback, to: fallback, source: fallback ? 'downloadTime' : 'unknown' };
    };

    const normalize = (item, kind) => {
      const period = resolvePeriod(item);
      return {
        id: item?.id,
        fileName: item?.fileName || null,
        downloadTime: item?.downloadTime || null,
        periodFrom: period.from,
        periodTo: period.to,
        periodSource: period.source,
        company: item?.company || null,
        driver: item?.driver || null,
        vehicle: item?.vehicle || null,
        source: kind,
      };
    };

    const allItems = [
      ...driverItems.map((item) => normalize(item, 'driver')),
      ...vehicleItems.map((item) => normalize(item, 'vehicle')),
    ];

    const filtered = allItems.filter((item) => {
      const name = typeof item.fileName === 'string' ? item.fileName.toLowerCase() : '';
      return !name || name.endsWith('.ddd');
    });

    const seepStatusRows = await SeepFileStatus.find(
      { teltonikaFileId: { $in: filtered.map((item) => String(item.id || '')).filter(Boolean) } },
      {
        _id: 0,
        teltonikaFileId: 1,
        seepUploaded: 1,
        seepFileId: 1,
        uploadedAt: 1,
        lastCheckedAt: 1,
        error: 1,
      },
    ).lean();
    const seepById = new Map(
      seepStatusRows.map((row) => [String(row.teltonikaFileId || ''), row]),
    );

    const enriched = filtered.map((item) => {
      const seep = seepById.get(String(item.id || ''));
      let syncState = 'pending';
      if (seep?.seepUploaded) syncState = 'uploaded';
      else if (seep?.error) syncState = 'error';
      return {
        ...item,
        seepUploaded: Boolean(seep?.seepUploaded),
        seepFileId: seep?.seepFileId || null,
        uploadedAt: seep?.uploadedAt || null,
        lastCheckedAt: seep?.lastCheckedAt || null,
        error: seep?.error || null,
        syncState,
      };
    });

    enriched.sort((a, b) => {
      const ta = a.downloadTime ? new Date(a.downloadTime).getTime() : 0;
      const tb = b.downloadTime ? new Date(b.downloadTime).getTime() : 0;
      return tb - ta;
    });

    return res.status(200).json({
      items: enriched,
      total: enriched.length,
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
  if (!canManageUsers(req.user)) {
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
    allowedVehicleIds,
    allowedVehicleIdsMode,
    allowedVehicleTags,
    allowedVehicleTagsMode,
  } = req.body || {};

  if (!firstName || !lastName || !phone || !email || !password) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Campi obbligatori mancanti.' });
  }

  const normalizeTags = (value) => {
    if (Array.isArray(value)) {
      return value.map((tag) => String(tag).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(',').map((tag) => tag.trim()).filter(Boolean);
    }
    return [];
  };

  const normalizeIds = (value) => {
    if (Array.isArray(value)) {
      return value.map((id) => String(id).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(',').map((id) => id.trim()).filter(Boolean);
    }
    return [];
  };

  const isAdmin = isSuperAdmin(req.user);
  const resolvedCompanyId = isAdmin ? companyId : req.user?.companyId;
  if (!resolvedCompanyId) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda non valida.' });
  }

  const resolvedRole = isAdmin && Number.isFinite(Number(role)) ? Number(role) : 3;
  const resolvedPrivilege = resolvedRole;
  const resolvedIds = normalizeIds(allowedVehicleIds);
  const resolvedIdsMode = allowedVehicleIdsMode === 'exclude' ? 'exclude' : 'include';
  const resolvedTags = normalizeTags(allowedVehicleTags);
  const resolvedTagsMode = allowedVehicleTagsMode === 'exclude' ? 'exclude' : 'include';

  try {
    const user = await _Users.new(
      String(firstName),
      String(lastName),
      String(phone),
      String(email),
      String(password),
      resolvedCompanyId,
      resolvedRole,
      Number(status),
      resolvedPrivilege,
      resolvedPrivilege === 3 ? resolvedIds : [],
      resolvedPrivilege === 3 ? resolvedIdsMode : 'include',
      resolvedPrivilege === 3 ? resolvedTags : [],
      resolvedPrivilege === 3 ? resolvedTagsMode : 'include',
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

router.get('/admin/users/:id', auth, async (req, res) => {
  if (!canManageUsers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const userId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  try {
    const user = await UserModel.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (!isSuperAdmin(req.user) && String(user.companyId || '') !== String(req.user?.companyId || '')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    return res.status(200).json({
      user: {
        id: user._id?.toString?.() || user._id,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        role: Number.isInteger(user.role) ? user.role : null,
        privilege: Number.isInteger(user.privilege) ? user.privilege : null,
        allowedVehicleIds: Array.isArray(user.allowedVehicleIds) ? user.allowedVehicleIds : [],
        allowedVehicleIdsMode: user.allowedVehicleIdsMode === 'exclude' ? 'exclude' : 'include',
        allowedVehicleTags: Array.isArray(user.allowedVehicleTags) ? user.allowedVehicleTags : [],
        allowedVehicleTagsMode: user.allowedVehicleTagsMode === 'exclude' ? 'exclude' : 'include',
      },
    });
  } catch (err) {
    console.error('[api] /admin/users get error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.patch('/admin/users/:id', auth, async (req, res) => {
  if (!canManageUsers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const userId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  const {
    allowedVehicleIds,
    allowedVehicleIdsMode,
    allowedVehicleTags,
    allowedVehicleTagsMode,
  } = req.body || {};

  const normalizeIds = (value) => {
    if (Array.isArray(value)) {
      return value.map((id) => String(id).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(',').map((id) => id.trim()).filter(Boolean);
    }
    return [];
  };

  const normalizeTags = (value) => {
    if (Array.isArray(value)) {
      return value.map((tag) => String(tag).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(',').map((tag) => tag.trim()).filter(Boolean);
    }
    return [];
  };

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (!isSuperAdmin(req.user) && String(user.companyId || '') !== String(req.user?.companyId || '')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const targetRole = Number.isInteger(user.role) ? user.role : null;
    if (targetRole !== 3) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Restrizioni applicabili solo a utenti sola lettura.' });
    }

    user.allowedVehicleIds = normalizeIds(allowedVehicleIds);
    user.allowedVehicleIdsMode = allowedVehicleIdsMode === 'exclude' ? 'exclude' : 'include';
    user.allowedVehicleTags = normalizeTags(allowedVehicleTags);
    user.allowedVehicleTagsMode = allowedVehicleTagsMode === 'exclude' ? 'exclude' : 'include';
    await user.save();

    return res.status(200).json({
      user: {
        id: user._id?.toString?.() || user._id,
        role: user.role,
        allowedVehicleIds: user.allowedVehicleIds,
        allowedVehicleIdsMode: user.allowedVehicleIdsMode,
        allowedVehicleTags: user.allowedVehicleTags,
        allowedVehicleTagsMode: user.allowedVehicleTagsMode,
      },
    });
  } catch (err) {
    console.error('[api] /admin/users update error:', err);
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

    const privilegeLevel = getPrivilegeLevel(user);
    let rows = [];

    if (privilegeLevel === 0) {
      rows = await Vehicles.find({}).lean();
    } else if (privilegeLevel >= 3) {
      const allowedIds = Array.isArray(user.allowedVehicleIds)
        ? user.allowedVehicleIds.map((id) => String(id).trim()).filter(Boolean)
        : [];
      const allowedIdsMode = user.allowedVehicleIdsMode === 'exclude' ? 'exclude' : 'include';
      const allowedTags = Array.isArray(user.allowedVehicleTags)
        ? user.allowedVehicleTags.map((tag) => String(tag).trim()).filter(Boolean)
        : [];
      const allowedMode = user.allowedVehicleTagsMode === 'exclude' ? 'exclude' : 'include';
      if (!user.companyId) {
        return res.status(200).json({ vehicles: [] });
      }
      const owners = await UserModel.find({ companyId: user.companyId }, { _id: 1 }).lean();
      const ownerIds = owners.map((owner) => owner._id);

      if (allowedIds.length) {
        const normalizedIds = allowedIds
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id));
        if (!normalizedIds.length) {
          return res.status(200).json({ vehicles: [] });
        }
        if (allowedIdsMode === 'exclude') {
          rows = await Vehicles.find({
            owner: { $in: ownerIds },
            _id: { $nin: normalizedIds }
          }).lean();
        } else {
          rows = await Vehicles.find({
            owner: { $in: ownerIds },
            _id: { $in: normalizedIds }
          }).lean();
        }
      } else if (!allowedTags.length) {
        if (allowedMode === 'exclude') {
          rows = await Vehicles.find({ owner: { $in: ownerIds } }).lean();
        } else {
          return res.status(200).json({ vehicles: [] });
        }
      } else if (allowedMode === 'exclude') {
        rows = await Vehicles.find({
          owner: { $in: ownerIds },
          tags: { $nin: allowedTags }
        }).lean();
      } else {
        rows = await Vehicles.find({
          owner: { $in: ownerIds },
          tags: { $in: allowedTags }
        }).lean();
      }
    } else if (user.companyId) {
      const owners = await UserModel.find({ companyId: user.companyId }, { _id: 1 }).lean();
      const ownerIds = owners.map((owner) => owner._id);
      rows = await Vehicles.find({ owner: { $in: ownerIds } }).lean();
    } else {
      const ownerValues = [user.id];
      if (mongoose.Types.ObjectId.isValid(user.id)) {
        ownerValues.push(new mongoose.Types.ObjectId(user.id));
      }
      rows = await Vehicles.find({ owner: { $in: ownerValues } }).lean();
    }

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

        // Super admin should see all vehicles, even if decrypted fields are missing.
        if (privilegeLevel !== 0) {
          // Do not send vehicles without decrypted core fields for non-super admins.
          if (!decorated.plate || !decorated.brand || !decorated.model || !decorated.details) {
            console.warn(
              '[api] /vehicles skipping vehicle missing decrypted fields',
              vehicle._id?.toString?.() || vehicle._id
            );
            return null;
          }
        }

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          const fallback = decorated?.details?.lastPosition || null;
          const toNumber = (val) => {
            const num = Number(val);
            return Number.isFinite(num) ? num : null;
          };
          const fLat = toNumber(fallback?.lat);
          const fLon = toNumber(fallback?.lon);
          if (fLat !== null && fLon !== null) {
            lat = fLat;
            lon = fLon;
          }
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

router.post('/vehicles/update', auth, async (req, res) => {
  try {
    if (!canEditVehicles(req.user)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Non sei autorizzato a modificare veicoli.' });
    }

    const vehicleId = typeof req.body.id === 'string' ? req.body.id.trim() : '';
    if (!vehicleId) {
      return res.status(400).json({ message: 'ID veicolo richiesto.' });
    }

    const existing = await Vehicles.findById(vehicleId);
    if (!existing) {
      return res.status(404).json({ message: 'Veicolo non trovato.' });
    }

    const ownsVehicle = await ensureVehicleOwnership(req.user, existing.imei);
    if (!ownsVehicle) {
      return res.status(404).json({ message: 'Veicolo non trovato.' });
    }

    const oldPlate = decryptString(existing.plateEnc || '') || '';
    const oldBrand = decryptString(existing.brandEnc || '') || '';
    const oldModel = decryptString(existing.modelEnc || '') || '';

    const nextPlate = typeof req.body.plate === 'string' ? req.body.plate.trim() : '';
    const nextBrand = typeof req.body.brand === 'string' ? req.body.brand.trim() : '';
    const nextModel = typeof req.body.model === 'string' ? req.body.model.trim() : '';

    const plateChanged = nextPlate && nextPlate.toLowerCase() !== oldPlate.trim().toLowerCase();
    const brandChanged = nextBrand && nextBrand.toLowerCase() !== oldBrand.trim().toLowerCase();
    const modelChanged = nextModel && nextModel.toLowerCase() !== oldModel.trim().toLowerCase();
    const monitoringPolicy =
      req.body.monitoringPolicy === 'rename'
        ? 'rename'
        : req.body.monitoringPolicy === 'append'
          ? 'append'
          : null;

    if ((plateChanged || brandChanged || modelChanged) && !monitoringPolicy) {
      return res.status(409).send('Seleziona come gestire lo storico per targa/marca/modello aggiornati.');
    }

    if (monitoringPolicy === 'rename' && (plateChanged || brandChanged || modelChanged)) {
      try {
        await renameMonitoringCollection(existing.imei, oldPlate || nextPlate);
      } catch (err) {
        console.error('[api]/vehicles/update rename monitoring failed', err);
        return res.status(500).json({ message: 'Impossibile rinominare lo storico.' });
      }
    }

    const detailsPayload =
      req.body.details && typeof req.body.details === 'object'
        ? req.body.details
        : null;
    const normalizedTags = Array.isArray(req.body.tags)
      ? req.body.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];

    const update = {
      nickname: typeof req.body.nickname === 'string' ? req.body.nickname.trim() : existing.nickname,
      plateEnc: encryptString(nextPlate || oldPlate),
      brandEnc: encryptString(nextBrand || oldBrand),
      modelEnc: encryptString(nextModel || oldModel),
      detailsEnc: detailsPayload ? encryptJSON(detailsPayload) : existing.detailsEnc,
      deviceModel: typeof req.body.deviceModel === 'string' ? req.body.deviceModel.trim() : existing.deviceModel,
      codec: typeof req.body.codec === 'string' ? req.body.codec.trim() : existing.codec,
      tags: normalizedTags
    };

    const updated = await Vehicles.findByIdAndUpdate(vehicleId, { $set: update }, { new: true });
    return res.status(200).json({ vehicle: updated });
  } catch (err) {
    console.error('[api]/vehicles/update error', err);
    return res.status(500).json({ message: 'Errore interno' });
  }
});

router.post('/vehicles/custom-fields', auth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Non sei autorizzato a modificare i campi.' });
    }

    const vehicleId = typeof req.body.id === 'string' ? req.body.id.trim() : '';
    if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
      return res.status(400).json({ message: 'ID veicolo non valido.' });
    }

    const existing = await Vehicles.findById(vehicleId);
    if (!existing) {
      return res.status(404).json({ message: 'Veicolo non trovato.' });
    }

    const ownsVehicle = await ensureVehicleOwnership(req.user, existing.imei);
    if (!ownsVehicle) {
      return res.status(404).json({ message: 'Veicolo non trovato.' });
    }

    const fieldsRaw = Array.isArray(req.body.fields) ? req.body.fields : [];
    const allowedIcons = new Set([
      'fa fa-tag',
      'fa fa-bolt',
      'fa fa-thermometer-half',
      'fa fa-tint',
      'fa fa-plug',
      'fa fa-wrench',
      'fa fa-id-card',
      'fa fa-hashtag',
      'fa fa-toggle-on',
      'fa fa-tachometer',
    ]);
    const seenKeys = new Set();
    const normalized = fieldsRaw
      .map((field) => {
        const key = typeof field?.key === 'string' ? field.key.trim() : '';
        const label = typeof field?.label === 'string' ? field.label.trim() : '';
        const typeRaw = typeof field?.type === 'string' ? field.type.trim().toLowerCase() : '';
        const iconRaw = typeof field?.icon === 'string' ? field.icon.trim() : '';
        const type = typeRaw === 'number' || typeRaw === 'id' ? typeRaw : 'onoff';
        if (!key || !label || seenKeys.has(key)) return null;
        seenKeys.add(key);
        const icon = allowedIcons.has(iconRaw) ? iconRaw : 'fa fa-tag';
        const factorRaw = Number(field?.normalizationFactor);
        const normalizationFactor = type === 'number' && Number.isFinite(factorRaw) && factorRaw !== 0
          ? factorRaw
          : 1;
        return { key, label, type, icon, normalizationFactor };
      })
      .filter(Boolean)
      .slice(0, 12);

    const updated = await Vehicles.findByIdAndUpdate(
      vehicleId,
      { $set: { customFields: normalized } },
      { new: true }
    );

    return res.status(200).json({ customFields: updated?.customFields || [] });
  } catch (err) {
    console.error('[api]/vehicles/custom-fields error', err);
    return res.status(500).json({ message: 'Errore interno' });
  }
});

router.post('/vehicles/delete', auth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Non sei autorizzato a eliminare veicoli.' });
    }
    const vehicleId = typeof req.body.id === 'string' ? req.body.id.trim() : '';
    if (!vehicleId) {
      return res.status(400).json({ message: 'ID veicolo richiesto.' });
    }

    const existing = await Vehicles.findById(vehicleId);
    if (!existing) {
      return res.status(404).json({ message: 'Veicolo non trovato.' });
    }

    const ownsVehicle = await ensureVehicleOwnership(req.user, existing.imei);
    if (!ownsVehicle) {
      return res.status(404).json({ message: 'Veicolo non trovato.' });
    }

    await Vehicles.findByIdAndDelete(vehicleId);
    if (Array.isArray(existing.owner) && existing.owner.length) {
      await UserModel.updateMany(
        { _id: { $in: existing.owner } },
        { $pull: { vehicles: vehicleId } }
      );
    }
    if (existing.imei) {
      await _Devices.unauthorize(existing.imei);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api]/vehicles/delete error', err);
    return res.status(500).json({ message: 'Errore interno' });
  }
});

router.post('/vehicles/assign', auth, async (req, res) => {
  try {
    if (!canEditVehicles(req.user)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Non sei autorizzato ad assegnare veicoli.' });
    }
    const vehicleId = typeof req.body.id === 'string' ? req.body.id.trim() : '';
    const targetCompanyId = typeof req.body.companyId === 'string' ? req.body.companyId.trim() : '';
    if (!vehicleId || !targetCompanyId) {
      return res.status(400).json({ message: 'ID veicolo e azienda richiesti.' });
    }
    const existing = await Vehicles.findById(vehicleId);
    if (!existing) {
      return res.status(404).json({ message: 'Veicolo non trovato.' });
    }
    const owners = await UserModel.find(
      { companyId: targetCompanyId },
      { _id: 1 }
    ).lean();
    const ownerIds = owners.map((owner) => owner._id);
    if (!ownerIds.length) {
      return res.status(400).json({ message: 'Azienda selezionata senza utenti.' });
    }
    const previousOwners = Array.isArray(existing.owner) ? existing.owner : [];
    if (previousOwners.length) {
      await UserModel.updateMany(
        { _id: { $in: previousOwners } },
        { $pull: { vehicles: vehicleId } }
      );
    }
    await UserModel.updateMany(
      { _id: { $in: ownerIds } },
      { $addToSet: { vehicles: vehicleId } }
    );
    const updated = await Vehicles.findByIdAndUpdate(
      vehicleId,
      { $set: { owner: ownerIds } },
      { new: true }
    );
    return res.status(200).json({ vehicle: updated });
  } catch (err) {
    console.error('[api]/vehicles/assign error', err);
    return res.status(500).json({ message: 'Errore interno' });
  }
  });

router.post('/vehicles/owners', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ message: 'Operazione non autorizzata.' });
  }

  const vehicleId = typeof req.body.id === 'string' ? req.body.id.trim() : '';
  if (!vehicleId || !mongoose.Types.ObjectId.isValid(vehicleId)) {
    return res.status(400).json({ message: 'Veicolo non valido.' });
  }
  const requestedCompanies = Array.isArray(req.body.companyIds)
    ? req.body.companyIds.map((companyId) => String(companyId).trim()).filter(Boolean)
    : [];
  if (!requestedCompanies.length) {
    return res.status(400).json({ message: 'Seleziona almeno una azienda.' });
  }

  try {
    const existing = await Vehicles.findById(vehicleId);
    if (!existing) {
      return res.status(404).json({ message: 'Veicolo non trovato.' });
    }

    const ownerDocs = await UserModel.find(
      { companyId: { $in: requestedCompanies } },
      { _id: 1 }
    ).lean();
    const ownerIds = ownerDocs.map((owner) => owner._id);
    if (!ownerIds.length) {
      return res.status(400).json({ message: 'Le aziende selezionate non hanno utenti.' });
    }

    const previousOwners = Array.isArray(existing.owner) ? existing.owner : [];
    if (previousOwners.length) {
      await UserModel.updateMany(
        { _id: { $in: previousOwners } },
        { $pull: { vehicles: existing._id } }
      );
    }
    await UserModel.updateMany(
      { _id: { $in: ownerIds } },
      { $addToSet: { vehicles: existing._id } }
    );

    const updated = await Vehicles.findByIdAndUpdate(
      existing._id,
      { $set: { owner: ownerIds } },
      { new: true }
    );

    return res.status(200).json({ vehicle: updated });
  } catch (err) {
    console.error('[api]/vehicles/owners error', err);
    return res.status(500).json({ message: 'Errore interno' });
  }
});

router.get('/drivers/companies', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    if (isSuperAdmin(req.user)) {
      const tachoCompanies = await TachoSync.companiesFlat();
      const list = Array.isArray(tachoCompanies) ? tachoCompanies : [];
      const payload = list
        .map((company) => ({
          id: company.id || company._id,
          name: company.name,
          parentId: company.parentId || null,
          depth: Number.isFinite(company.depth) ? company.depth : 0,
        }))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it", { sensitivity: "base" }));
      return res.status(200).json({ companies: payload });
    }

    const localCompany = req.user?.companyId
      ? await Companies.findById(req.user.companyId).lean()
      : null;
    if (!localCompany?.tkCompanyId) {
      return res.status(200).json({ companies: [] });
    }
    return res.status(200).json({
      companies: [
        {
          id: localCompany.tkCompanyId,
          name: localCompany.name || 'Azienda',
        },
      ],
    });
  } catch (err) {
    console.error('[api] /drivers/companies error:', err?.message || err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/drivers/import-options', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const isAdmin = isSuperAdmin(req.user);
  const tachoCompanyId = isAdmin && typeof req.query.companyId === 'string'
    ? req.query.companyId.trim()
    : '';
  if (isAdmin && !tachoCompanyId) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'CompanyId richiesto.' });
  }

  try {
    console.log('[api] /drivers/import-options', {
      userId: req.user?._id?.toString?.() || req.user?.id || null,
      isAdmin,
      companyId: tachoCompanyId || null,
    });
    const company = await resolveCompanyFromRequest(req, isAdmin ? tachoCompanyId : null);
    if (!company) {
      console.warn('[api] /drivers/import-options invalid company', {
        companyId: tachoCompanyId || null,
      });
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda non valida.' });
    }

    const targetTachoCompanyId = company?.tkCompanyId || '';
    if (!targetTachoCompanyId) {
      console.warn('[api] /drivers/import-options missing tkCompanyId', {
        companyId: company?._id?.toString?.() || company?._id || null,
      });
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda senza collegamento servizio esterno.' });
    }

    const owners = await UserModel.find({ companyId: company._id }, { _id: 1 }).lean();
      const ownerIds = owners.map((owner) => owner._id);
      const existing = ownerIds.length
        ? await Drivers.find({ owner: { $in: ownerIds } }, { tachoDriverId: 1 }).lean()
        : [];
      const existingIds = new Set(
        existing.map((row) => String(row.tachoDriverId || '')).filter(Boolean)
      );

      console.log('[api] /drivers/import-options teltonika request', {
        tkCompanyId: targetTachoCompanyId,
      });
      const drivers = await TachoSync.drivers(targetTachoCompanyId);
      console.log('[api] /drivers/import-options teltonika response', {
        count: Array.isArray(drivers) ? drivers.length : 0,
      });
      const filtered = (Array.isArray(drivers) ? drivers : []).filter((driver) => {
        const cardNumber = driver?.cardNumber || driver?.driverCardId || driver?.driverId || '';
        return cardNumber && !existingIds.has(String(cardNumber));
      });

      return res.status(200).json({ drivers: filtered });
    } catch (err) {
      console.error('[api] /drivers/import-options error:', err?.message || err);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

router.get('/tacho/drivers', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const isAdmin = isSuperAdmin(req.user);
  const companyParam = isAdmin && typeof req.query.companyId === 'string'
    ? req.query.companyId.trim()
    : null;
  if (isAdmin && !companyParam) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'CompanyId richiesto.' });
  }
  try {
    const company = await resolveCompanyFromRequest(req, isAdmin ? companyParam : null);
    if (!company) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda non valida.' });
    }
    const targetTachoCompanyId = company?.tkCompanyId || '';
    if (!targetTachoCompanyId) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda senza collegamento servizio esterno.' });
    }
    const drivers = await TachoSync.drivers(targetTachoCompanyId);
    return res.status(200).json({ drivers: Array.isArray(drivers) ? drivers : [] });
  } catch (err) {
    console.error('[api] /tacho/drivers error:', err?.message || err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/drivers', auth, async (req, res) => {
  try {
    const isAdmin = isSuperAdmin(req.user);
    let ownerIds = [];
    if (!isAdmin) {
      const companyId = req.user?.companyId || null;
      if (!companyId) {
        return res.status(200).json({ drivers: [] });
      }
      const owners = await UserModel.find({ companyId }, { _id: 1 }).lean();
      ownerIds = owners.map((owner) => owner._id);
      if (!ownerIds.length) {
        return res.status(200).json({ drivers: [] });
      }
    }

    const rows = await Drivers.find(
      isAdmin ? {} : { owner: { $in: ownerIds } }
    ).sort({ updatedAt: -1 }).lean();

    const ownerIdList = rows
      .map((row) => row.owner)
      .filter(Boolean)
      .map((id) => id.toString());
    const owners = ownerIdList.length
      ? await UserModel.find({ _id: { $in: ownerIdList } }, { _id: 1, companyId: 1 }).lean()
      : [];
    const companyIds = owners
      .map((owner) => owner.companyId)
      .filter(Boolean)
      .map((id) => id.toString());
    const companies = companyIds.length
      ? await Companies.find({ _id: { $in: companyIds } }, { _id: 1, name: 1 }).lean()
      : [];

    const companyById = new Map(companies.map((company) => [String(company._id), company]));
    const ownerCompanyById = new Map(
      owners.map((owner) => [String(owner._id), String(owner.companyId || '')])
    );

    const drivers = rows.map((row) => {
      const ownerId = row.owner ? String(row.owner) : '';
      const companyId = ownerCompanyById.get(ownerId) || null;
      const company = companyId ? companyById.get(String(companyId)) : null;
      return {
        ...row,
        id: row._id?.toString?.() || row._id,
        companyId,
        companyName: company?.name || null,
      };
    });

    return res.status(200).json({ drivers });
  } catch (err) {
    console.error('[api] /drivers list error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/drivers', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const {
    name,
    surname,
    phone,
    tachoDriverId,
    companyId,
    registerOnTacho,
  } = req.body || {};

  const isAdmin = isSuperAdmin(req.user);
  const tachoCompanyId = isAdmin ? companyId : null;
  const resolvedCompany = await resolveCompanyFromRequest(req, tachoCompanyId);
  if (!resolvedCompany) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda non valida.' });
  }
  if (!name || !surname || !phone || !tachoDriverId) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Campi obbligatori mancanti.' });
  }

  try {
    const owners = await UserModel.find({ companyId: resolvedCompany._id }, { _id: 1, privilege: 1 })
      .sort({ privilege: 1 })
      .lean();
    if (!owners.length) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda selezionata senza utenti.' });
    }
    const ownerIds = owners.map((owner) => owner._id);
    const existing = await Drivers.findOne({
      owner: { $in: ownerIds },
      tachoDriverId: String(tachoDriverId).trim(),
    }).lean();
    if (existing) {
      return res.status(409).json({ error: 'CONFLICT', message: 'Autista già presente.' });
    }

    if (registerOnTacho) {
      if (!resolvedCompany.tkCompanyId) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda senza collegamento servizio esterno.' });
      }
      await TachoSync.createDriver({
        companyId: resolvedCompany.tkCompanyId,
        firstName: String(name).trim(),
        lastName: String(surname).trim(),
        cardNumber: String(tachoDriverId).trim(),
        phone: String(phone).trim(),
      });
    }

    const driver = await Drivers.create({
      name: String(name).trim(),
      surname: String(surname).trim(),
      phone: String(phone).trim(),
      tachoDriverId: String(tachoDriverId).trim(),
      owner: owners[0]._id,
    });
    await UserModel.updateOne(
      { _id: owners[0]._id },
      { $addToSet: { drivers: driver._id } }
    );

    return res.status(200).json({
      driver: {
        ...driver.toObject(),
        id: driver._id?.toString?.() || driver._id,
        companyId: resolvedCompany._id?.toString?.() || resolvedCompany._id,
      },
    });
  } catch (err) {
    console.error('[api] /drivers create error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.patch('/drivers/:id', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const driverId = req.params.id;
  if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'ID autista non valido.' });
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const surname = typeof req.body?.surname === 'string' ? req.body.surname.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const tachoDriverId = typeof req.body?.tachoDriverId === 'string' ? req.body.tachoDriverId.trim() : '';

  if (!name || !surname || !phone || !tachoDriverId) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Campi obbligatori mancanti.' });
  }

  try {
    const driver = await Drivers.findById(driverId).lean();
    if (!driver) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const isAdmin = isSuperAdmin(req.user);
    let companyId = null;
    if (isAdmin) {
      const ownerUser = await UserModel.findById(driver.owner, { companyId: 1 }).lean();
      companyId = ownerUser?.companyId || null;
    } else {
      companyId = req.user?.companyId || null;
    }
    if (!companyId) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda non valida.' });
    }

    const owners = await UserModel.find({ companyId }, { _id: 1 }).lean();
    const ownerIds = owners.map((owner) => owner._id);
    if (!isAdmin) {
      const ownerSet = new Set(ownerIds.map((id) => String(id)));
      if (!ownerSet.has(String(driver.owner))) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    if (tachoDriverId && tachoDriverId !== String(driver.tachoDriverId || '')) {
      const existing = await Drivers.findOne({
        _id: { $ne: driverId },
        owner: { $in: ownerIds },
        tachoDriverId,
      }).lean();
      if (existing) {
        return res.status(409).json({ error: 'CONFLICT', message: 'Autista già presente.' });
      }
    }

    const updated = await Drivers.findByIdAndUpdate(
      driverId,
      {
        $set: {
          name,
          surname,
          phone,
          tachoDriverId,
        },
      },
      { new: true },
    ).lean();

    return res.status(200).json({
      driver: {
        ...updated,
        id: updated?._id?.toString?.() || updated?._id,
        companyId: companyId?.toString?.() || companyId,
      },
    });
  } catch (err) {
    console.error('[api] /drivers update error:', err?.message || err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/drivers/delete', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const driverId = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'ID autista non valido.' });
  }

  try {
    const driver = await Drivers.findById(driverId).lean();
    if (!driver) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const isAdmin = isSuperAdmin(req.user);
    let companyId = null;
    if (isAdmin) {
      const ownerUser = await UserModel.findById(driver.owner, { companyId: 1 }).lean();
      companyId = ownerUser?.companyId || null;
    } else {
      companyId = req.user?.companyId || null;
    }
    if (!companyId) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda non valida.' });
    }

    const owners = await UserModel.find({ companyId }, { _id: 1 }).lean();
    const ownerIds = owners.map((owner) => owner._id);
    if (!isAdmin) {
      const ownerSet = new Set(ownerIds.map((id) => String(id)));
      if (!ownerSet.has(String(driver.owner))) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    await Drivers.findByIdAndDelete(driverId);
    await UserModel.updateMany(
      { _id: { $in: ownerIds } },
      { $pull: { drivers: driverId } },
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api] /drivers delete error:', err?.message || err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/drivers/import', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  const isAdmin = isSuperAdmin(req.user);
  const tachoCompanyId = isAdmin ? req.body?.companyId : null;
  const resolvedCompany = await resolveCompanyFromRequest(req, tachoCompanyId);
  if (!resolvedCompany) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda non valida.' });
  }
  const list = Array.isArray(req.body?.drivers) ? req.body.drivers : [];
  if (!list.length) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Nessun autista da importare.' });
  }

  try {
    console.log('[api] /drivers/import', {
      userId: req.user?._id?.toString?.() || req.user?.id || null,
      isAdmin,
      companyId: tachoCompanyId || null,
      count: list.length,
    });
    const owners = await UserModel.find({ companyId: resolvedCompany._id }, { _id: 1, privilege: 1 })
      .sort({ privilege: 1 })
      .lean();
    if (!owners.length) {
      console.warn('[api] /drivers/import no owners', {
        companyId: resolvedCompany?._id?.toString?.() || resolvedCompany?._id || null,
      });
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Azienda selezionata senza utenti.' });
    }
    const ownerId = owners[0]._id;
    const ownerIds = owners.map((owner) => owner._id);
    const tachoIds = list
      .map((driver) => (driver?.tachoDriverId ? String(driver.tachoDriverId).trim() : ''))
      .filter(Boolean);
    const existing = tachoIds.length
      ? await Drivers.find({ owner: { $in: ownerIds }, tachoDriverId: { $in: tachoIds } }, { tachoDriverId: 1 }).lean()
      : [];
    const existingIds = new Set(existing.map((row) => String(row.tachoDriverId || '')));

    const payload = list
      .map((driver) => ({
        name: String(driver?.name || '').trim(),
        surname: String(driver?.surname || '').trim(),
        phone: String(driver?.phone || '').trim(),
        tachoDriverId: String(driver?.tachoDriverId || '').trim(),
        owner: ownerId,
      }))
      .filter((driver) => driver.name && driver.surname && driver.tachoDriverId && !existingIds.has(driver.tachoDriverId));

    if (!payload.length) {
      return res.status(200).json({ inserted: 0 });
    }

    const created = await Drivers.insertMany(payload, { ordered: false });
    const createdIds = created.map((driver) => driver._id);
    await UserModel.updateOne(
      { _id: ownerId },
      { $addToSet: { drivers: { $each: createdIds } } }
    );

    return res.status(200).json({ inserted: created.length });
  } catch (err) {
    console.error('[api] /drivers import error:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/nav/geocode', auth, async (req, res) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const requestedProvider = typeof req.body?.provider === 'string' ? req.body.provider : null;
    if (!query || query.length < 3) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Inserisci almeno 3 caratteri.' });
    }

    const provider = resolveRoutingProvider(requestedProvider);
    let candidates = [];
    if (provider === 'google') {
      try {
        candidates = await geocodeWithGoogle(query);
      } catch (err) {
        console.warn('[api.nav.geocode] google failed, fallback to ORS', err?.message || err);
        candidates = await geocodeWithORS(query);
        return res.status(200).json({ provider: 'ors', fallbackFrom: 'google', candidates });
      }
    } else {
      candidates = await geocodeWithORS(query);
    }
    return res.status(200).json({ provider, candidates });
  } catch (err) {
    const message = err?.message || 'Errore geocoding';
    return res.status(502).json({ error: 'GEOCODE_FAILED', message });
  }
});

router.post('/nav/route', auth, async (req, res) => {
  try {
    const requestedProvider = typeof req.body?.provider === 'string' ? req.body.provider : null;
    const from = normalizeLngLat(req.body?.from || {});
    const to = normalizeLngLat(req.body?.to || {});
    const departureTime = toFiniteNumber(req.body?.departureTime) || Date.now();
    if (!from || !to) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Coordinate partenza/arrivo non valide.' });
    }

    const provider = resolveRoutingProvider(requestedProvider);
    let payload;
    if (provider === 'google') {
      try {
        payload = await routeWithGoogle({ from, to, departureTime });
      } catch (err) {
        console.warn('[api.nav.route] google failed, fallback to ORS', err?.message || err);
        payload = await routeWithORS({ from, to });
        payload.fallbackFrom = 'google';
      }
    } else {
      payload = await routeWithORS({ from, to });
    }

    return res.status(200).json(payload);
  } catch (err) {
    const message = err?.message || 'Errore calcolo rotta';
    return res.status(502).json({ error: 'ROUTE_FAILED', message });
  }
});

module.exports = router;

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

router.get('/seep/sync/status', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  return res.status(200).json({
    status: getSyncStatus(),
    config: {
      interval: SYNC_INTERVAL,
      enabled: String(process.env.SEEP_SYNC_ENABLED || 'true').toLowerCase() !== 'false',
      runOnBoot: String(process.env.SEEP_SYNC_RUN_ON_BOOT || 'false').toLowerCase() === 'true',
    },
  });
});

router.post('/seep/sync/run', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const result = await runSync({ trigger: 'manual' });
    if (result?.alreadyRunning) {
      return res.status(409).json({
        error: 'ALREADY_RUNNING',
        message: 'Sincronizzazione gia in corso.',
        status: result.state || getSyncStatus(),
      });
    }
    return res.status(200).json({
      ok: true,
      result,
      status: getSyncStatus(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message || String(err) });
  }
});

router.get('/seep/files/status', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const page = Math.max(Number(req.query.page || 1) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 100) || 100, 1), 500);
  const skip = (page - 1) * pageSize;
  try {
    const [items, total] = await Promise.all([
      SeepFileStatus.find({})
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      SeepFileStatus.countDocuments({}),
    ]);
    return res.status(200).json({
      items,
      page,
      pageSize,
      total,
    });
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err?.message || String(err) });
  }
});

router.get('/seep/lul/config', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  return res.status(200).json({
    enabled: SeepTrucker.lulEnabled(),
    reason: SeepTrucker.lulEnabled() ? null : 'SEEP_LUL_ENABLED=false',
  });
});

router.post('/seep/lul', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const payload = req.body || {};
    const result = await SeepTrucker.createLul(payload);
    return res.status(200).json({ result });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({ error: err?.code || 'INTERNAL_ERROR', message: err?.message || String(err) });
  }
});

router.post('/seep/lul/preview', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const { output, resolvedLocalDriver, request } = await resolveDriverGraphsPayload(req.body || {});
    const reportCode = String(req.body?.reportCode || 'D04').toUpperCase();
    const report = LUL_REPORT_TYPES[reportCode] || LUL_REPORT_TYPES.D04;
    const analysis = output?.analysis || {};
    const weeks = Array.isArray(analysis?.activityAnalysis?.weeks) ? analysis.activityAnalysis.weeks : [];
    let rows = [];
    let workTimesData = null;
    let builtFromXlsx = false;

    // Prefer Seep official work_times table (includes start/end day and kms).
    if (report.seep === 'work_times' && output?.driver?.resolvedSeepDriverId) {
      try {
        const xlsx = await SeepTrucker.driverXlsxReport({
          driverId: output.driver.resolvedSeepDriverId,
          reportType: 'work_times',
          startDate: String(request?.startDate || '').slice(0, 10),
          endDate: String(request?.endDate || '').slice(0, 10),
          timezone: request?.timezone || 'Europe/Rome',
          regulation: Number(req.body?.regulation || 0),
          penalty: Number(req.body?.penalty || 0),
          onlyInfringementsGraphs: Boolean(req.body?.onlyInfringementsGraphs),
          ignoreCountrySelectedInfringements: Boolean(req.body?.ignoreCountrySelectedInfringements),
          activitiesGraphs: false,
          activitiesTables: true,
          infringementsLists: false,
        });
        workTimesData = parseWorkTimesRowsFromXlsx(xlsx.buffer);
        rows = Array.isArray(workTimesData?.dailyRows) ? workTimesData.dailyRows : [];
        builtFromXlsx = true;
      } catch (xlsxErr) {
        console.warn('[api] LUL preview xlsx parse fallback', xlsxErr?.message || xlsxErr);
      }
    }

    // Fallback from activity-analysis when xlsx is unavailable.
    if (!rows.length) {
      const fallbackRows = [];
      weeks.forEach((week) => {
        const days = Array.isArray(week?.days) ? week.days : [];
        days.forEach((day) => {
          const activities = Array.isArray(day?.activities) ? day.activities : [];
          const metrics = day?.metrics || {};
          const bounds = pickWorkActivityBounds(activities);
          fallbackRows.push({
            date: String(day?.date || '--'),
            startTime: bounds.first,
            endTime: bounds.last,
            amplitude: minutesToHHMM(metricToMinutes(metrics?.totalAmplitude)),
            workTotal: minutesToHHMM(metricToMinutes(metrics?.totalWork)),
            kms: day?.kms ?? day?.km ?? day?.distance ?? '-',
          });
        });
      });
      rows = fallbackRows;
    }

    const rangeStart = String(request?.startDate || '').slice(0, 10);
    const rangeEnd = String(request?.endDate || '').slice(0, 10);
    if (!builtFromXlsx && rangeStart && rangeEnd) {
      rows = rows.filter((row) => {
        const day = String(row?.date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return true;
        return day >= rangeStart && day <= rangeEnd;
      });
    }

    const driverName = resolvedLocalDriver
      ? `${resolvedLocalDriver?.name || ''} ${resolvedLocalDriver?.surname || ''}`.trim()
      : (output?.driver?.match?.name || 'Autista');

    const html = buildLulPreviewHtml({
      companyName: req.user?.companyName || 'Truckly',
      driverName,
      driverCardId: resolvedLocalDriver?.tachoDriverId || output?.driver?.match?.cardNumber || null,
      reportCode: report.code,
      reportLabel: report.label,
      generatedAt: new Date().toLocaleString('it-IT'),
      startDate: String(request?.startDate || '').slice(0, 10),
      endDate: String(request?.endDate || '').slice(0, 10),
      rows,
      workTimesData,
    });

    const fileBaseName = `${driverName.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}_${report.code}_${Date.now()}`;
    return res.status(200).json({
      report: report.code,
      reportLabel: report.label,
      html,
      fileBaseName,
    });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({ error: err?.code || 'INTERNAL_ERROR', message: err?.message || String(err) });
  }
});

router.post('/seep/driver-graphs', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const { output, resolvedLocalDriver } = await resolveDriverGraphsPayload(req.body || {});

    return res.status(200).json({
      source: output.source,
      driver: {
        ...output.driver,
        localDriver: resolvedLocalDriver
          ? {
              id: resolvedLocalDriver?._id?.toString?.() || resolvedLocalDriver?._id || null,
              name: resolvedLocalDriver?.name || null,
              surname: resolvedLocalDriver?.surname || null,
              tachoDriverId: resolvedLocalDriver?.tachoDriverId || null,
            }
          : null,
      },
      days: output.days || [],
    });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({ error: err?.code || 'INTERNAL_ERROR', message: err?.message || String(err) });
  }
});

router.post('/seep/driver-graphs/export-pdf', auth, async (req, res) => {
  if (!canManageDrivers(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const { output, resolvedLocalDriver, request } = await resolveDriverGraphsPayload(req.body || {});
    const provider = normalizePdfProvider(req.body?.provider || process.env.PDF_PROVIDER || 'truckly');
    const brand = req.body?.brand || {};
    const toReportDate = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      return raw.slice(0, 10);
    };
    const driverName = resolvedLocalDriver
      ? `${resolvedLocalDriver?.name || ''} ${resolvedLocalDriver?.surname || ''}`.trim()
      : (output?.driver?.match?.name || 'driver');

    const pdf = await SeepTrucker.driverPdfReport({
      driverId: output?.driver?.resolvedSeepDriverId,
      reportType: 'activity_times',
      startDate: toReportDate(request.startDate),
      endDate: toReportDate(request.endDate),
      timezone: request.timezone || 'Europe/Rome',
      regulation: Number(request.regulation || 0),
      penalty: Number(request.penalty || 0),
      onlyInfringementsGraphs: Boolean(request.onlyInfringementsGraphs),
      ignoreCountrySelectedInfringements: Boolean(request.ignoreCountrySelectedInfringements),
      activitiesGraphs: false,
      activitiesTables: true,
      infringementsLists: false,
    });

    const normalizedBuffer = provider === 'truckly'
      ? recolorAndNormalizeSeepPdf(pdf.buffer)
      : pdf.buffer;

    const brandedBuffer = provider === 'truckly'
      ? await applyTrucklyBrandingToPdf(normalizedBuffer, {
          companyName: brand?.companyName || req.user?.companyName || 'Truckly',
          primaryColor: brand?.primaryColor || '111827',
        })
      : normalizedBuffer;

    const safeName = `${driverName.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}.pdf`;
    res.setHeader('Content-Type', pdf.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    return res.status(200).send(brandedBuffer);
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({ error: err?.code || 'INTERNAL_ERROR', message: err?.message || String(err) });
  }
});

// === Driver activity test endpoint (debug only) ===
// POST /api/seep/test
// Body: { driverId, startDate, endDate, timezone, regulation, penalty, onlyInfringementsGraphs, ignoreCountrySelectedInfringements }
// Optionally attach a multipart file under field "file" to upload a DDD before analysis.
router.post('/seep/test', auth, async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
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
