export class RewindManager {
    constructor(imei, scrubber, history) {
        this.imei = imei;
        this.intervalPicker = document.querySelector('.rewind_scrubber_container');
        this.floater = document.querySelector('.floater');
        this.customFromInput = this.floater?.querySelector('input[data-role="rewind-from"]') || null;
        this.customToInput = this.floater?.querySelector('input[data-role="rewind-to"]') || null;
        this.applyIntervalButton = this.floater?.querySelector('[data-action="rewind-apply"]') || null;
        this.dataLoadingOverlay = this.floater?.querySelector('[data-info="data_loading"]') || null;
        this._mainMapOverlayDefaultText = document.querySelector('#main_map_overlay h1')?.textContent || 'Carico i tuoi veicoli';
        this.intervalSwitchs = this.intervalPicker.querySelectorAll('div[data-action]');
        this.handleIntervalSwitch = this.handleIntervalSwitch.bind(this);
        this.handleApplyInterval = this.handleApplyInterval.bind(this);
        this._handleScrubberVisibility = this._handleScrubberVisibility.bind(this);
        this.intervalType = 'route@today';

        this.intervalSwitchs.forEach((s) => {
            s.addEventListener('click', this.handleIntervalSwitch)
        })
        this.frameElement = document.querySelector('iframe#mainmapframe') || document.querySelector('iframe');



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
        this.inactivityThresholdMs = Number.isFinite(this.cfg?.restMinMs)
            ? this.cfg.restMinMs
            : (Number.isFinite(this.cfg?.pauseMinMs) ? this.cfg.pauseMinMs : 10 * 60 * 1000);
        this.vehicle = window.vehicles?.find(
            (element) => element.imei == (imei || window?.vehicles[0].imei)
        );
        this.baseUrl = "/dashboard/history";
        // Safely initialize time range controls (may not be present yet)
        const controlsEl = document.querySelector('#path_chart_controls');
        const inputs = controlsEl?.querySelectorAll('input[type="datetime-local"]') || [];
        [this.fromInput, this.toInput] = [inputs?.[0], inputs?.[1]];
        if (!this.fromInput && this.customFromInput) this.fromInput = this.customFromInput;
        if (!this.toInput && this.customToInput) this.toInput = this.customToInput;

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
        this._syncCustomInputs(this.from, this.to);

        this.dataDensity = 1000;
        this.scrubber = scrubber;
        this.drawPath = this.drawPath.bind(this)
        this.loadShit = this.loadShit.bind(this)
        this.history = Array.isArray(history)
            ? [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            : [];
        this.rewindMarker = null;
        this.map = this._resolveMap ? this._resolveMap() : null;
        // dynamic ids for per-vehicle route layers/sources
        this._routeIds = { src: null, layer: null, casing: null };
        this._routeFilterKey = null;
        this._lastMarkerIndex = null;
        this._pendingNormalized = 0;
        this._updateScheduled = false;
        this._flyTimeout = null;
        this._skipNextFocus = false;
        this._fitAfterRender = false;
        this._lastFilteredEvents = [];
        this._renderHistory = [];
        this._intervalCache = new Map();
        this._activeLayerListeners = [];
        this._noHistoryNotified = false;
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
        this.loadPath = this.loadPath ? this.loadPath.bind(this) : null;
        this.unloadPath = this.unloadPath ? this.unloadPath.bind(this) : null;

        this.init();
        try { this.applyIntervalButton?.addEventListener('click', this.handleApplyInterval); } catch { }
        this._bindScrubberVisibility();
        try { scrubber?.target?.addEventListener('scrubber:change', this.update); } catch { }


    }

    handleIntervalSwitch(ev) {
        let intervalType = ev.currentTarget.dataset.action;
        this.intervalType = intervalType || this.intervalType;
        var olactions = ['route@trip', 'route@custom'];
        if (olactions.includes(intervalType)) {
            this.floater?.classList?.remove('hidden');
        }
        switch (intervalType) {
            case 'route@trip':
                document.querySelector('#rewind_type_menu').querySelector('.feature[data-tab="tab_routes"]').click();
                this.loadTrips().then((data, err) => {
                    //Remove blurring from table;                     
                })
            break; 

            case 'route@custom':
                document.querySelector('#rewind_type_menu').querySelector('.feature[data-tab="tab_fromto"]').click();
                break; 

            case 'route@today': {
                const range = this._computeTodayRange();
                this._syncCustomInputs(range.from, range.to);
                break;
            }
        }
    }

    _resolveMap() {
        try {
            const frame = document.querySelector('iframe');
            return frame?.contentWindow?.__trucklyMap || this.map || null;
        } catch {
            return this.map || null;
        }
    }

    _getTooltipEntry() {
        try {
            const frame = this.frameElement || document.querySelector('iframe#mainmapframe') || document.querySelector('iframe');
            const store = frame?.contentWindow?.__tooltipStore || window.__tooltipStore;
            if (!store || typeof store.get !== 'function') return null;
            return store.get(this.imei) || null;
        } catch {
            return null;
        }
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
            this.map = this._resolveMap();
            this._setMapLoading(false);

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
        this.map = this._resolveMap();
    }

    loadShit() {
        // lazy-load paths only via loadPath()

    }

    _normalizeBound(value, fallback) {
        if (Number.isFinite(value)) return value;
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
        if (Number.isFinite(fallback)) return fallback;
        return null;
    }

    _formatCoordinate(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num.toFixed(5) : "-";
    }

    _setLoadingOverlay(visible) {
        if (!this.dataLoadingOverlay || !this.dataLoadingOverlay.classList) return;
        this.dataLoadingOverlay.classList.toggle('hidden', !visible);
    }

    _setMainMapOverlay(visible, vehicle = null) {
        try {
            const el = document.querySelector('#main_map_overlay');
            if (!el || !el.classList) return;
            const title = el.querySelector('h1');
            if (visible && vehicle && title) {
                const name = this._getDisplayName(vehicle);
                title.textContent = name ? `Carico lo storico di "${name}"` : this._mainMapOverlayDefaultText;
            } else if (title) {
                title.textContent = this._mainMapOverlayDefaultText;
            }
            el.classList.toggle('hidden', !visible);
        } catch { }
    }

    _bindScrubberVisibility() {
        if (!this.intervalPicker || typeof MutationObserver !== 'function') return;
        // Initial sync
        this._handleScrubberVisibility(!this.intervalPicker.classList.contains('oos'));
        try {
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.type === 'attributes' && m.attributeName === 'class') {
                        const visible = !this.intervalPicker.classList.contains('oos');
                        this._handleScrubberVisibility(visible);
                    }
                }
            });
            observer.observe(this.intervalPicker, { attributes: true, attributeFilter: ['class'] });
        } catch (err) {
            console.warn('[RewindManager] scrubber visibility observer failed', err);
        }
    }

    _handleScrubberVisibility(isVisible) {
        const map = this.map?.map || this.map;
        if (!isVisible) {
            // Hide path when UI is hidden to avoid lingering graphics
            this.clearMap({ keepVehicleMarker: true });
            return;
        }
        const hasHistory = Array.isArray(this._renderHistory) && this._renderHistory.length;
        if (!hasHistory) return;
        const hasLayer =
            !!(map &&
                typeof map.getLayer === 'function' &&
                this._routeIds?.layer &&
                map.getLayer(this._routeIds.layer));
        if (hasLayer) return;
        this.history = this._renderHistory;
        this._fitAfterRender = true;
        this._skipNextFocus = true;
        this._renderAll();
        this._skipNextFocus = true;
        this.update(1);
    }

    _fitRouteBounds(history = []) {
        const map = this.map?.map || this.map;
        if (!map || !Array.isArray(history) || !history.length) return;
        const points = history
            .map((p) => {
                const lon = Number(p?.gps?.Longitude);
                const lat = Number(p?.gps?.Latitude);
                return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
            })
            .filter(Boolean);

        if (!points.length) return;
        try {
            if (points.length === 1 && typeof map.easeTo === 'function') {
                map.easeTo({ center: points[0], zoom: Math.min(14, map.getZoom ? map.getZoom() || 14 : 14) });
            } else if (points.length > 1 && typeof map.fitBounds === 'function') {
                const lons = points.map(p => p[0]);
                const lats = points.map(p => p[1]);
                const sw = [Math.min(...lons), Math.min(...lats)];
                const ne = [Math.max(...lons), Math.max(...lats)];
                if (Number.isFinite(sw[0]) && Number.isFinite(sw[1]) && Number.isFinite(ne[0]) && Number.isFinite(ne[1])) {
                    map.fitBounds([sw, ne], { padding: 60, maxZoom: 14 });
                }
            }
        } catch (err) {
            console.warn('[RewindManager] fitBounds skipped due to invalid bounds', err);
        }
    }

    _syncCustomInputs(fromMs, toMs) {
        if (!this.customFromInput || !this.customToInput) return;
        if (Number.isFinite(fromMs)) this.customFromInput.value = new Date(fromMs).toISOString().slice(0, 16);
        if (Number.isFinite(toMs)) this.customToInput.value = new Date(toMs).toISOString().slice(0, 16);
    }

    _computeTodayRange() {
        const nowDate = new Date();
        const now = nowDate.getTime();
        const dayMs = 86_400_000;
        const offsetMs = nowDate.getTimezoneOffset() * 60 * 1000;
        const from = now - (now % dayMs) + offsetMs - dayMs;
        const to = now + (86_400_400 - (now % dayMs)) + offsetMs;
        return { from, to };
    }

    _readCustomRange() {
        const fromVal = this.customFromInput?.value || this.fromInput?.value;
        const toVal = this.customToInput?.value || this.toInput?.value;
        const fromMs = Date.parse(fromVal);
        const toMs = Date.parse(toVal);
        if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
            return null;
        }
        return { from: fromMs, to: toMs };
    }

    _getDataManager() {
        try {
            if (window.dataManager && typeof window.dataManager.getHistory === 'function') return window.dataManager;
            if (window.DM && typeof window.DM.getHistory === 'function') return window.DM;
        } catch { }
        return null;
    }

    _resolveVehicle(imei = null) {
        const targetImei = imei || this.imei;
        if (!targetImei) return this.vehicle || null;
        const v = Array.isArray(window.vehicles) ? window.vehicles.find((veh) => veh.imei == targetImei) : null;
        if (v) this.vehicle = v;
        return this.vehicle || v || null;
    }

    _getDisplayName(candidate = null) {
        if (candidate && typeof candidate === 'string') return candidate;
        const veh = candidate || this.vehicle || this._resolveVehicle() || {};
        return veh.nickname || veh.name || veh?.plate?.v || veh?.plate || veh?.imei || this.imei || '';
    }

    async handleApplyInterval(ev) {
        try { ev?.preventDefault?.(); } catch { }
        this._setLoadingOverlay(true);
        const veh = this._resolveVehicle();
        this._setMainMapOverlay(true, veh);
        try {
            const interval = this.intervalType || 'route@today';
            if (interval === 'route@trip') {
                window.notify?.('info', 'Seleziona un viaggio', 'La selezione dei viaggi sarà disponibile a breve.');
                return;
            }

            const range = interval === 'route@custom' ? this._readCustomRange() : this._computeTodayRange();
            if (!range) {
                window.notify?.('bad', 'Intervallo non valido', 'Controlla i campi data/ora.');
                return;
            }
            this._syncCustomInputs(range.from, range.to);
            await this._loadRange(range.from, range.to);
        } finally {
            this._setLoadingOverlay(false);
            this._setMainMapOverlay(false);
        }
    }

    async _loadRange(fromMs, toMs) {
        if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return;
        this.from = fromMs;
        this.to = toMs;

        let history = Array.isArray(this.history) ? this.history : [];
        const dm = this._getDataManager();
        if (dm && typeof dm.getHistory === 'function' && this.imei) {
            try {
                const res = await dm.getHistory(this.imei, fromMs, toMs);
                if (Array.isArray(res?.raw)) {
                    history = res.raw;
                }
            } catch (err) {
                console.error('[RewindManager] failed to retrieve history for range', err);
            }
        }
        this.history = Array.isArray(history) ? history : [];
        try {
            await this.loadPath(this.history, fromMs, toMs, { imei: this.imei });
        } catch (err) {
            console.error('[RewindManager] unable to load path for range', err);
        }
    }

    _syncHistoricalTooltip(entry, point, vehicle) {
        try {
            if (!entry || !point) return;
            const nodes = entry.nodes || {};
            const gps = point.gps || {};
            const io = point.io || {};
            const ts = point.timestamp || gps.timestamp || io.timestamp;
            const fuel = typeof resolveFuelMetrics === 'function' ? resolveFuelMetrics(io) : { liters: null, percent: null, capacity: null };

            if (nodes.updatedAt) nodes.updatedAt.textContent = this.formatDate(ts || Date.now());
            if (nodes.lat) nodes.lat.textContent = this._formatCoordinate(gps.Latitude);
            if (nodes.lng) nodes.lng.textContent = this._formatCoordinate(gps.Longitude);
            if (nodes.speed) nodes.speed.textContent = `${Number(gps.Speed || 0).toFixed(1)} km/h`;
            if (nodes.fuelValue) nodes.fuelValue.textContent = Number.isFinite(fuel.liters) ? `${fuel.liters.toFixed(1)} L` : "-";
            if (nodes.fuelCapacity) nodes.fuelCapacity.textContent = Number.isFinite(fuel.capacity) ? ` / ${fuel.capacity.toFixed(1)} L` : "";
            if (nodes.fuelPercent) nodes.fuelPercent.textContent = Number.isFinite(fuel.percent) ? `${(fuel.percent * 100).toFixed(1)}%` : "";
            if (nodes.driver) nodes.driver.textContent = io.driver1Id || "-";
            if (nodes.driverStatus) nodes.driverStatus.textContent = (io.driver1WorkingState ?? "-");
            const root = entry.root || entry.element || null;
            if (root?.dataset) root.dataset.rewindTs = ts || '';
        } catch { }
    }

    async loadPath(imeiOrHistory, from, to, options = {}) {
        try {
            // Signature flexibility:
            // - loadPath(historyArray, { from, to, imei })
            // - loadPath(imei, from, to, { history })
            let history = Array.isArray(imeiOrHistory) ? imeiOrHistory : options.history;
            const providedImei = Array.isArray(imeiOrHistory) ? options.imei : imeiOrHistory;
            if (providedImei) {
                this.imei = providedImei;
                this.vehicle = this._resolveVehicle(providedImei);
            }
            const veh = this._resolveVehicle();
            this._setMainMapOverlay(true, veh);

            this.map = this._resolveMap();
            if (!this.map) {
                console.warn('[RewindManager] main map not available');
                return;
            }

            const fromMs = this._normalizeBound(from, this.from);
            const toMs = this._normalizeBound(to, this.to);
            const hasArgsRange = Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs < toMs;

            // If no history was supplied, use the existing one
            if (!Array.isArray(history) || !history.length) {
                history = this.history;
            }

            if (Array.isArray(history)) {
                history = [...history].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            }
            history = this._pruneInactivity(history);

            // Derive range from history when not explicitly provided
            if (!hasArgsRange && Array.isArray(history) && history.length) {
                const firstTs = Number(new Date(history[0]?.timestamp).getTime());
                const lastTs = Number(new Date(history[history.length - 1]?.timestamp).getTime());
                if (Number.isFinite(firstTs) && Number.isFinite(lastTs)) {
                    this.from = Math.min(firstTs, lastTs);
                    this.to = Math.max(firstTs, lastTs);
                }
            } else if (hasArgsRange) {
                this.from = fromMs;
                this.to = toMs;
            }

            if (!Array.isArray(history) || !history.length) {
                console.warn('[RewindManager] loadPath called without history; nothing to render.');
                return;
            }

            this._setHistory(history);
            this._renderHistory = history;
            this._noHistoryNotified = false;
            this._fitAfterRender = true;
            this._skipNextFocus = true;
            await new Promise((resolve) => this._waitMapReady(resolve));
            this._renderAll();
            this._skipNextFocus = true;
            this.update(1);
        } finally {
            this._setMainMapOverlay(false);
        }
    }

    unloadPath() {
        this.clearMap({ keepVehicleMarker: false });
        this._renderHistory = [];
        this.history = [];
        this._routeFeaturesFull = [];
        try {
            const frameWin = this.frameElement?.contentWindow || window;
            try { if (frameWin) frameWin.__rewindActiveImei = null; } catch { }
            const cache = frameWin?.__lastAvlByImei;
            const cached = cache instanceof Map ? cache.get(this.imei) : null;
            const markerCache = frameWin?.__trucklyMap?.__rewindMarkerCache instanceof Map
                ? frameWin.__trucklyMap.__rewindMarkerCache.get(this.imei)
                : null;
            const gps = cached?.data?.gps || markerCache?.device?.data?.gps || markerCache?.device?.gps || markerCache?.gps;
            const io = cached?.data?.io || markerCache?.device?.data?.io || markerCache?.device?.io || markerCache?.io;
            const lng = Number.isFinite(gps?.Longitude) ? gps.Longitude : markerCache?.lng;
            const lat = Number.isFinite(gps?.Latitude) ? gps.Latitude : markerCache?.lat;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                const mapInstance = this._resolveMap();
                const vehicle = markerCache?.vehicle || window.vehicles?.find(v => v.imei == this.imei) || this.vehicle;
                const status = this.getVehicleState(gps?.Speed, io?.ignition).class;
                let tooltipNode = null;
                try {
                    const store = frameWin?.__tooltipStore;
                    const entry = store?.get ? store.get(this.imei) : null;
                    const payload = cached || markerCache?.device || markerCache;
                    if (entry && typeof frameWin?.updateTooltipEntry === 'function' && payload) {
                        frameWin.updateTooltipEntry(entry, {
                            imei: this.imei,
                            device: payload,
                            vehicle,
                            status,
                            fuelSummary: frameWin.computeFuelSummary ? frameWin.computeFuelSummary(io || {}, vehicle || {}) : null,
                        });
                    }
                    tooltipNode = entry?.root || entry || null;
                } catch { }
                const marker = mapInstance?.addOrUpdateMarker?.({
                    id: this.imei,
                    lng,
                    lat,
                    tooltip: tooltipNode,
                    vehicle,
                    device: cached || markerCache?.device || markerCache,
                    status,
                    html: null,
                    hasPopup: Boolean(tooltipNode),
                });
                try { mapInstance?.resetClusterState?.({ animate: false }); } catch { }
                try { mapInstance?.updateClusters?.(); } catch { }
                try { mapInstance?.focusMarker?.(marker, { openPopup: false }); } catch { }
            }
        } catch { }
    }

    // History fetching is intentionally omitted; history must be provided by callers.

    async retrieveEvents({ from, to, force = false } = {}) {
        const fromMs = this._normalizeBound(from, this.from);
        const toMs = this._normalizeBound(to, this.to);

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

    async getHistory({ from, to } = {}) {
        const fromMs = this._normalizeBound(from, this.from);
        const toMs = this._normalizeBound(to, this.to);
        if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return this.history || [];
        return (this.history || []).filter((item) => {
            const ts = Number(new Date(item?.timestamp).getTime());
            return Number.isFinite(ts) ? (ts >= fromMs && ts <= toMs) : false;
        });
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

    _isInactivePoint(point) {
        if (!point) return false;
        const speed = Number(point?.gps?.Speed ?? point?.io?.speed ?? point?.io?.vehicleSpeed ?? 0);
        const ignition = Number(point?.io?.ignition ?? point?.io?.ignitionState ?? point?.io?.engine ?? 0);
        return speed < 5 && ignition === 0;
    }

    _segmentDuration(segment = []) {
        if (!Array.isArray(segment) || segment.length < 2) return 0;
        const first = Number(new Date(segment[0]?.timestamp).getTime());
        const last = Number(new Date(segment[segment.length - 1]?.timestamp).getTime());
        if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
        return Math.abs(last - first);
    }

    _pruneInactivity(history = []) {
        if (!Array.isArray(history) || history.length < 3) return history || [];
        const output = [];
        let buffer = [];
        const flush = () => {
            if (!buffer.length) return;
            const duration = this._segmentDuration(buffer);
            if (buffer.length > 2 && duration >= this.inactivityThresholdMs && buffer.every((p) => this._isInactivePoint(p))) {
                output.push(buffer[0], buffer[buffer.length - 1]);
            } else {
                output.push(...buffer);
            }
            buffer = [];
        };

        history.forEach((point) => {
            if (this._isInactivePoint(point)) {
                buffer.push(point);
            } else {
                flush();
                output.push(point);
            }
        });
        flush();
        return output;
    }

    _findNeighbor(history, idx, direction = 1) {
        if (!Array.isArray(history)) return null;
        for (let i = idx + direction; i >= 0 && i < history.length; i += direction) {
            const candidate = history[i];
            if (candidate?.gps && Number.isFinite(candidate.gps.Longitude) && Number.isFinite(candidate.gps.Latitude)) {
                return candidate;
            }
        }
        return null;
    }

    _computeBearing(fromGps = {}, toGps = {}) {
        const lat1 = Number(fromGps.Latitude);
        const lon1 = Number(fromGps.Longitude);
        const lat2 = Number(toGps.Latitude);
        const lon2 = Number(toGps.Longitude);
        if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
        const toRad = (deg) => deg * (Math.PI / 180);
        const dLon = toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
        const brng = Math.atan2(y, x);
        const deg = (brng * 180) / Math.PI;
        return (deg + 360) % 360;
    }

    _resolveHeading(history = [], idx = 0) {
        const current = Array.isArray(history) ? history[idx] : null;
        const angle = Number(current?.gps?.Angle);
        if (Number.isFinite(angle)) return angle;
        const next = this._findNeighbor(history, idx, 1);
        const prev = this._findNeighbor(history, idx, -1);
        const bearing = this._computeBearing(prev?.gps || current?.gps, next?.gps || current?.gps);
        return Number.isFinite(bearing) ? bearing : 0;
    }

    _setMarkerHeading(marker, heading) {
        if (!marker || !Number.isFinite(heading)) return;
        const el = typeof marker.getElement === 'function' ? marker.getElement() : marker._element;
        if (!el) return;
        el.querySelectorAll('[data-role="marker-arrow"]').forEach((node) => {
            node.style.transform = `rotate(${heading}deg)`;
        });
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
        const totalPoints = Array.isArray(baseHistory) ? baseHistory.length : 0;
        if (totalPoints === 0) {
            if (!this._noHistoryNotified) {
                window.notify('bad', "Nessuno storico", "Non ho uno storico valido da mostrare per questo veicolo in questo intervallo, il dispositivo potrebbe essere offline!")
                this._noHistoryNotified = true;
            }
            return;
        }
        this._noHistoryNotified = false;

        const clamped = Math.min(Math.max(normalized, 0), 1);
        const position = Math.min(totalPoints - 1, Math.max(0, Math.floor(clamped * (totalPoints - 1))));

        if (position === this._lastMarkerIndex && this._routeFilterKey !== null) {
            return;
        }

        const point = baseHistory[position];
        if (!point || !point.gps) return;
        const vehicle = window.vehicles.find(element => element.imei == this.imei);

        const status = this.getVehicleState(point.gps.Speed, point.io?.ignition).class;
        const heading = this._resolveHeading(baseHistory, position);
        const tooltip = this.buildToolTip(point, vehicle);
        const historyDevice = {
            gps: { ...(point.gps || {}), Angle: heading },
            io: point.io || {},
            timestamp: point.timestamp,
            data: {
                gps: { ...(point.gps || {}), Angle: heading },
                io: point.io || {},
                timestamp: point.timestamp
            }
        };

        const marker = this.map.addOrUpdateMarker({
            id: this.imei,
            lng: point.gps.Longitude,
            lat: point.gps.Latitude,
            tooltip,
            vehicle,
            device: historyDevice,
            status,
            html: null,
            hasPopup: Boolean(tooltip),

        })
        this._setMarkerHeading(marker, heading);
        if (!tooltip) {
            try {
                const popup = typeof marker?.getPopup === 'function' ? marker.getPopup() : null;
                popup?.remove?.();
            } catch { }
        }

        var classes = ["success", "danger", "warning"];

        classes.map((c) => {
            marker._element.classList.remove(c)
        })
        marker._element.classList.add(status);

        if (!this._skipNextFocus) {
            try { clearTimeout(this._flyTimeout); } catch { }
            this._flyTimeout = setTimeout(() => {
                try {
                    if (typeof this.map?.focusMarker === 'function') {
                        this.map.focusMarker(marker, { openPopup: false });
                    }
                } catch { }
            }, 150);
        } else {
            this._skipNextFocus = false;
        }

        // Trim the visible path to follow the marker (progressive reveal)

        try {
            const map = this.map && (this.map.map || this.map);
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
        const map = this.map?.map || this.map;
        if (!map) return;
        const run = () => { try { cb(); } catch (e) { console.error(e); } };
        if (map.isStyleLoaded && map.isStyleLoaded()) return run();
        map.once?.('load', run);
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

    buildToolTip(point, vehicle) {
        const entry = this._getTooltipEntry();
        if (entry) {
            this._syncHistoricalTooltip(entry, point, vehicle);
            return entry.root || entry;
        }
        return null;
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

    _detachLayerListeners() {
        const map = this.map?.map || this.map;
        if (!map || !Array.isArray(this._activeLayerListeners)) return;
        this._activeLayerListeners.forEach(({ type, layer, handler }) => {
            try { map.off?.(type, layer, handler); } catch { }
        });
        this._activeLayerListeners = [];
    }

    _attachLayerListeners(layerId, history) {
        const map = this.map?.map || this.map;
        if (!map || !map.on || !layerId) return;

        const moveHandler = (e) => {
            map.getCanvas().style.cursor = "pointer";
            const feature = e.features?.[0];
            if (!feature) return;

            const idx = feature.properties.index;
            if (typeof idx !== 'number' || idx < 0 || idx >= history.length) return;
            const point = history[idx];
            if (!point || !point.gps) return;
            const vehicle = this.vehicle;
            const tooltipContent = this.buildToolTip(point, vehicle);

            if (this._popup) this._popup.remove();
            this._popup = new window.maplibregl.Popup({
                offset: 10,
                closeButton: false,
                className: "tooltip-dark",
            }).setLngLat(e.lngLat);
            if (tooltipContent instanceof HTMLElement) {
                this._popup.setDOMContent(tooltipContent.cloneNode(true));
            } else {
                this._popup.setHTML(tooltipContent || '');
            }
            this._popup.addTo(map);
        };

        const leaveHandler = () => {
            map.getCanvas().style.cursor = "";
            if (this._popup) this._popup.remove();
        };

        try { map.on("mousemove", layerId, moveHandler); } catch { }
        try { map.on("mouseleave", layerId, leaveHandler); } catch { }

        this._activeLayerListeners = [
            { type: "mousemove", layer: layerId, handler: moveHandler },
            { type: "mouseleave", layer: layerId, handler: leaveHandler },
        ];
    }
    drawPath(history = []) {
        const effectiveHistory = Array.isArray(history) && history.length ? history : this.history;
        if (!Array.isArray(effectiveHistory) || !effectiveHistory.length) {
            console.warn("Nessuna history disponibile per il drawPath");
            this.addStartStopMarkers([]);
            return;
        }
        this._noHistoryNotified = false;
        this.addStartStopMarkers(effectiveHistory);

        const map = this.map?.map || this.map;
        if (!map) return;
        this._routeFilterKey = null;
        this._lastMarkerIndex = null;

        const old = this._routeIds || {};
        const removeLayerIf = (id) => { try { if (id && map.getLayer && map.getLayer(id)) map.removeLayer(id); } catch (e) { /*noop*/ } };
        const removeSourceIf = (id) => { try { if (id && map.getSource && map.getSource(id)) map.removeSource(id); } catch (e) { /*noop*/ } };
        this._detachLayerListeners?.();
        [old.layer, old.casing].forEach(removeLayerIf);
        [old.src].forEach(removeSourceIf);

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

            if (!Number.isFinite(a.gps.Longitude) || !Number.isFinite(a.gps.Latitude) || !Number.isFinite(b.gps.Longitude) || !Number.isFinite(b.gps.Latitude)) {
                continue;
            }

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
        if (!features.length) {
            console.warn('[RewindManager] No valid GPS segments to draw.');
            return;
        }

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
        const points = effectiveHistory
            .map((p) => {
                const lon = Number(p?.gps?.Longitude);
                const lat = Number(p?.gps?.Latitude);
                return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
            })
            .filter(Boolean);

        try {
            if (points.length === 1 && typeof map.easeTo === 'function') {
                map.easeTo({ center: points[0], zoom: Math.min(14, map.getZoom ? map.getZoom() || 14 : 14) });
            } else if (points.length > 1 && typeof map.fitBounds === 'function') {
                const lons = points.map(p => p[0]);
                const lats = points.map(p => p[1]);
                const sw = [Math.min(...lons), Math.min(...lats)];
                const ne = [Math.max(...lons), Math.max(...lats)];
                if (Number.isFinite(sw[0]) && Number.isFinite(sw[1]) && Number.isFinite(ne[0]) && Number.isFinite(ne[1])) {
                    map.fitBounds([sw, ne], { padding: 60, maxZoom: 14 });
                }
            }
        } catch (err) {
            console.warn('[RewindManager] fitBounds skipped due to invalid bounds', err);
        }

        this._attachLayerListeners?.(layerId, effectiveHistory);
    }
}
// Toggle map loading overlay visibility


// Update map loading overlay percentage
RewindManager.prototype._setMapProgress = function (pct) { try { const wrap = document.querySelector('.overlay.blurred.fade#mapLoad'); if (!wrap) return; const p = wrap.querySelector('p'); if (!p) return; p.textContent = 'Carico i dati: ' + pct + '%'; } catch { } };


// Clear layers, markers, popups and sidebar list
RewindManager.prototype.clearMap = function ({ keepVehicleMarker = false } = {}) {
    const map = this.map?.map || this.map;
    try { this._detachLayerListeners?.(); } catch { }
    try {
        const __ids = this._routeIds || {};
        if (__ids.layer && map?.getLayer && map.getLayer(__ids.layer)) map.removeLayer(__ids.layer);
        if (__ids.casing && map?.getLayer && map.getLayer(__ids.casing)) map.removeLayer(__ids.casing);
        if (__ids.src && map?.getSource && map.getSource(__ids.src)) map.removeSource(__ids.src);
    } catch { }
    this._wipeEventMarkers();
    try { if (this._popup) { this._popup.remove(); this._popup = null; } } catch { }
    try { if (this._previewMarker) { this._previewMarker.remove(); this._previewMarker = null; } } catch { }
    if (!keepVehicleMarker) {
        try { this.map?.removeMarker?.(this.imei); } catch { }
    }
    try { this.map?.removeMarker?.(`${this.imei}_startpoint`); } catch { }
    try { this.map?.removeMarker?.(`${this.imei}_endpoint`); } catch { }
    this._routeFilterKey = null;
    this._lastMarkerIndex = null;
    this._routeFeaturesFull = [];
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
    try { this.unloadPath?.(); } catch { this.clearMap(); }
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
    // Caller must supply history after switching.
};

// Render pipeline for current this.history
RewindManager.prototype._renderAll = function () {
    try { this.map = this._resolveMap ? this._resolveMap() : this.map; } catch { }
    const effectiveHistory = this.history;
    this._renderHistory = effectiveHistory;

    if (!Array.isArray(effectiveHistory) || !effectiveHistory.length) {
        this.addStartStopMarkers([]);
        this.clearMap({ keepVehicleMarker: true });
        if (!this._noHistoryNotified) {
            window.notify('bad', "Nessuno storico", "Non ho uno storico valido da mostrare per questo veicolo in questo intervallo, il dispositivo potrebbe essere offline!")
            this._noHistoryNotified = true;
        }
        return;
    }
    this._noHistoryNotified = false;

    if (Array.isArray(effectiveHistory) && effectiveHistory.length && this.map) {
        this.map.history = effectiveHistory;
        if (typeof this.retrieveEvents === 'function') {
            this.retrieveEvents({ from: this.from, to: this.to });
        }
    }
    this.drawPath(effectiveHistory);
    if (this._fitAfterRender) {
        this._fitRouteBounds(effectiveHistory);
        this._fitAfterRender = false;
    }
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
    this.from = newFrom;
    this.to = newTo;
    // History must be provided externally; nothing to fetch here.
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
