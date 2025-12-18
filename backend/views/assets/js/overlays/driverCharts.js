const MS_DAY = 86_400_000;

const STATE_CODE_MAP = {
  0: 'resting',
  2: 'working',
  3: 'driving',
  5: 'resting'
};

const STATE_STYLES = {
  driving: { label: 'In movimento', color: '#089981' },
  working: { label: 'Lavoro', color: '#f58f12' },
  resting: { label: 'Fermo', color: '#f23645' },
  unlogged: { label: 'Non rilevato', color: '#5b8def' },
  unknown: { label: 'Sconosciuto', color: '#8f9ba8' }
};

const toMs = (value) => {
  if (value instanceof Date) return value.getTime();
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const startOfDay = (ts = Date.now()) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const startOfWeek = (ts = Date.now()) => {
  const d = new Date(ts);
  const day = d.getDay() || 7; // Monday = 1, Sunday = 7
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const rangeBounds = (key = 'daily', anchor = Date.now()) => {
  switch (key) {
    case 'weekly':
      return { from: startOfWeek(anchor), to: anchor };
    case 'biweekly':
      return { from: startOfWeek(anchor) - (7 * MS_DAY), to: anchor };
    default:
      return { from: startOfDay(anchor), to: anchor };
  }
};

const normaliseState = (evt = {}) => {
  const numericState = Number.isFinite(evt.to_state)
    ? evt.to_state
    : Number.isFinite(evt.toState)
      ? evt.toState
      : Number.isFinite(evt.state)
        ? evt.state
        : null;

  const stateName = (evt.to_state_name || evt.toStateName || evt.stateName || evt.state || '').toString().toLowerCase();
  const flags = Array.isArray(evt.eventflags) ? evt.eventflags.map((f) => String(f).toLowerCase()) : [];

  const keyFromCode = STATE_CODE_MAP[numericState];
  const keyFromName = (() => {
    if (stateName.includes('drive')) return 'driving';
    if (stateName.includes('work')) return 'working';
    if (stateName.includes('rest')) return 'resting';
    if (stateName.includes('unlogged')) return 'unlogged';
    return null;
  })();

  const keyFromFlags = (() => {
    if (flags.some((f) => f.includes('drive_start') || f.includes('drive'))) return 'driving';
    if (flags.some((f) => f.includes('work') || f.includes('break'))) return 'working';
    if (flags.some((f) => f.includes('rest'))) return 'resting';
    return null;
  })();

  const key = keyFromCode || keyFromName || keyFromFlags || 'unknown';
  const style = STATE_STYLES[key] || STATE_STYLES.unknown;

  return { key, ...style };
};

const buildSegments = (history = [], { from, to }) => {
  if (!Array.isArray(history) || !history.length || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return [];
  }

  const sorted = history
    .map((evt) => ({ ...evt, __ts: toMs(evt.timestamp) }))
    .filter((evt) => Number.isFinite(evt.__ts))
    .sort((a, b) => a.__ts - b.__ts);

  if (!sorted.length) return [];

  let cursor = from;
  let currentState = normaliseState(sorted[0]);
  for (const evt of sorted) {
    if (evt.__ts <= from) {
      currentState = normaliseState(evt);
      continue;
    }
    break;
  }

  const segments = [];
  for (const evt of sorted) {
    const ts = evt.__ts;
    if (!Number.isFinite(ts) || ts <= from) continue;
    if (ts >= to) break;

    if (ts > cursor) {
      segments.push({
        start: cursor,
        end: ts,
        state: currentState
      });
    }

    cursor = ts;
    currentState = normaliseState(evt);
  }

  if (to > cursor) {
    segments.push({
      start: cursor,
      end: to,
      state: currentState
    });
  }

  return segments.filter((seg) => Number.isFinite(seg.start) && Number.isFinite(seg.end) && seg.end > seg.start);
};

const formatDuration = (ms = 0) => {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const formatTs = (ts) => {
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const showOverlay = (el, text, isError = false) => {
  if (!el) return;
  const overlay = el.querySelector('.overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.classList.remove('dead');
  overlay.innerHTML = `<div style="padding:8px 12px; text-align:center; ${isError ? 'color:#f23645' : ''}">${text}</div>`;
};

const hideOverlay = (el) => {
  if (!el) return;
  const overlay = el.querySelector('.overlay');
  if (!overlay) return;
  overlay.classList.add('dead');
  overlay.style.display = 'none';
};

const ensureHostSizing = (el) => {
  if (!el) return;
  if (!el.style.position || el.style.position === 'static') {
    el.style.position = 'relative';
  }
  if (!el.style.minHeight) {
    el.style.minHeight = '220px';
  }
  if (!el.style.width) {
    el.style.width = '100%';
  }
};

const renderChart = (el, segments, bounds) => {
  if (!el) return null;
  ensureHostSizing(el);
  const duration = Number(bounds?.to) - Number(bounds?.from);

  if (!segments || !segments.length || !Number.isFinite(duration) || duration <= 0) {
    showOverlay(el, 'Nessun dato disponibile');
    return null;
  }

  hideOverlay(el);
  const overlay = el.querySelector('.overlay');
  el.innerHTML = '';
  if (overlay) el.appendChild(overlay);

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = '100%';
  wrapper.style.height = '140px';
  wrapper.style.background = 'rgba(255,255,255,0.02)';
  wrapper.style.border = `1px solid var(--grid-color, #2e2e2e)`;
  wrapper.style.borderRadius = '6px';
  wrapper.style.overflow = 'hidden';

  const axis = document.createElement('div');
  axis.style.position = 'absolute';
  axis.style.left = '0';
  axis.style.right = '0';
  axis.style.bottom = '12px';
  axis.style.height = '1px';
  axis.style.background = 'var(--grid-color, #2e2e2e)';
  wrapper.appendChild(axis);

  segments.forEach((seg) => {
    const startSeg = Math.max(bounds.from, seg.start);
    const endSeg = Math.min(bounds.to, seg.end);
    if (!Number.isFinite(startSeg) || !Number.isFinite(endSeg) || endSeg <= startSeg) return;

    const left = ((startSeg - bounds.from) / duration) * 100;
    const width = Math.max(0.25, ((endSeg - startSeg) / duration) * 100);

    const bar = document.createElement('div');
    bar.style.position = 'absolute';
    bar.style.left = `${left}%`;
    bar.style.width = `${width}%`;
    bar.style.top = '10px';
    bar.style.bottom = '18px';
    bar.style.borderRadius = '4px';
    bar.style.background = seg.state.color;
    bar.title = `${seg.state.label} ? ${formatDuration(endSeg - startSeg)}
${formatTs(startSeg)} ? ${formatTs(endSeg)}`;
    wrapper.appendChild(bar);
  });

  const labels = document.createElement('div');
  labels.style.position = 'absolute';
  labels.style.left = '0';
  labels.style.right = '0';
  labels.style.bottom = '0';
  labels.style.display = 'flex';
  labels.style.justifyContent = 'space-between';
  labels.style.fontSize = '11px';
  labels.style.color = '#aaa';
  labels.style.padding = '2px 6px 0 6px';
  labels.innerHTML = `<span>${formatTs(bounds.from)}</span><span>${formatTs(bounds.to)}</span>`;
  wrapper.appendChild(labels);

  el.appendChild(wrapper);
  return { destroy: () => wrapper.remove() };
};


const fetchHistory = async (driverId, from, to) => {
  if (!driverId) throw new Error('Driver id mancante');
  if (typeof window._post !== 'function') throw new Error('Client API non disponibile');
  const payload = await window._post('/dashboard/drivers/history', { d: driverId, from, to });
  return Array.isArray(payload) ? payload : [];
};

export async function initDriverCharts({ driverId = 'I100000569493003', containers } = {}) {
  const targets = containers
    ? Array.from(containers)
    : Array.from(document.querySelectorAll('[data-driver-chart]'));

  if (!targets.length) return;

  const now = Date.now();
  const entries = targets.map((el) => {
    const key = (el.dataset.driverChart || 'daily').toLowerCase();
    return { el, key, bounds: rangeBounds(key, now) };
  });

  const earliest = Math.min(...entries.map((e) => e.bounds.from));
  const latest = Math.max(...entries.map((e) => e.bounds.to));

  entries.forEach(({ el }) => showOverlay(el, 'Caricamento...'));

  let history = [];
  try {
    history = await fetchHistory(driverId, earliest, latest);
  } catch (err) {
    console.error('[driverCharts] errore nel recupero storico driver', err);
    entries.forEach(({ el }) => showOverlay(el, 'Errore nel caricamento dati', true));
    return;
  }

  if (!history.length) {
    entries.forEach(({ el }) => showOverlay(el, 'Nessun evento disponibile', true));
    return;
  }

  entries.forEach((entry) => {
    const segments = buildSegments(history, entry.bounds);
    renderChart(entry.el, segments, entry.bounds);
  });
}

export default initDriverCharts;
