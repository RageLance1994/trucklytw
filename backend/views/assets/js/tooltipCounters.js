import { Counter } from "/assets/js/counter.js";

const MS_MIN  = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY  = 24 * MS_HOUR;

// Limiti UE
const BASE_DRIVING_H = 9;    // guida giornaliera
const BASE_WORK_H    = 13;   // lavoro giornaliero
const WEEK_DRIVE_H   = 56;   // guida settimanale
const BIWEEK_DRIVE_H = 90;   // guida 2 settimane

// Extra "disponibili"
const EXTRA_DRIVE_H = 1;     // estensione 9→10 (max 2/settimana)
const EXTRA_WORK_H  = 2;     // 13→15

// Pausa guida continua
const CONT_DRIVE_LIMIT_H = 4.5; // 4h30
const BREAK_FULL_MIN     = 45;  // alternativa singola
const BREAK_SPLIT_A_MIN  = 15;  // prima parte
const BREAK_SPLIT_B_MIN  = 30;  // seconda parte (deve venire dopo A)

// Stati (unlogged = riposo)
const STATE_MAP = {
  0: "resting",
  2: "working",
  3: "driving",
  5: "resting",
  resting: "resting",
  working: "working",
  driving: "driving",
  unlogged: "resting",
};

const historyCache = new Map();

export function initTooltipCounters(target, context = {}) {
  if (!target) return null;

  const driveSeries = [
    { name: "done",        color: "#f23645", value: 0 },
    { name: "additional",  color: "#f58f12", value: 0, constant: true, startpoint: 90 },
    { name: "remaining",   color: "#2E2E2E", value: 100 },
  ];

  const effortSeries = [
    { name: "done",        color: "#085899", value: 0 },
    { name: "additional",  color: "#085899", value: 0, constant: true, startpoint: 90 },
    { name: "remaining",   color: "#2E2E2E", value: 100 },
  ];

  const restSeries = [
    { name: "done",        color: "#089981", value: 0 },
    { name: "remaining",   color: "#2E2E2E", value: 100 },
  ];

  const seriesSet = [driveSeries, effortSeries, restSeries];
  const cs = target.querySelectorAll('.counter-container:not([data-counter-id=""])');
  if (!cs || !cs.length || cs.length !== seriesSet.length) {
    console.warn("Scheda autista non inserita.");
    return null;
  }

  const counters = [...cs].map((c, i) => new Counter(c, structuredClone(seriesSet[i])));
  compileCounters(counters, context).catch(err => console.warn("[tooltipCounters] hydration failed", err));
  return counters;
}

export function updateTooltipCounters(counters, context = {}) {
  if (!Array.isArray(counters) || !counters.length) return null;
  compileCounters(counters, context).catch(err => console.warn("[tooltipCounters] update failed", err));
  return counters;
}

async function compileCounters(counters, context) {
  const metrics = await compileDriverMetrics(context.driverId);
  if (!Array.isArray(counters) || counters.length < 3) return;

  // Preferisci SESSIONE (se trovata), altrimenti GIORNO
  const bucket = metrics.session?.valid ? metrics.session : metrics.daily;

  // helper UI
  const clamp = (v, a=0, b=100)=>Math.min(b, Math.max(a, v));
  const h = v => Number.isFinite(v) ? Math.max(0, v) : 0;
  const pct = (v, cap)=> clamp((h(v) / (cap>0?cap:1)) * 100);
  const label = (spent, cap)=> `${h(spent).toFixed(1)}h / ${cap.toFixed(1)}h`;

  // ---- Barra 1: Guida (base 9h + extra DISPONIBILE 1h limitata da estensioni/settimana) ----
  {
    const used = h(bucket.drive_hours);
    const baseUsed = Math.min(used, BASE_DRIVING_H);
    const baseRemH = Math.max(0, BASE_DRIVING_H - baseUsed);

    // estensioni rimaste prima di oggi
    const extLeft = Math.max(0, 2 - (metrics?.weekly?.drive_extensions_used_before_today || 0));

    // extra disponibile oggi
    const availExtraDriveH =
      extLeft <= 0 ? 0 :
      (used < BASE_DRIVING_H ? EXTRA_DRIVE_H :
       (used < BASE_DRIVING_H + EXTRA_DRIVE_H ? (BASE_DRIVING_H + EXTRA_DRIVE_H - used) : 0));

    counters[0].setSeries("done",       pct(baseUsed, BASE_DRIVING_H));
    counters[0].setSeries("remaining",  pct(baseRemH, BASE_DRIVING_H));
    counters[0].setSeries("additional", pct(availExtraDriveH, EXTRA_DRIVE_H));
    counters[0].setText(label(used, BASE_DRIVING_H));
  }

  // ---- Barra 2: Lavoro (base 13h + extra DISPONIBILE fino a 2h) ----
  {
    const used = h(bucket.work_hours);
    const baseUsed = Math.min(used, BASE_WORK_H);
    const baseRemH = Math.max(0, BASE_WORK_H - baseUsed);

    const availExtraWorkH = Math.max(0, EXTRA_WORK_H - Math.max(0, used - BASE_WORK_H));

    counters[1].setSeries("done",       pct(baseUsed, BASE_WORK_H));
    counters[1].setSeries("remaining",  pct(baseRemH, BASE_WORK_H));
    counters[1].setSeries("additional", pct(availExtraWorkH, EXTRA_WORK_H));
    counters[1].setText(label(used, BASE_WORK_H));
  }

  // ---- Barra 3: Riposo CONTINUO vs 11h ----
  {
    const need = 11;
    const got  = h(bucket.continuous_rest_hours);
    const rem  = Math.max(0, need - got);
    counters[2].setSeries("done",      pct(got, need));
    counters[2].setSeries("remaining", pct(rem, need));
    counters[2].setText(`${got.toFixed(1)}h continuo / ${need.toFixed(1)}h`);
  }

  // (Opzionale) Hai anche metriche pausa 4h30 disponibili:
  // metrics.session.drive_since_break_hours, metrics.session.break_remaining_min, metrics.session.break_ok
}

/** ---------------------------------------------
 *  CORE METRICS
 *  --------------------------------------------- */
async function compileDriverMetrics(id) {
  if(!id) return;
  const now  = Date.now();

  // Finestre
  const biweekStart = getCurrentWeekStart(now - 7 * MS_DAY); // lunedì della settimana scorsa
  const weekStart   = getCurrentWeekStart(now);              // lunedì di questa settimana
  const dayStart    = getCurrentDayStart(now);

  // Fetch
  let history = await window._post('/dashboard/drivers/history', { d: id, from: biweekStart, to: now });
  if (!Array.isArray(history) || history.length < 2) return emptyParams();
  history.sort((a, b) => a.timestamp - b.timestamp);

  // Session start: ultimo evento con from_state==5 negli ultimi 2 giorni
  const rev = [...history].sort((a,b)=> +new Date(b.timestamp) - +new Date(a.timestamp));
  const sessionCandidates = rev
    .filter(ev => ev.from_state == 5 && (+new Date(ev.timestamp) >= (now - 2*MS_DAY)))
    .sort((a,b)=> +new Date(a.timestamp) - +new Date(b.timestamp));
  const sessionStartTs = sessionCandidates.at(-1)?.timestamp ?? dayStart;
  const sessionFound   = Boolean(sessionCandidates.at(-1));

  const windows = [
    { a: biweekStart, b: now, key: "biweekly" },
    { a: weekStart,   b: now, key: "weekly" },
    { a: dayStart,    b: now, key: "daily" },
    { a: +new Date(sessionStartTs), b: now, key: "session" },
  ];

  const parameters = emptyParams();

  // helper: quali bucket copre l'intervallo [a,b)
  const bucketKeys = (aMs, bMs) => windows.filter(w => w.a < aMs && w.b >= bMs).map(w => w.key);

  // ---- Accumulo ore per intervallo — stato attivo = prev.to_state ----
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1], curr = history[i];
    if (!prev?.timestamp || !curr?.timestamp) continue;

    const t0 = +new Date(prev.timestamp);
    const t1 = +new Date(curr.timestamp);
    if (t1 <= t0) continue;

    const activeState = STATE_MAP[prev.to_state] || "resting";
    const deltaH = (t1 - t0) / MS_HOUR;
    const keys = bucketKeys(t0, t1);

    for (const k of keys) {
      if (activeState === "driving") {
        parameters[k].drive_hours += deltaH;
        parameters[k].work_hours  += deltaH; // guida ⊂ lavoro
      } else if (activeState === "working") {
        parameters[k].work_hours  += deltaH;
      } else { // resting/unlogged
        parameters[k].rest_hours  += deltaH;
      }
    }
  }

  // ---- Riposo CONTINUO (per barra 3) ----
  const continuousRestH = computeContinuousRestHours(history, now);

  // ---- Extra (supero) per i bucket che lo prevedono ----
  parameters.daily.extra_drive_hours    = Math.max(0, parameters.daily.drive_hours  - BASE_DRIVING_H);
  parameters.daily.extra_work_hours     = Math.max(0, parameters.daily.work_hours   - BASE_WORK_H);
  parameters.weekly.extra_drive_hours   = Math.max(0, parameters.weekly.drive_hours   - WEEK_DRIVE_H);
  parameters.biweekly.extra_drive_hours = Math.max(0, parameters.biweekly.drive_hours - BIWEEK_DRIVE_H);

  // Extra per SESSIONE (consumo sessione)
  parameters.session.extra_drive_hours = Math.max(0, parameters.session.drive_hours - BASE_DRIVING_H);
  parameters.session.extra_work_hours  = Math.max(0, parameters.session.work_hours  - BASE_WORK_H);

  // ---- Estensioni guida usate in settimana (giorni > 9h) ----
  const { usedBeforeToday, usedIncludingToday } = computeWeeklyDriveExtensions(history, weekStart, now);
  parameters.weekly.drive_extensions_used_before_today = usedBeforeToday;
  parameters.weekly.drive_extensions_used = usedIncludingToday;

  // ---- Pausa 4h30: guida continua e credito break ----
  const breakState = computeDrivingBreakState(history, now);
  // attach sia a daily sia a session per comodità UI
  Object.assign(parameters.daily, breakState);
  Object.assign(parameters.session, breakState);

  // ---- Allegati finali ----
  parameters.daily.continuous_rest_hours   = continuousRestH;
  parameters.session.continuous_rest_hours = continuousRestH;
  parameters.session.valid = sessionFound;

  return parameters;
}

/** ---------------------------------------------
 *  HELPERS METRICHE
 *  --------------------------------------------- */

// Guida continua dall’ultimo break valido (45' singolo o 15'+30' in ordine)
function computeDrivingBreakState(history, nowMs) {
  if (!Array.isArray(history) || history.length === 0) {
    return {
      drive_since_break_hours: 0,
      break_credit_min: 0,
      break_ok: false,
      break_needed_min: BREAK_FULL_MIN,
      break_remaining_min: BREAK_FULL_MIN
    };
  }

  // Scorri in avanti costruendo segmenti; includi anche coda fino a "now"
  const segs = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1], curr = history[i];
    if (!prev?.timestamp || !curr?.timestamp) continue;
    const a = +new Date(prev.timestamp);
    const b = +new Date(curr.timestamp);
    if (b <= a) continue;
    const state = STATE_MAP[prev.to_state] || "resting";
    segs.push({ state, a, b });
  }
  // coda finale
  const last = history[history.length - 1];
  if (last?.timestamp) {
    const tailA = +new Date(last.timestamp);
    if (nowMs > tailA) {
      segs.push({ state: STATE_MAP[last.to_state] || "resting", a: tailA, b: nowMs });
    }
  }

  // Stato della catena: quanto sto guidando senza break e quali break ho accumulato
  let driveMs = 0;
  let breakSegments = []; // array di minuti di spezzoni riposo successivi alla guida
  let lastWasDriving = false;

  const flushBreakIfValid = () => {
    // 45 minuti in un singolo blocco
    if (breakSegments.some(min => min >= BREAK_FULL_MIN)) return true;
    // split 15 + 30 IN QUEST'ORDINE, tot >=45
    if (breakSegments.length >= 2) {
      const first = breakSegments[0] || 0;
      const last  = breakSegments[breakSegments.length - 1] || 0;
      const sum   = breakSegments.reduce((s,n)=>s+n,0);
      if (first >= BREAK_SPLIT_A_MIN && last >= BREAK_SPLIT_B_MIN && sum >= BREAK_FULL_MIN) return true;
    }
    return false;
  };

  const resetChain = () => {
    driveMs = 0;
    breakSegments = [];
    lastWasDriving = false;
  };

  // Scorri i segmenti
  for (const s of segs) {
    const durMin = (s.b - s.a) / MS_MIN;

    if (s.state === "driving") {
      // se prima ero in riposo "dopo guida", chiudi quel break in lista
      lastWasDriving = true;
      driveMs += (s.b - s.a);
      // se ho accumulato un break valido prima, "rompe" la catena
      if (flushBreakIfValid()) {
        // il segmento di guida corrente appartiene a nuova catena post-break
        resetChain();
        driveMs += (s.b - s.a);
        lastWasDriving = true;
      }
    } else if (s.state === "resting") {
      if (lastWasDriving) {
        // break tra driving segments
        breakSegments.push(durMin);
      }
      // se break valido, resettare la catena
      if (flushBreakIfValid()) {
        resetChain();
      }
    } else {
      // working: NON spezza la guida continua per la regola del break guida
      // (la guida continua si ferma solo con break di riposo valido)
      if (flushBreakIfValid()) {
        resetChain();
      }
    }
  }

  // Se alla fine ho un break valido accumulato, la catena di guida è interrotta
  if (flushBreakIfValid()) resetChain();

  const driveH = driveMs / MS_HOUR;
  const breakCredit = breakSegments.reduce((s,n)=>s+n,0); // minuti
  const needMin = BREAK_FULL_MIN;
  const remaining = Math.max(0, needMin - Math.max(
    // credito come singolo segmento da 45
    Math.max(...breakSegments, 0),
    // credito come split 15 + 30 (in ordine) se presente
    (breakSegments.length >= 2 &&
     breakSegments[0] >= BREAK_SPLIT_A_MIN &&
     breakSegments[breakSegments.length - 1] >= BREAK_SPLIT_B_MIN)
      ? Math.min(needMin, breakCredit) : 0
  ));

  return {
    drive_since_break_hours: driveH,
    break_credit_min: breakCredit,
    break_ok: remaining === 0,
    break_needed_min: needMin,
    break_remaining_min: remaining,
    // utile per UI opzionale
    drive_until_break_remaining_min: Math.max(0, CONT_DRIVE_LIMIT_H*60 - driveH*60)
  };
}

/** Estensioni guida usate nella settimana (giorni con guida > 9h) */
function computeWeeklyDriveExtensions(history, weekStart, now) {
  const perDayMs = new Map(); // YYYY-MM-DD -> ms guida
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1], curr = history[i];
    if (!prev?.timestamp || !curr?.timestamp) continue;
    let a = +new Date(prev.timestamp), b = +new Date(curr.timestamp);
    if (b <= a || b < weekStart) continue;

    const active = STATE_MAP[prev.to_state] || "resting";
    if (active !== "driving") continue;

    a = Math.max(a, weekStart);
    while (a < b) {
      const dayKey = new Date(a).toISOString().slice(0,10);
      const dayEnd = getCurrentDayStart(a) + MS_DAY;
      const segEnd = Math.min(b, dayEnd);
      const seg = segEnd - a;
      perDayMs.set(dayKey, (perDayMs.get(dayKey) || 0) + seg);
      a = segEnd;
    }
  }
  const todayKey = new Date(getCurrentDayStart(now)).toISOString().slice(0,10);
  let usedBeforeToday = 0, usedIncludingToday = 0;
  for (const [k, ms] of perDayMs.entries()) {
    const h = ms / MS_HOUR;
    if (h > BASE_DRIVING_H) {
      usedIncludingToday++;
      if (k !== todayKey) usedBeforeToday++;
    }
  }
  return { usedBeforeToday, usedIncludingToday };
}

/** ---------------------------------------------
 *  UTILS
 *  --------------------------------------------- */
function emptyParams() {
  return {
    biweekly: { drive_hours: 0, work_hours: 0, extra_drive_hours: 0, extra_work_hours: 0, rest_hours: 0 },
    weekly:   { drive_hours: 0, work_hours: 0, extra_drive_hours: 0, extra_work_hours: 0, rest_hours: 0 },
    daily:    { drive_hours: 0, work_hours: 0, extra_drive_hours: 0, extra_work_hours: 0, rest_hours: 0 },
    session:  { drive_hours: 0, work_hours: 0, extra_drive_hours: 0, extra_work_hours: 0, rest_hours: 0, valid: false },
  };
}

function getCurrentDayStart(referenceTs) {
  const ref = Number.isFinite(referenceTs) ? new Date(referenceTs) : new Date();
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
}

function getCurrentWeekStart(referenceTs) {
  const ref = Number.isFinite(referenceTs) ? new Date(referenceTs) : new Date();
  const day = ref.getDay();
  const diff = (day + 6) % 7; // lunedì=0
  const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  monday.setDate(monday.getDate() - diff);
  return monday.getTime();
}

function computeContinuousRestHours(history, nowMs) {
  if (!Array.isArray(history) || history.length === 0) return 0;

  let accMs = 0;
  // tratto finale fino a "now", se ultimo stato è riposo
  const last = history[history.length - 1];
  const tailA = +new Date(last.timestamp);
  if ((STATE_MAP[last.to_state] || "resting") === "resting") {
    accMs += Math.max(0, nowMs - tailA);
  }

  // intervalli precedenti a ritroso finché resti in riposo
  for (let i = history.length - 1; i > 0; i--) {
    const curr = history[i];
    const prev = history[i - 1];
    const t0 = +new Date(prev.timestamp);
    const t1 = +new Date(curr.timestamp);
    if (t1 <= t0) continue;

    const active = STATE_MAP[prev.to_state] || "resting";
    if (active === "resting") {
      accMs += (t1 - t0);
    } else {
      break;
    }
  }
  return accMs / MS_HOUR;
}
