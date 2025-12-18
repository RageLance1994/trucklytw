const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_PX_PER_HOUR = 50;
const DAILY_EXT_LIMIT_MS = 10 * HOUR_MS;

const labels = {
  driving: "Guida",
  working: "Lavoro",
  resting: "Riposo"
};

const palette = {
  driving: "var(--tv-green)",
  working: "var(--tv-warning)",
  resting: "var(--tv-blue)",
  overtime: "var(--tv-red)"
};

const formatHoursMinutes = (hoursFloat) => {
  const totalMinutes = Math.max(0, Math.round(hoursFloat * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const formatClockTime = (ms) => {
  if (!Number.isFinite(ms)) return "--:--";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const stateFromRecord = (record) => {
  const code = Number(record?.to_state ?? record?.state);
  const name = String(record?.to_state_name || record?.state_name || "").toLowerCase();
  if (code === 3 || name.includes("driv")) return "driving";
  if (code === 2 || name.includes("work")) return "working";
  return "resting";
};

const normalizeEvents = (items) => {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const ts = Date.parse(item?.timestamp || item?.ts || item?.time || item?.date);
      const state = stateFromRecord(item);
      return Number.isFinite(ts) ? { ts, state } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
};

const computeWindow = (events) => {
  if (events.length >= 2) {
    const startMs = events[0].ts;
    const endMs = events[events.length - 1].ts;
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      return { startMs, endMs };
    }
  }
  const referenceTs = events.length ? events[events.length - 1].ts : Date.now();
  const start = new Date(referenceTs);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = startMs + 24 * HOUR_MS;
  return { startMs, endMs };
};

const applyOvertime = (segments) => {
  const driveStates = new Set(["driving", "working"]);
  const result = [];

  let dayStart = null;
  let dayEnd = null;
  let dayDrivingMs = 0;

  const rolloverDay = (ts) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    dayStart = d.getTime();
    dayEnd = dayStart + 24 * HOUR_MS;
    dayDrivingMs = 0;
  };

  segments.forEach((seg) => {
    if (dayStart === null || seg.start >= dayEnd) {
      rolloverDay(seg.start);
    }

    let cursor = seg.start;
    while (cursor < seg.end) {
      if (cursor >= dayEnd) {
        rolloverDay(cursor);
      }
      const sliceEnd = Math.min(seg.end, dayEnd);
      const duration = sliceEnd - cursor;

      if (!driveStates.has(seg.state)) {
        result.push({ ...seg, start: cursor, end: sliceEnd, overtime: false });
      } else {
        const remainingBeforeOvertime = Math.max(0, DAILY_EXT_LIMIT_MS - dayDrivingMs);
        if (remainingBeforeOvertime <= 0) {
          result.push({ ...seg, start: cursor, end: sliceEnd, overtime: true });
          dayDrivingMs += duration;
        } else if (duration <= remainingBeforeOvertime) {
          result.push({ ...seg, start: cursor, end: sliceEnd, overtime: false });
          dayDrivingMs += duration;
        } else {
          const splitPoint = cursor + remainingBeforeOvertime;
          if (remainingBeforeOvertime > 0) {
            result.push({ ...seg, start: cursor, end: splitPoint, overtime: false });
            dayDrivingMs += remainingBeforeOvertime;
          }
          result.push({ ...seg, start: splitPoint, end: sliceEnd, overtime: true });
          dayDrivingMs += duration - remainingBeforeOvertime;
        }
      }

      cursor = sliceEnd;
    }
  });

  return result;
};

export class DriverChart {
  constructor(targetId, { pxPerHour = DEFAULT_PX_PER_HOUR } = {}) {
    this.pxPerHour = pxPerHour;
    this.target = document.getElementById(targetId);
    this.timelineStartMs = null;
    this.timelineEndMs = null;
    this.bars = {};
    this.crosshair = null;
    this.tooltip = null;
    this.cachedSegments = [];

    if (this.target) {
      this.buildBase();
      this.attachCrosshair();
      this.attachTooltip();
    }

    window.addEventListener("deviceEvent", (ev) => this.onDeviceEvent(ev));
  }

  buildBase() {
    this.target.innerHTML = `
      <div class="wrapper-v j-sb a-center nopadding" style="overflow:hidden;">
        <div class="wrapper-v j-start a-start" style="overflow-x:auto; overflow-y:hidden; position:relative" id="${this.target.id}-bar-container">
          <div class="wrapper-v j-center a-start nopadding w-fit-content"><div class="activity-bar"></div></div>
          <div class="wrapper-v j-center a-start nopadding"><div class="work-bar"></div></div>
          <div class="wrapper-v j-center a-start nopadding"><div class="rest-bar"></div></div>
        </div>
      </div>
    `;

    this.barContainer = document.getElementById(`${this.target.id}-bar-container`);
    this.barContainer.style.cursor = "crosshair";
    this.bars = {
      driving: this.barContainer.querySelector(".activity-bar"),
      working: this.barContainer.querySelector(".work-bar"),
      resting: this.barContainer.querySelector(".rest-bar")
    };

    const spacer = document.createElement("div");
    spacer.dataset.role = "bar-width-spacer";
    spacer.style.height = "0";
    spacer.style.margin = "0";
    spacer.style.padding = "0";
    spacer.style.flex = "0 0 auto";
    this.barContainer.appendChild(spacer);
  }

  attachCrosshair() {
    if (!this.barContainer) return;
    const v = document.createElement("div");
    const h = document.createElement("div");
    [v, h].forEach((el, idx) => {
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
      el.style.background = "rgba(255,255,255,0.35)";
      el.style.opacity = "0";
      el.style.zIndex = idx === 0 ? "9998" : "9997";
    });
    v.style.width = "1px";
    h.style.height = "1px";
    v.style.top = "0";
    h.style.left = "0";
    this.barContainer.appendChild(v);
    this.barContainer.appendChild(h);
    this.crosshair = {
      show: (x, y) => {
        v.style.left = `${x}px`;
        v.style.height = `${this.barContainer.scrollHeight}px`;
        h.style.top = `${y}px`;
        h.style.width = `${this.barContainer.scrollWidth}px`;
        v.style.opacity = h.style.opacity = "1";
      },
      hide: () => {
        v.style.opacity = h.style.opacity = "0";
      }
    };
  }

  attachTooltip() {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.zIndex = "9999";
    el.style.padding = "6px 10px";
    el.style.background = "rgba(0,0,0,0.85)";
    el.style.color = "#fff";
    el.style.borderRadius = "6px";
    el.style.fontSize = "12px";
    el.style.pointerEvents = "none";
    el.style.opacity = "0";
    el.style.transition = "opacity 120ms ease";
    document.body.appendChild(el);
    this.tooltip = {
      show: (text, x, y) => {
        el.textContent = text;
        el.style.left = `${x + 8}px`;
        el.style.top = `${y - 10}px`;
        el.style.opacity = "1";
      },
      hide: () => {
        el.style.opacity = "0";
      }
    };
  }

  renderEvents(rawEvents = []) {
    const events = normalizeEvents(rawEvents);
    const { startMs, endMs } = computeWindow(events);
    this.timelineStartMs = startMs;
    this.timelineEndMs = endMs;
    const segments = this.buildSegments(events, startMs, endMs);
    this.cachedSegments = segments;
    this.renderSegments(segments);
  }

  buildSegments(events, startMs, endMs) {
    if (!events.length) return [];
    const segments = [];
    let cursor = startMs;
    let currentState = "resting";

    events.forEach((evt) => {
      if (evt.ts <= startMs) {
        currentState = evt.state;
        return;
      }
      if (evt.ts >= endMs) return;
      const clampedEnd = Math.max(startMs, Math.min(evt.ts, endMs));
      if (clampedEnd > cursor) {
        segments.push({ state: currentState, start: cursor, end: clampedEnd });
      }
      currentState = evt.state;
      cursor = clampedEnd;
    });

    if (cursor < endMs) {
      segments.push({ state: currentState, start: cursor, end: endMs });
    }

    return applyOvertime(segments.filter((seg) => seg.end > seg.start));
  }

  renderSegments(segments) {
    if (!this.barContainer) return;
    Object.values(this.bars).forEach((bar) => {
      if (!bar) return;
      bar.innerHTML = "";
      bar.style.display = "flex";
      bar.style.alignItems = "stretch";
      bar.style.gap = "0px";
      bar.style.padding = "4px 0";
      bar.style.backgroundColor = "transparent";
    });

    const timelineHours =
      this.timelineStartMs != null && this.timelineEndMs != null
        ? Math.max(1, (this.timelineEndMs - this.timelineStartMs) / HOUR_MS)
        : null;
    const baseWidth = timelineHours ? timelineHours * this.pxPerHour : null;
    const spacer = this.barContainer.querySelector("[data-role='bar-width-spacer']");

    const sequence = [
      ["driving", this.bars.driving],
      ["working", this.bars.working],
      ["resting", this.bars.resting]
    ];

    sequence.forEach(([stateKey, bar]) => {
      if (!bar) return;
      if (baseWidth) {
        bar.style.width = `${baseWidth}px`;
      }
      segments.forEach((segment) => {
        const durationHours = (segment.end - segment.start) / HOUR_MS;
        if (durationHours <= 0) return;
        const width = durationHours * this.pxPerHour;
        const chunk = document.createElement("div");
        chunk.style.width = `${width}px`;
        chunk.style.height = "100%";
        const isMatch = segment.state === stateKey;
        const isOvertime = Boolean(segment.overtime && isMatch);
        chunk.style.background = isMatch ? (isOvertime ? palette.overtime : palette[stateKey]) : "transparent";
        chunk.style.opacity = isMatch ? "1" : "0.08";
        if (isMatch) {
          chunk.dataset.segment = "1";
          const label = `${labels[stateKey] || stateKey}${isOvertime ? " (Straordinario)" : ""}`;
          chunk.title = `${label} - Totale ${formatHoursMinutes(durationHours)}`;
          const show = (evt) => {
            const rect = chunk.getBoundingClientRect();
            const point = evt.touches?.[0];
            const clientX = point?.clientX ?? evt.clientX ?? rect.left;
            const clientY = point?.clientY ?? evt.clientY ?? rect.top;
            const ratio = rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 1;
            const hours = durationHours * ratio;
            const timeMs = segment.start + (segment.end - segment.start) * ratio;
            const text = `${label}: ${formatHoursMinutes(hours)} - Ora: ${formatClockTime(timeMs)}`;
            this.crosshair?.hide();
            this.tooltip?.show(text, clientX, clientY);
          };
          const hide = () => this.tooltip?.hide();
          chunk.addEventListener("mouseenter", show);
          chunk.addEventListener("mousemove", show);
          chunk.addEventListener("mouseleave", hide);
          chunk.addEventListener("touchstart", (ev) => {
            show(ev);
          }, { passive: true });
          chunk.addEventListener("touchmove", (ev) => {
            show(ev);
          }, { passive: true });
          chunk.addEventListener("touchend", hide);
        }
        bar.appendChild(chunk);
      });
    });

    if (spacer && baseWidth) {
      spacer.style.width = `${baseWidth}px`;
    }
  }

  attachHover() {
    if (!this.barContainer) return;
    const handleMove = (evt) => {
      const target = evt.target;
      const isSegment = target?.dataset?.segment === "1";
      if (isSegment) return;
      if (this.timelineStartMs == null || this.timelineEndMs == null) return;
      const rect = this.barContainer.getBoundingClientRect();
      const clientX = evt.clientX ?? 0;
      const clientY = evt.clientY ?? 0;
      const offsetX = (clientX - rect.left) + this.barContainer.scrollLeft;
      const offsetY = (clientY - rect.top);
      const totalMs = this.timelineEndMs - this.timelineStartMs;
      const ratio = totalMs > 0 ? Math.min(1, Math.max(0, offsetX / (totalMs / HOUR_MS * this.pxPerHour))) : 0;
      const timeMs = this.timelineStartMs + ratio * totalMs;
      this.crosshair?.show(offsetX, offsetY);
      this.tooltip?.show(`Ora: ${formatClockTime(timeMs)}`, clientX, clientY);
    };
    const handleLeave = () => {
      this.crosshair?.hide();
      this.tooltip?.hide();
    };
    this.barContainer.addEventListener("mousemove", handleMove);
    this.barContainer.addEventListener("mouseleave", handleLeave);
  }

  onDeviceEvent(ev) {
    const events = ev?.detail?.events;
    if (!Array.isArray(events)) return;
    this.renderEvents(events);
  }
}
