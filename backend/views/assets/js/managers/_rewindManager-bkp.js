import { TrucklyMap } from "/assets/js/maps.js";
export class RewindManager {
    constructor(imei, map_target, scrubber, history) {
        this.map_target = map_target;
        this.imei = imei;
        // Tunable thresholds/config (can be overridden via window.rewindConfig)
        this.cfg = Object.assign({
            speedThreshold: 5,
            pauseMinMs: 10 * 60 * 1000, // 10m
            restMinMs: 45 * 60 * 1000, // 45m
            fuelChangePct: 5,          // +/- percentage threshold
            refuelWindowMs: 10 * 60 * 1000,
            eventDedupWindowMs: 3 * 60 * 60 * 1000, // collapse driver events within 3 hours
            eventDedupTypes: ['rest', 'pause', 'driver_login', 'driver_change'],
            maxRenderPoints: 2000,
            maxQueries: 4
        }, window.rewindConfig || {});
        this.vehicle = window.vehicles?.find(
            (element) => element.imei == (imei || window?.vehicles[0].imei)
        );
        this.baseUrl = "/dashboard/vehicles/history";
        // Safely initialize time range controls (may not be present yet)
        const controlsEl = document.querySelector('#path_chart_controls');
        const inputs = controlsEl?.querySelectorAll('input[type="datetime-local"]') || [];
        [this.fromInput, this.toInput] = [inputs?.[0], inputs?.[1]];

        const defaultStart = new Date(Date.now() - (Date.now() % 86400000) - 86400000); // start of previous day
        const defaultEnd = new Date();

        if (this.fromInput && this.toInput) {
            // Populate inputs with defaults in ISO local format (YYYY-MM-DDTHH:mm)
            [this.fromInput.value, this.toInput.value] = [defaultStart, defaultEnd].map(d => d.toISOString().slice(0, 16));
            this.from = new Date(this.fromInput.value).getTime();
            this.to = new Date(this.toInput.value).getTime();
        } else {
            // Fallback if controls are missing: use numeric timestamps
            this.from = defaultStart.getTime();
            this.to = defaultEnd.getTime();
        }

        this.dataDensity = 1000;
        this.scrubber = scrubber;
        this.drawPath = this.drawPath.bind(this)
        this.loadShit = this.loadShit.bind(this)
        this.history = Array.isArray(history)
            ? [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            : [];
        this.rewindMarker = null;
        this.map = null;
        // dynamic ids for per-vehicle route layers/sources
        this._routeIds = { src: null, layer: null, casing: null };
        this._routeFilterKey = null;
        this._lastMarkerIndex = null;
        this._pendingNormalized = 0;
        this._updateScheduled = false;
        this._lastFilteredEvents = [];
        // Inline helpers to ensure availability during init
        this._setMapLoading = (isLoading) => {
            try {
                const el = document.querySelector('.overlay.blurred.fade#mapLoad');
                if (!el) return;
                if (isLoading) {
                    el.classList.remove('out');
                    try { this._setMapProgress && this._setMapProgress(0); } catch { }
                } else {
                    el.classList.add('out');
                }
            } catch { }
        };
        this._setMapProgress = (pct) => {
            try {
                const wrap = document.querySelector('.overlay.blurred.fade#mapLoad');
                if (!wrap) return;
                const p = wrap.querySelector('p');
                if (!p) return;
                p.textContent = 'Carico i dati: ' + pct + '%';
            } catch { }
        };
        this.update = this.update.bind(this);

        this.init();
        scrubber.target.addEventListener('scrubber:change', this.update)


    }

    addStartStopMarkers(historyInput = null) {
        const map = this.map;
        const history = Array.isArray(historyInput)
            ? historyInput
            : (Array.isArray(this.history) ? this.history : []);

        if (!(map?.addOrUpdateMarker) || !history.length) {
            map?.removeMarker?.(`${this.imei}_startpoint`);
            map?.removeMarker?.(`${this.imei}_endpoint`);
            return;
        }

        const first = history[0];
        const last = history[history.length - 1];
        if (!(first?.gps && last?.gps)) {
            map?.removeMarker?.(`${this.imei}_startpoint`);
            map?.removeMarker?.(`${this.imei}_endpoint`);
            return;
        }

        const startState = this.getVehicleState(first.gps.Speed, first.io?.ignition);
        map.addOrUpdateMarker({
            id: `${this.imei}_startpoint`,
            lng: first.gps.Longitude,
            lat: first.gps.Latitude,
            status: startState?.class,
            html: `<i class="fa fa-flag-checkered big"></i>`,
            hasPopup: false,
            classlist: 'wrapper-h j-center a-center extreme-marker start',
        });

        const endState = this.getVehicleState(last.gps.Speed, last.io?.ignition);
        map.addOrUpdateMarker({
            id: `${this.imei}_endpoint`,
            lng: last.gps.Longitude,
            lat: last.gps.Latitude,
            status: endState?.class,
            html: `<i class="fa fa-flag-checkered flipped big"></i>`,
            hasPopup: false,
            classlist: 'wrapper-h j-center a-center extreme-marker end',
        });
    }

    async init() {
        try {
            this.spawnMap();
            this._setMapLoading(false);

            // setup scrubber
            // Setup scrubber only if target element exists
            const scrubberEl = document.querySelector("#play_vehicle_scrubber");
            if (!this.scrubber && scrubberEl && window.noUiSlider) {
                this.scrubber = noUiSlider.create(scrubberEl, {
                    start: 0,
                    connect: [false, true],
                    range: { min: 0, max: 100 },
                    step: 0.0001,
                    direction: "rtl" // lifo se vuoi playback inverso
                });
            }

            if (this.scrubber?.on) {
                this.scrubber.on("update", this.update.bind(this));
            }
        }
        catch (e) {
            console.log(`Failed to init RewindManager due to error`, e);
        }
    }

    spawnMap() {
        this.map = new TrucklyMap({
            target: this.map_target,
            theme: "dark",
        });
        this.map.map.on('load', this.loadShit)
    }

    loadShit() {
        this._renderAll()

    }

    async retrieveEvents({ from, to, force = false } = {}) {
        const normalizeBound = (value, fallback) => {
            if (Number.isFinite(value)) return value;
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) return parsed;
            if (Number.isFinite(fallback)) return fallback;
            return null;
        };

        const fromMs = normalizeBound(from, this.from);
        const toMs = normalizeBound(to, this.to);

        if (!this.imei || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
            this.fuelEvents = [];
            return [];
        }

        this.from = fromMs;
        this.to = toMs;

        const rangeKey = `${this.imei}:${fromMs}:${toMs}`;
        if (!force && this._fuelEventsRangeKey === rangeKey && Array.isArray(this.fuelEvents) && this.fuelEvents.length) {
            return this.fuelEvents;
        }

        try {
            const res = await window._post('/dashboard/fuelevents/history', {
                imei: this.imei,
                from: fromMs,
                to: toMs
            });
            const normalized = Array.isArray(res)
                ? res
                    .map((evt) => this._normalizeFuelEvent(evt))
                    .filter(Boolean)
                    .sort((a, b) => a.start - b.start)
                : [];
            this.fuelEvents = normalized;
            this._fuelEventsRangeKey = rangeKey;
            return normalized;
        } catch (err) {
            console.error('[RewindManager] unable to retrieve fuel events', err);
            this.fuelEvents = [];
            this._fuelEventsRangeKey = null;
            return [];
        }
    }

    _normalizeFuelEvent(raw = {}) {
        const toNumber = (value) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        };

        const eventId = raw.eventId || raw._id;
        const start = toNumber(raw.startMs ?? raw.start ?? raw.eventStart);
        const end = toNumber(raw.endMs ?? raw.end ?? raw.eventEnd ?? start);
        if (!eventId || !Number.isFinite(start) || !Number.isFinite(end)) return null;

        const normalizedTypeRaw = (raw.normalizedType || raw.type || 'refuel').toLowerCase();
        const normalizedType = normalizedTypeRaw === 'rifornimento' ? 'refuel' : normalizedTypeRaw;

        const durationMs = toNumber(raw.durationMs ?? (end - start));
        const liters = toNumber(raw.liters ?? raw.delta);
        const delta = toNumber(raw.delta ?? raw.liters);
        const startFuel = toNumber(raw.startFuel ?? raw.startLiters);
        const endFuel = toNumber(raw.endFuel ?? raw.endLiters);
        const lat = toNumber(raw.lat);
        const lng = toNumber(raw.lng);

        return {
            ...raw,
            eventId: String(eventId),
            type: normalizedType,
            normalizedType,
            start,
            end,
            startMs: start,
            endMs: end,
            startTs: start,
            endTs: end,
            durationMs: Number.isFinite(durationMs) ? durationMs : Math.max(0, end - start),
            liters,
            delta,
            startFuel,
            endFuel,
            lat,
            lng,
            source: raw.source || 'server'
        };
    }

    async getHistory() {
        return (this.history);

    }
    setMarker(point) {

    }

    getQueries(chunks, start, stop) {
        const s = Number(start);
        const e = Number(stop);
        const totalMs = e - s;
        const out = [];
        for (let i = 0; i < chunks; i++) {
            const from = s + Math.floor((i * totalMs) / chunks);
            const to = s + Math.floor(((i + 1) * totalMs) / chunks);
            out.push({
                idx: i,
                from,
                to,
                progress: Number(((i + 1) / chunks).toFixed(6)),
            });
        }
        return out;
    }

    findNearestPoint(lngLat, history) {
        let nearest = null;
        let minDist = Infinity;

        history.forEach((h) => {
            if (!h.gps) return;
            const d = Math.hypot(h.gps.Longitude - lngLat.lng, h.gps.Latitude - lngLat.lat);
            if (d < minDist) {
                minDist = d;
                nearest = h;
            }
        });
        return nearest;
    }

    reduce(array, size) {
        return (
            array.map((e, i) => {
                const valid = (i == 0 || i == array.length - 1) || (i % size == 0);
                return (valid ? e : null)
            }).filter(element => Boolean(element))
        )
    }

    _reduceHistoryPoints(history = [], maxPoints = 2000) {
        if (!Array.isArray(history) || history.length <= maxPoints) return history || [];
        const stride = Math.max(1, Math.ceil(history.length / maxPoints));
        return history.filter((_, idx) => idx === 0 || idx === history.length - 1 || (idx % stride === 0));
    }

    _setHistory(list) {
        this.history = Array.isArray(list) ? list : [];
    }

    update(ev) {
        let rawValue = null;
        if (Array.isArray(ev)) {
            rawValue = parseFloat(ev[0]);
        } else if (typeof ev === "number") {
            rawValue = ev;
        } else if (ev && typeof ev === "object") {
            if (ev.detail && ev.detail.percent != null) {
                rawValue = parseFloat(ev.detail.percent);
            } else if (ev.detail && ev.detail.value != null) {
                rawValue = parseFloat(ev.detail.value);
            } else if (ev.target && ev.target.value != null) {
                rawValue = parseFloat(ev.target.value);
            }
        }

        if (!Number.isFinite(rawValue)) {

            return;
        }

        let normalized = rawValue;
        if (Math.abs(normalized) > 1) {
            normalized = normalized / 100;
        }
        normalized = Math.min(Math.max(normalized, 0), 1);

        this._pendingNormalized = normalized;

        if (!this._updateScheduled) {
            this._updateScheduled = true;
            window.requestAnimationFrame(() => {
                this._updateScheduled = false;
                this._applyScrubberState(this._pendingNormalized);
            });
        }
    }

    _applyScrubberState(normalized) {
        const baseHistory = Array.isArray(this._renderHistory) ? this._renderHistory : this.history;
        console.log(baseHistory)
        const totalPoints = Array.isArray(baseHistory) ? baseHistory.length : 0;
        if (totalPoints === 0) {

            window.notify('bad', "Nessuno storico", "Non ho uno storico valido da mostrare per questo veicolo in questo intervallo, il dispositivo potrebbe essere offline!")
            return;
        }

        const clamped = Math.min(Math.max(normalized, 0), 1);
        const position = Math.min(totalPoints - 1, Math.max(0, Math.floor(clamped * (totalPoints - 1))));

        if (position === this._lastMarkerIndex && this._routeFilterKey !== null) {
            return;
        }

        const point = baseHistory[position];
        if (!point || !point.gps) return;
        const vehicle = window.vehicles.find(element => element.imei == this.imei);

        const status = this.getVehicleState(point.gps.Speed, point.io.ignition).class;
        const tooltip = this.buildToolTip(point, vehicle);

        const marker = this.map.addOrUpdateMarker({
            id: this.imei,
            lng: point.gps.Longitude,
            lat: point.gps.Latitude,
            tooltip,
            vehicle,
            device: point,
            status,
            html: null,
            hasPopup: false,

        })

        var classes = ["success", "danger", "warning"];

        classes.map((c) => {
            marker._element.classList.remove(c)
        })
        marker._element.classList.add(status);

        // Trim the visible path to follow the marker (progressive reveal)

        try {
            const map = this.map && this.map.map;
            const srcId = this._routeIds?.src || 'route';
            const src = map && map.getSource && map.getSource(srcId);
            const firstTs = Number(new Date(this.history?.[0]?.timestamp).getTime());
            const lastTs = Number(new Date(this.history?.[this.history.length - 1]?.timestamp).getTime());
            const hasValidOrder = Number.isFinite(firstTs) && Number.isFinite(lastTs);
            const newestFirst = hasValidOrder ? firstTs >= lastTs : false;
            const segIdx = Math.max(0, position - 1);
            const filterExpr = newestFirst
                ? [">=", ["get", "index"], segIdx]
                : ["<", ["get", "index"], position];
            const filterKey = newestFirst ? `nf:${segIdx}` : `of:${position}`;

            if (filterKey !== this._routeFilterKey) {
                let filterApplied = false;
                if (map && map.getLayer && map.setFilter) {
                    const layerId = this._routeIds?.layer;
                    const casingId = this._routeIds?.casing;
                    if (layerId && map.getLayer(layerId)) {
                        map.setFilter(layerId, filterExpr);
                        filterApplied = true;
                    }
                    if (casingId && map.getLayer(casingId)) {
                        map.setFilter(casingId, filterExpr);
                        filterApplied = true;
                    }
                }

                if (!filterApplied && src && Array.isArray(this._routeFeaturesFull)) {
                    const filtered = this._routeFeaturesFull.filter((f) => {
                        const idx = Number(f?.properties?.index);
                        if (!Number.isFinite(idx)) return false;
                        return newestFirst ? idx >= segIdx : idx < position;
                    });
                    src.setData({ type: 'FeatureCollection', features: filtered });
                    filterApplied = true;
                }
                if (filterApplied) {
                    this._routeFilterKey = filterKey;
                }
            }

        } catch (e) {
            console.warn('[RewindManager] path trimming failed:', e);
        }

        this._lastMarkerIndex = position;


    }


    _waitMapReady(cb) {
        const map = this.map?.map;
        if (!map) return;
        const run = () => { try { cb(); } catch (e) { console.error(e); } };
        // se lo style è già pronto, vai
        if (map.isStyleLoaded && map.isStyleLoaded()) return run();
        // altrimenti aspetta il 'load'
        map.once('load', run);
    }

    getVehicleState(speed = 0, ignition = 0) {
        // normalizza i valori


        const v = Number(speed) || 0;
        const ig = Number(ignition) || 0;


        if (v > 5) {
            return { class: "success", status: "In movimento" }; // veicolo in movimento
        }

        if (v <= 5 && ig === 0) {
            return { class: "danger", status: "Fermo" }; // fermo con quadro spento
        }

        if (v <= 5 && ig === 1) {
            return { class: "warning", status: "Fermo quadro acceso" }; // fermo con quadro acceso
        }

        return "sconosciuto"; // fallback di sicurezza
    }

    buildToolTip(device, vehicle) {
        const _html = ``


        return (_html)
    }
    formatDate(dateInput) {
        const d = new Date(dateInput);

        const pad = (n) => n.toString().padStart(2, "0");
        const hh = pad(d.getHours());
        const mm = pad(d.getMinutes());
        const ss = pad(d.getSeconds());

        const today = new Date();
        const sameDay =
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate();

        if (sameDay) {
            return `oggi alle ${hh}:${mm}:${ss}`;
        } else {
            const yyyy = d.getFullYear();
            const MM = pad(d.getMonth() + 1);
            const dd = pad(d.getDate());
            return `${yyyy}-${MM}-${dd} alle ${hh}:${mm}:${ss}`;
        }
    }
    drawPath(history = []) {
        const effectiveHistory = Array.isArray(history) && history.length ? history : this.history;
        if (!Array.isArray(effectiveHistory) || !effectiveHistory.length) {
            console.warn("Nessuna history disponibile per il drawPath");
            this.addStartStopMarkers([]);
            return;
        }
        this.addStartStopMarkers(effectiveHistory);

        const map = this.map.map;
        this._routeFilterKey = null;
        this._lastMarkerIndex = null;

        // rimuove layer e source esistenti (both main and casing) for both generic and per-vehicle ids
        const old = this._routeIds || {};
        const removeLayerIf = (id) => { try { if (id && map.getLayer && map.getLayer(id)) map.removeLayer(id); } catch (e) { /*noop*/ } };
        const removeSourceIf = (id) => { try { if (id && map.getSource && map.getSource(id)) map.removeSource(id); } catch (e) { /*noop*/ } };
        [old.layer, old.casing, 'route', 'route-casing'].forEach(removeLayerIf);
        [old.src, 'route'].forEach(removeSourceIf);

        // costruisci segmenti colorati in base a speed/ignition
        const features = [];
        for (let i = 0; i < effectiveHistory.length - 1; i++) {
            const a = effectiveHistory[i];
            const b = effectiveHistory[i + 1];
            if (!a?.gps || !b?.gps) continue;

            const v = Number(a.gps.Speed ?? a.io?.speed ?? 0);
            const ig = Number(a.io?.ignition ?? 0);
            let color = "#00ff00"; // movimento
            if (v <= 5 && ig === 1) color = "#ffd000"; // quadro acceso
            if (v <= 5 && ig === 0) color = "#ff0000"; // fermo

            features.push({
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [a.gps.Longitude, a.gps.Latitude],
                        [b.gps.Longitude, b.gps.Latitude],
                    ],
                },
                properties: { color, index: i },
            });
        }

        // Store full feature set for progressive trimming in update()
        this._routeFeaturesFull = features;

        const srcId = `route-${this.imei}`;
        const layerId = `route-${this.imei}`;
        const casingId = `route-casing-${this.imei}`;
        this._routeIds = { src: srcId, layer: layerId, casing: casingId };

        map.addSource(srcId, {
            type: "geojson",
            data: { type: "FeatureCollection", features },
        });

        // Add a subtle casing below for better visibility at high zooms
        try {
            map.addLayer({
                id: casingId,
                type: "line",
                source: srcId,
                layout: { "line-cap": "round", "line-join": "round" },
                paint: {
                    "line-width": [
                        "interpolate", ["linear"], ["zoom"],
                        5, 3,
                        10, 6,
                        14, 9,
                        18, 14
                    ],
                    "line-color": "#000000",
                    "line-opacity": 0.25
                }
            });
        } catch (e) { console.error('[RewindManager] add route-casing failed', e); }

        // Main colored route with zoom-adaptive width
        try {
            map.addLayer({
                id: layerId,
                type: "line",
                source: srcId,
                layout: { "line-cap": "round", "line-join": "round" },
                paint: {
                    "line-width": [
                        "interpolate", ["linear"], ["zoom"],
                        5, 2,
                        10, 4,
                        14, 6,
                        18, 10
                    ],
                    // Safe color fallback if missing
                    "line-color": ["case", ["has", "color"], ["get", "color"], "#00FF00"],
                    "line-opacity": 0.95
                }
            });
        } catch (e) { console.error('[RewindManager] add route failed', e); }

        // calcola bounds e centra
        const bounds = new window.maplibregl.LngLatBounds();
        effectiveHistory.forEach(p => p.gps && bounds.extend([p.gps.Longitude, p.gps.Latitude]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 14 });

        // hover con tooltip identico a buildToolTip
        map.on("mousemove", "route", (e) => {
            map.getCanvas().style.cursor = "pointer";
            const feature = e.features?.[0];
            if (!feature) return;

            const idx = feature.properties.index;
            if (typeof idx !== 'number' || idx < 0 || idx >= effectiveHistory.length) return;
            const point = effectiveHistory[idx];
            if (!point || !point.gps) return;
            const vehicle = this.vehicle;
            const tooltipHTML = this.buildToolTip(point, vehicle);

            // rimuovi popup precedente se presente
            if (this._popup) this._popup.remove();

            // popup dark coerente con il resto
            this._popup = new window.maplibregl.Popup({
                offset: 10,
                closeButton: false,
                className: "tooltip-dark",
            })
                .setLngLat(e.lngLat)
                .setHTML(tooltipHTML)
                .addTo(map);
        });

        map.on("mouseleave", "route", () => {
            map.getCanvas().style.cursor = "";
            if (this._popup) this._popup.remove();
        });


    }
}
// Toggle map loading overlay visibility


// Update map loading overlay percentage
RewindManager.prototype._setMapProgress = function (pct) { try { const wrap = document.querySelector('.overlay.blurred.fade#mapLoad'); if (!wrap) return; const p = wrap.querySelector('p'); if (!p) return; p.textContent = 'Carico i dati: ' + pct + '%'; } catch { } };


// Clear layers, markers, popups and sidebar list
RewindManager.prototype.clearMap = function () {
    const map = this.map?.map;
    try {
        if (map?.getLayer && map.getLayer('route')) map.removeLayer('route');
        // also remove casing if present
        if (map?.getLayer && map.getLayer('route-casing')) map.removeLayer('route-casing');
        if (map?.getSource && map.getSource('route')) map.removeSource('route');
        // remove per-vehicle dynamic ids

        const __ids = this._routeIds || {};
        if (__ids.layer && map?.getLayer && map.getLayer(__ids.layer)) map.removeLayer(__ids.layer);
        if (__ids.casing && map?.getLayer && map.getLayer(__ids.casing)) map.removeLayer(__ids.casing);
        if (__ids.src && map?.getSource && map.getSource(__ids.src)) map.removeSource(__ids.src);
    } catch { }
    try { this.map?.clearMarkers?.(); } catch { }
    this._wipeEventMarkers();
    try { if (this._popup) { this._popup.remove(); this._popup = null; } } catch { }
    try { if (this._previewMarker) { this._previewMarker.remove(); this._previewMarker = null; } } catch { }
    try { this.map?.removeMarker?.(this.imei); } catch { }
    this._routeFilterKey = null;
    this._lastMarkerIndex = null;
};

RewindManager.prototype._wipeEventMarkers = function () {
    try {
        if (window._eventMarkerRegistry instanceof Map) {
            window._eventMarkerRegistry.forEach((entry, eventId) => {
                try {
                    entry?.marker?.remove?.();
                    this.map?.removeMarker?.(eventId);
                } catch { }
            });
            window._eventMarkerRegistry.clear();
        }
    } catch { }
    try {
        if (window._eventSidebarRegistry instanceof Map) {
            window._eventSidebarRegistry.clear();
        }
    } catch { }
    try { window._eventTimelineFiltered = []; } catch { }
    try { this.map?.removeMarker?.(`${this.imei}_startpoint`); } catch { }
    try { this.map?.removeMarker?.(`${this.imei}_endpoint`); } catch { }
};

// Switch active vehicle and reload
RewindManager.prototype.switchVehicle = async function (newImei) {
    if (!newImei) return;
    this.clearMap();
    this.imei = newImei;
    this.vehicle = window.vehicles?.find(v => v.imei == this.imei) || null; this.cache = { from: null, to: null, history: [] };
    // refresh time range from inputs if present
    const controlsEl = document.querySelector('#path_chart_controls');
    const inputs = controlsEl?.querySelectorAll('input[type="datetime-local"]') || [];
    if (inputs?.[0] && inputs?.[1]) {
        this.from = new Date(inputs[0].value).getTime();
        this.to = new Date(inputs[1].value).getTime();
    }
    this.history = [];
    await this.refreshForRange(this.from, this.to);
};

// Fetch a time range via preview + chunked history calls
RewindManager.prototype._fetchRange = async function (from, to) {
    const body = { from, to, imei: this.imei, limit: 1000 };
    const { chunks } = await window._post(`${this.baseUrl}preview`, body);
    const maxQ = Math.max(1, Math.min(this.cfg.maxQueries || 4, chunks || 1));
    const queries = this.getQueries(maxQ, from, to);
    let done = 0; this._setMapProgress(0);
    const arr = [];
    for (const q of queries) {
        const res = await window._post(this.baseUrl, { from: q.from, to: q.to, imei: this.imei });
        arr.push(...res);
        done++;
        const pct = Math.max(1, Math.round((done / queries.length) * 100));
        this._setMapProgress(pct);
    }
    return arr;
};

// Render pipeline for current this.history
RewindManager.prototype._renderAll = function () {
    const effectiveHistory = this.history;
    this._renderHistory = effectiveHistory;

    if (Array.isArray(effectiveHistory) && effectiveHistory.length && this.map) {
        this.map.history = effectiveHistory;
        if (typeof this.retrieveEvents === 'function') {
            this.retrieveEvents();
        }
    }
    this.drawPath(effectiveHistory);
    this._lastMarkerIndex = null;
    this.update(1);
    if (this.scrubber?.setValue) {
        this.scrubber.setValue(1, false);
    }
};

// Refresh for a new time window, using simple caching to avoid refetching covered ranges
RewindManager.prototype.refreshForRange = async function (newFrom, newTo) {
    if (!(Number.isFinite(newFrom) && Number.isFinite(newTo))) return;
    if (newTo <= newFrom) { alert("Intervallo non valido: la data di fine deve essere successiva alla data di inizio."); return; }
    this.from = newFrom; this.to = newTo;
    this._setMapLoading(true);
    try {
        const fetched = await this.getHistory();
        if (Array.isArray(fetched)) {
            this._setHistory(fetched);
        }
    } finally {
        this._setMapLoading(false);
    }
};

RewindManager.prototype._normalizeEventType = function (value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

RewindManager.prototype._extractEventTimestamp = function (evt) {
    if (!evt || typeof evt !== 'object') return null;
    const candidates = [evt.start, evt.startMs, evt.startTs, evt.timestamp, evt.at, evt.end];
    for (const candidate of candidates) {
        if (candidate == null) continue;
        const num = Number(candidate);
        if (Number.isFinite(num)) return num;
        const parsed = Date.parse(candidate);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
};

RewindManager.prototype.filterEvents = function (eventsOrOptions, maybeOptions) {
    let events = eventsOrOptions;
    let options = maybeOptions;
    const isDomEvent = events && typeof events === 'object' && typeof events.preventDefault === 'function';
    if (!Array.isArray(events) || isDomEvent) {
        options = (!isDomEvent && events && typeof events === 'object' && !Array.isArray(events)) ? events : (options || {});
        events = Array.isArray(window._eventTimelineAll) ? window._eventTimelineAll : [];
    }
    if (!Array.isArray(events) || !events.length) {
        this._lastFilteredEvents = Array.isArray(events) ? [...events] : [];
        try { window._eventTimelineFiltered = this._lastFilteredEvents; } catch { }
        return this._lastFilteredEvents;
    }

    const dedupeWindowMsCandidate = options?.dedupeWindowMs ?? this.cfg?.eventDedupWindowMs;
    const dedupeWindowMs = Number.isFinite(dedupeWindowMsCandidate) ? dedupeWindowMsCandidate : 0;
    const configuredTypes = Array.isArray(options?.dedupeTypes) && options.dedupeTypes.length
        ? options.dedupeTypes
        : Array.isArray(this.cfg?.eventDedupTypes)
            ? this.cfg.eventDedupTypes
            : [];
    const normalizedTypes = new Set(configuredTypes.map((type) => this._normalizeEventType(type)).filter(Boolean));

    if (!dedupeWindowMs || !normalizedTypes.size) {
        this._lastFilteredEvents = [...events];
        try { window._eventTimelineFiltered = this._lastFilteredEvents; } catch { }
        return this._lastFilteredEvents;
    }

    const lastAccepted = new Map();
    const filtered = [];
    const windowMs = dedupeWindowMs;

    for (const evt of events) {
        const typeKey = this._normalizeEventType(evt?.normalizedType || evt?.type);
        if (!typeKey || !normalizedTypes.has(typeKey)) {
            filtered.push(evt);
            continue;
        }

        const ts = this._extractEventTimestamp(evt);
        if (!Number.isFinite(ts)) {
            filtered.push(evt);
            continue;
        }

        const driverId = evt?.driverId ? String(evt.driverId).trim() : '';
        const bucketOwner = driverId || 'global';
        const lastTs = lastAccepted.get(bucketOwner);
        if (Number.isFinite(lastTs) && (ts - lastTs) < windowMs) {
            continue;
        }
        lastAccepted.set(bucketOwner, ts);
        filtered.push(evt);
    }

    this._lastFilteredEvents = filtered;
    try { window._eventTimelineFiltered = filtered; } catch { }
    return filtered;
};













const toFuelNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const resolveFuelMetrics = (io) => {
    if (!io || typeof io !== 'object') {
        return { liters: null, percent: null, capacity: null };
    }
    const litersCandidates = [
        io.current_fuel,
        io.currentFuel,
        io.fuel_total,
        io.fuel,
        io.tank,
        io.tankLiters
    ];
    let liters = null;
    for (const candidate of litersCandidates) {
        const val = toFuelNumber(candidate);
        if (Number.isFinite(val)) {
            liters = val;
            break;
        }
    }

    const tank1 = toFuelNumber(io.tank1 ?? io.tank_1 ?? io.tankPrimary ?? io.primaryTankCapacity);
    const tank2 = toFuelNumber(io.tank2 ?? io.tank_2 ?? io.tankSecondary ?? io.secondaryTankCapacity);
    const capacity = Number.isFinite(tank1) || Number.isFinite(tank2)
        ? (Number(tank1 || 0) + Number(tank2 || 0))
        : null;

    const percentCandidates = [
        io.current_fuel_percent,
        io.currentFuelPercent,
        io.fuel_percent,
        io.tankPerc
    ];
    let percent = null;
    for (const candidate of percentCandidates) {
        const val = toFuelNumber(candidate);
        if (Number.isFinite(val)) {
            percent = val > 1 ? val / 100 : val;
            break;
        }
    }

    if (!Number.isFinite(percent) && Number.isFinite(liters) && Number.isFinite(capacity) && capacity > 0) {
        percent = Math.max(0, Math.min(1, liters / capacity));
    } else if (!Number.isFinite(liters) && Number.isFinite(percent) && Number.isFinite(capacity)) {
        liters = percent * capacity;
    }

    return { liters, percent, capacity };
};
