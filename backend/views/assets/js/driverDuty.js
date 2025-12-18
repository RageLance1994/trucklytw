import { updateTooltipCounters } from "/assets/js/tooltipCounters.js";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const SECOND_MS = 1000;

const BREAK_LIMIT_MS = 4.5 * HOUR_MS;
const DAILY_LIMIT_MS = 9 * HOUR_MS;
const DAILY_EXT_LIMIT_MS = 10 * HOUR_MS;
const WEEK_LIMIT_MS = 56 * HOUR_MS;
const FORTNIGHT_LIMIT_MS = 90 * HOUR_MS;
const DAILY_REST_MIN_MS = 11 * HOUR_MS;
const CACHE_TTL_MS = 5 * 60 * 1000;

const formatClock = (ms, { includeSeconds = true } = {}) => {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00" + (includeSeconds ? ":00" : "");
  let remaining = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  remaining -= minutes * 60;
  const seconds = remaining;
  const group = includeSeconds ? [hours, minutes, seconds] : [hours, minutes];
  return group.map((value, idx) => (idx === 0 ? String(value).padStart(2, "0") : String(value).padStart(2, "0"))).join(":");
};

const startOfDay = (ms) => {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const startOfWeek = (ms) => {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  const weekday = date.getDay(); // 0=Sun ... 6=Sat
  const diff = (weekday + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date.getTime();
};

const getDutyAnchorDate = (reference = Date.now()) => {
  const date = new Date(reference);
  date.setHours(0, 0, 1, 0);
  const weekday = date.getDay();
  const daysFromMonday = (weekday + 6) % 7;
  date.setDate(date.getDate() - daysFromMonday);
  date.setDate(date.getDate() - 7);
  return date.getTime();
};

const toHours = (ms) => Math.max(0, ms) / HOUR_MS;

const resolveTimestamp = (value, fallback = Date.now()) => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : fallback;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

class DriverDutyManager {
  constructor() {
    this.cache = new Map(); // key => { anchorMs, segments, metrics, ... }
    this.bindings = new Map(); // key => Set<binding>
    window.addEventListener("deviceEvent", (ev) => this.onDeviceEvent(ev));
  }

  key(imei, slot, driverId) {
    return `${imei}:${slot}:${driverId}`;
  }

  pickActiveSlot(io = {}) {
    if (!io) return null;
    const card1 = Number(io.driver1CardPresence);
    const driver1Id = io.driver1Id;
    if (card1 && driver1Id) {
      return {
        slot: 1,
        driverId: String(driver1Id),
        driverName: io.driver1Name || driver1Id,
        workingState: Number(io.driver1WorkingState)
      };
    }
    const card2 = Number(io.driver2CardPresence);
    const driver2Id = io.driver2Id;
    if (card2 && driver2Id) {
      return {
        slot: 2,
        driverId: String(driver2Id),
        driverName: io.driver2Name || driver2Id,
        workingState: Number(io.driver2WorkingState)
      };
    }
    return null;
  }

  async onDeviceEvent(ev) {
    try {
      const device = ev?.detail?.device;
      if (!device) return;
      const { imei, data } = device;
      if (!imei || !data?.io) return;
      const slotInfo = this.pickActiveSlot(data.io);
      if (!slotInfo) {
        this.notifyNoDriver(imei);
        return;
      }
      await this.ensureDutyState({
        imei,
        io: data.io,
        timestamp: data.timestamp
      });
    } catch (err) {
      console.warn("[driverDuty] unable to process deviceEvent", err);
    }
  }

  async ensureDutyState({ imei, io, timestamp }) {
    const slotInfo = this.pickActiveSlot(io);
    if (!slotInfo) return null;
    const { slot, driverId, driverName, workingState } = slotInfo;
    const eventMs = resolveTimestamp(timestamp);
    const key = this.key(imei, slot, driverId);
    const cacheEntry = this.cache.get(key);
    const nowMs = Date.now();
    const needsRefresh =
      !cacheEntry ||
      !cacheEntry.anchorMs ||
      !Array.isArray(cacheEntry.segments) ||
      !cacheEntry.lastFetchedAt ||
      nowMs - cacheEntry.lastFetchedAt > CACHE_TTL_MS ||
      cacheEntry.slot !== slot ||
      cacheEntry.driverId !== driverId;

    let entry = cacheEntry;

    if (needsRefresh) {
      const apiPayload = await this.fetchDutyWindow(imei, driverId, slot);
      const anchorMs = resolveTimestamp(apiPayload.anchor, getDutyAnchorDate(nowMs));
      entry = {
        imei,
        slot,
        driverId,
        driverName,
        anchorMs,
        segments: Array.isArray(apiPayload.segments) ? apiPayload.segments : [],
        latest: apiPayload.latest,
        lastFetchedAt: nowMs
      };
    } else {
      entry.driverName = driverName;
      entry.lastFetchedAt = nowMs;
    }

    const metrics = this.calculateMetrics({
      entry,
      eventTimestamp: eventMs,
      workingState
    });

    entry.metrics = metrics;
    entry.lastWorkingState = workingState;
    entry.lastUpdatedAt = nowMs;

    this.cache.set(key, entry);
    this.emitUpdate(key, metrics);
    return metrics;
  }

  async fetchDutyWindow(imei, driverId, slot) {
    const url = `/dashboard/driver-duty/${encodeURIComponent(imei)}/${encodeURIComponent(driverId)}?slot=${slot}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include"
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`driver-duty fetch failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  calculateMetrics({ entry, eventTimestamp, workingState }) {
    const nowMs = Number.isFinite(eventTimestamp) ? eventTimestamp : Date.now();
    const anchorMs = Number.isFinite(entry.anchorMs) ? entry.anchorMs : getDutyAnchorDate(nowMs);
    const dayStart = startOfDay(nowMs);
    const weekStart = startOfWeek(nowMs);

    const segments = (entry.segments || [])
      .map((segment) => ({
        state: Number(segment.state),
        start: resolveTimestamp(segment.start, anchorMs),
        end: resolveTimestamp(segment.end, nowMs)
      }))
      .filter((segment) => Number.isFinite(segment.state) && Number.isFinite(segment.start) && Number.isFinite(segment.end))
      .map((segment) => ({
        state: segment.state,
        start: Math.max(anchorMs, Math.min(segment.start, nowMs)),
        end: Math.max(anchorMs, Math.min(segment.end, nowMs))
      }))
      .filter((segment) => segment.end > segment.start)
      .sort((a, b) => a.start - b.start);

    if (segments.length === 0) {
      segments.push({
        state: Number.isFinite(workingState) ? workingState : 0,
        start: anchorMs,
        end: nowMs
      });
    } else {
      const last = segments[segments.length - 1];
      if (last.end < nowMs) {
        if (last.state === workingState) {
          last.end = nowMs;
        } else {
          segments.push({
            state: Number.isFinite(workingState) ? workingState : 0,
            start: last.end,
            end: nowMs
          });
        }
      } else {
        last.end = Math.min(last.end, nowMs);
      }
    }

    let drivingDayMs = 0;
    let drivingWeekMs = 0;
    let drivingFortnightMs = 0;
    let restCurrentMs = 0;
    let continuousDrivingMs = 0;

    let countdown = null;
    let primaryLabel = null;

    const accumulateOverlap = (segment, threshold) => {
      if (segment.end <= threshold) return 0;
      return Math.max(0, segment.end - Math.max(segment.start, threshold));
    };

    segments.forEach((segment) => {
      const isDrivingState = segment.state === 3 || segment.state === 2;
      if (isDrivingState) {
        drivingDayMs += accumulateOverlap(segment, dayStart);
        drivingWeekMs += accumulateOverlap(segment, weekStart);
        drivingFortnightMs += accumulateOverlap(segment, anchorMs);
      }
    });

    const dailyLimitMs = drivingDayMs > DAILY_LIMIT_MS ? DAILY_EXT_LIMIT_MS : DAILY_LIMIT_MS;
    const timeToDailyLimit = Math.max(0, dailyLimitMs - drivingDayMs);
    const dailyLimitHours = dailyLimitMs / HOUR_MS;
    const weeklyRemainingMs = Math.max(0, WEEK_LIMIT_MS - drivingWeekMs);
    let secondaryLabel = `Settimana: restano ${formatClock(weeklyRemainingMs, { includeSeconds: false })}`;
    const counterHints = {
      daily: `Limite ${dailyLimitHours.toFixed(1)}h - Restano ${formatClock(timeToDailyLimit, { includeSeconds: false })}`,
      weekly: `Limite ${(WEEK_LIMIT_MS / HOUR_MS).toFixed(0)}h - Restano ${formatClock(weeklyRemainingMs, { includeSeconds: false })}`,
      stint: "Limite 4h30"
    };

    if (workingState === 3 || workingState === 2) {
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        if (segment.state === 3 || segment.state === 2) {
          const contribution = Math.max(0, Math.min(segment.end, nowMs) - Math.max(segment.start, anchorMs));
          continuousDrivingMs += contribution;
        } else if (segment.state === 0) {
          break;
        } else {
          break;
        }
      }

      const timeToBreakMs = Math.max(0, BREAK_LIMIT_MS - continuousDrivingMs);

      if (timeToBreakMs > 0) {
        primaryLabel = `Pausa in: ${formatClock(timeToBreakMs, { includeSeconds: true })}`;
        countdown = {
          mode: "break",
          targetMs: nowMs + timeToBreakMs,
          runningLabel: "Pausa in",
          expiredLabel: "Pausa necessaria"
        };
      } else {
        primaryLabel = "Pausa necessaria";
      }

      secondaryLabel = `Giornata: restano ${formatClock(timeToDailyLimit, { includeSeconds: false })}`;
      counterHints.stint = timeToBreakMs > 0
        ? `Limite 4h30 - Restano ${formatClock(timeToBreakMs, { includeSeconds: false })}`
        : "Limite 4h30 - Oltre il limite";
      counterHints.daily = `Limite ${dailyLimitHours.toFixed(1)}h - Restano ${formatClock(timeToDailyLimit, { includeSeconds: false })}`;
    } else if (workingState === 0) {
      let currentRestSegment = null;
      for (let i = segments.length - 1; i >= 0; i -= 1) {
        const candidate = segments[i];
        if (candidate.state === 0 && candidate.end === nowMs) {
          currentRestSegment = candidate;
          break;
        }
        if (candidate.end < nowMs) break;
      }
      restCurrentMs = currentRestSegment ? nowMs - Math.max(currentRestSegment.start, anchorMs) : 0;
      const restRemainingMs = Math.max(0, DAILY_REST_MIN_MS - restCurrentMs);
      if (restRemainingMs > 0) {
        primaryLabel = `Riposo restante: ${formatClock(restRemainingMs, { includeSeconds: true })}`;
        countdown = {
          mode: "rest",
          targetMs: nowMs + restRemainingMs,
          runningLabel: "Riposo restante",
          expiredLabel: "Riposo completato"
        };
        counterHints.stint = `Riposo restante ${formatClock(restRemainingMs, { includeSeconds: false })}`;
        secondaryLabel = `Riposo: restano ${formatClock(restRemainingMs, { includeSeconds: false })}`;
      } else {
        primaryLabel = "Riposo completato";
        counterHints.stint = "Riposo completato";
      }
    } else {
      primaryLabel = "In attesa di attivita";
      counterHints.stint = "In attesa";
    }

    const counters = {
      daily: { value: toHours(drivingDayMs), max: dailyLimitHours },
      weekly: { value: toHours(drivingWeekMs), max: WEEK_LIMIT_MS / HOUR_MS },
      stint: { value: toHours(continuousDrivingMs), max: BREAK_LIMIT_MS / HOUR_MS }
    };

    if (workingState === 0 || !Number.isFinite(workingState)) {
      counters.stint.value = 0;
    }

    return {
      key: this.key(entry.imei, entry.slot, entry.driverId),
      imei: entry.imei,
      slot: entry.slot,
      driverId: entry.driverId,
      driverName: entry.driverName,
      workingState,
      updatedAt: new Date(nowMs).toISOString(),
      anchor: new Date(anchorMs).toISOString(),
      totals: {
        drivingDayMs,
        drivingWeekMs,
        drivingFortnightMs,
        restCurrentMs,
        continuousDrivingMs
      },
      counters,
      allowances: {
        breakRemainingMs: Math.max(0, BREAK_LIMIT_MS - continuousDrivingMs),
        dailyRemainingMs: Math.max(
          0,
          (drivingDayMs > DAILY_LIMIT_MS ? DAILY_EXT_LIMIT_MS : DAILY_LIMIT_MS) - drivingDayMs
        ),
        weeklyRemainingMs: Math.max(0, WEEK_LIMIT_MS - drivingWeekMs),
        fortnightRemainingMs: Math.max(0, FORTNIGHT_LIMIT_MS - drivingFortnightMs)
      },
      labels: {
        primary: primaryLabel,
        secondary: secondaryLabel
      },
      countdown,
      counterHints
    };
  }

  emitUpdate(key, metrics) {
    window.dispatchEvent(new CustomEvent("driverDutyUpdate", { detail: { key, metrics } }));
    this.updateBindings(key, metrics);
  }

  updateBindings(key, metrics, specificBinding = null) {
    const targets = specificBinding
      ? [specificBinding]
      : Array.from(this.bindings.get(key) || []);
    if (!targets.length) return;

    targets.forEach((binding) => {
      updateTooltipCounters(binding.element, metrics?.counters || { daily: { value: 0 }, weekly: { value: 0 }, stint: { value: 0 } });

      if (binding.hintEls) {
        binding.hintEls.forEach((nodes, dutyKey) => {
          const hintText = metrics?.counterHints?.[dutyKey] ?? binding.defaultHints.get(dutyKey) ?? "";
          nodes.forEach((node) => {
            if (node) node.textContent = hintText;
          });
        });
      }

      if (binding.secondaryEl) {
        binding.secondaryEl.textContent = metrics?.labels?.secondary || "";
      }

      const label = metrics?.labels?.primary || "N/D";
      if (binding.countdownEl) {
        binding.countdownEl.textContent = label;
      }

      if (binding.timerId) {
        window.clearInterval(binding.timerId);
        binding.timerId = null;
      }

      if (metrics?.countdown?.targetMs && metrics.countdown.targetMs > Date.now()) {
        const { runningLabel, expiredLabel } = metrics.countdown;
        const updateTick = () => {
          const remaining = metrics.countdown.targetMs - Date.now();
          if (remaining <= 0) {
            if (binding.countdownEl) binding.countdownEl.textContent = expiredLabel || "Scaduto";
            if (binding.timerId) {
              window.clearInterval(binding.timerId);
              binding.timerId = null;
            }
            return;
          }
          if (binding.countdownEl) {
            binding.countdownEl.textContent = `${runningLabel}: ${formatClock(remaining, { includeSeconds: true })}`;
          }
        };
        updateTick();
        binding.timerId = window.setInterval(updateTick, SECOND_MS);
      }
    });
  }

  attachTooltip({ imei, slot, driverId, element }) {
    if (!element || !driverId) {
      return () => {};
    }
    const key = this.key(imei, slot, driverId);
    const binding = {
      element,
      countdownEl: element.querySelector('[data-role="duty-countdown"]'),
      secondaryEl: element.querySelector('[data-role="duty-secondary"]'),
      timerId: null,
      hintEls: new Map(),
      defaultHints: new Map()
    };

    element.querySelectorAll('[data-role="duty-counter-hint"]').forEach((el) => {
      const key = el?.dataset?.dutyKey;
      if (!key) return;
      const list = binding.hintEls.get(key) || [];
      list.push(el);
      binding.hintEls.set(key, list);
      if (!binding.defaultHints.has(key)) {
        binding.defaultHints.set(key, el.textContent || "");
      }
    });
    const set = this.bindings.get(key) || new Set();
    set.add(binding);
    this.bindings.set(key, set);

    const entry = this.cache.get(key);
    if (entry?.metrics) {
      this.updateBindings(key, entry.metrics, binding);
    } else {
      updateTooltipCounters(element, { daily: { value: 0 }, weekly: { value: 0 }, stint: { value: 0 } });
      if (binding.countdownEl) {
        binding.countdownEl.textContent = "Calcolo attivita...";
      }
    }

    return () => {
      if (binding.timerId) {
        window.clearInterval(binding.timerId);
        binding.timerId = null;
      }
      const currentSet = this.bindings.get(key);
      if (currentSet) {
        currentSet.delete(binding);
        if (!currentSet.size) {
          this.bindings.delete(key);
        }
      }
    };
  }

  notifyNoDriver(imei) {
    for (const [key, bindings] of this.bindings.entries()) {
      if (!key.startsWith(`${imei}:`)) continue;
      bindings.forEach((binding) => {
        if (binding.timerId) {
          window.clearInterval(binding.timerId);
          binding.timerId = null;
        }
        updateTooltipCounters(binding.element, {
          daily: { value: 0 },
          weekly: { value: 0 },
          stint: { value: 0 }
        });
        if (binding.hintEls) {
          binding.hintEls.forEach((nodes, dutyKey) => {
            const text = binding.defaultHints.get(dutyKey) || "";
            nodes.forEach((node) => {
              if (node) node.textContent = text;
            });
          });
        }
        if (binding.secondaryEl) {
          binding.secondaryEl.textContent = "Settimana: --";
        }
        if (binding.countdownEl) {
          binding.countdownEl.textContent = "Nessun autista attivo";
        }
      });
    }
  }

  getSnapshot({ imei, slot, driverId }) {
    const entry = this.cache.get(this.key(imei, slot, driverId));
    return entry?.metrics || null;
  }
}

export const driverDutyManager = new DriverDutyManager();



















