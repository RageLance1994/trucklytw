/* TrucklyMap: MapLibre manager with clustering, popups, and search */
"use client";

import maplibregl, { Map as MlMap, Marker, Popup } from "maplibre-gl";

export type TrucklyMarkerInput = {
  id: string;
  lng: number;
  lat: number;
  vehicle?: any;
  device?: any;
  status?: "success" | "warning" | "danger" | string;
  angle?: number;
  html?: string;
  tooltip?: string | HTMLElement;
  hasPopup?: boolean;
  classlist?: string;
};

type ClusterMeta = {
  index: number;
  count: number;
};

type ClusterBucket = {
  center: [number, number];
  members: ManagedMarker[];
};

type ManagedMarker = Marker & {
  _element?: HTMLElement;
  _usesDefaultTemplate?: boolean;
  _clusterMeta?: ClusterMeta;
  _clusterMembers?: ManagedMarker[];
  _clusterHandlers?: { type: string; handler: (ev: Event) => void }[] | null;
  _clusterPopup?: Popup | null;
  _isClusterLeader?: boolean;
  _customClassList?: string | null;
  _baseHTML?: string;
  _defaultHTML?: string;
  _lat?: number;
  _lng?: number;
  vehicle?: any;
  device?: any;
  status?: string;
};

export type TrucklyMapOptions = {
  container: string | HTMLElement;
  styleUrl?: string;
  center?: [number, number];
  zoom?: number;
  theme?: "light" | "dark";
  onMarkerSelect?: (marker: ManagedMarker) => void;
};

const MAX_ZOOM = 15;
const MAX_MAP_ZOOM = 19;
const CLUSTER_MIN_ZOOM = 12;
const CLUSTER_BASE_KM = 0.4;
const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const escapeRegex = (value = "") => value.replace(REGEX_ESCAPE, "\\$&");

export class TrucklyMap {
  map: MlMap;
  markers: Map<string, ManagedMarker> = new Map();
  _routeLayers: Map<string, { sourceId: string; layerId: string; casingId: string }> =
    new Map();
  _clusterUpdateScheduled = false;
  _clusterUpdateFrame: number | null = null;
  _clusters: ClusterBucket[] = [];
  _handleThemeChange?: () => void;
  _activeClusterPopup: Popup | null = null;
  hoveringMarker = false;
  onMarkerSelect?: (marker: ManagedMarker) => void;
  _lastMarkerCollapseValue: "true" | "false" | null = null;
  _hiddenMarkers: Set<string> = new Set();
  _geofenceLayers: Map<
    string,
    { sourceId: string; fillId: string; outlineId: string; outlineHaloId: string }
  > = new Map();
  _geofenceState: {
    active: boolean;
    imei: string | null;
    center: { lng: number; lat: number } | null;
    onClick?: (ev: any) => void;
    onMove?: (ev: any) => void;
    raySourceId?: string;
    rayLayerId?: string;
    previewSourceId?: string;
    previewFillId?: string;
    previewOutlineId?: string;
  } = {
    active: false,
    imei: null,
    center: null,
  };

  styles = {
    base: "/maps/style.json",
    dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    satellite: {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Source: Esri, Maxar, Earthstar Geographics",
        },
      },
      layers: [{ id: "satellite", type: "raster", source: "satellite" }],
    },
  };

  constructor(opts: TrucklyMapOptions) {
    const {
      container,
      styleUrl = "/maps/style.json",
      center = [12.4964, 41.9028],
      zoom = 6,
      theme = "dark",
      onMarkerSelect,
    } = opts;

    this.onMarkerSelect = onMarkerSelect;

    const themeStyle = this._resolveTheme(theme) === "light"
      ? this.styles.light
      : this.styles.dark;

    this.map = new maplibregl.Map({
      container,
      style: styleUrl || themeStyle,
      center,
      zoom,
      maxZoom: MAX_MAP_ZOOM,
      attributionControl: false,
    });

    this.map.on("zoom", () => {
      this._updateMarkerCollapseState();
      this._scheduleUpdateClusters();
    });

    this.map.on("moveend", () => {
      this._updateMarkerCollapseState(true);
      this._scheduleUpdateClusters({ force: true });
    });
  }

  destroy() {
    this.stopGeofence();
    this.clearRoute();
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    this.map?.remove();
  }

  setBaseStyle(mode: "base" | "light" | "dark" | "satellite") {
    const style = mode === "satellite" ? this.styles.satellite : this.styles[mode];
    this.map.setStyle(style as any);
  }

  _buildCirclePolygon(center: { lng: number; lat: number }, radiusMeters: number, steps = 64) {
    const coords = [];
    const latFactor = 1 / 111320;
    const lonFactor = 1 / (111320 * Math.cos((center.lat * Math.PI) / 180));
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const dx = Math.cos(angle) * radiusMeters * lonFactor;
      const dy = Math.sin(angle) * radiusMeters * latFactor;
      coords.push([center.lng + dx, center.lat + dy]);
    }
    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [coords] },
      properties: {},
    };
  }

  startGeofence(imei: string) {
    if (!imei) return;
    this.stopGeofence();
    this.closeOtherPopups(null);
    this._setMarkersDimmed(true);
    this._geofenceState = {
      active: true,
      imei,
      center: null,
    };
    const map = this.map;
    map.getCanvas().style.cursor = "crosshair";

    const handleClick = (ev: any) => {
      const lngLat = ev?.lngLat;
      if (!lngLat) return;
      if (!this._geofenceState.center) {
        this._geofenceState.center = { lng: lngLat.lng, lat: lngLat.lat };
        const raySourceId = `geofence-ray-${imei}`;
        const rayLayerId = `geofence-ray-layer-${imei}`;
        const previewSourceId = `geofence-preview-${imei}`;
        const previewFillId = `geofence-preview-fill-${imei}`;
        const previewOutlineId = `geofence-preview-outline-${imei}`;
        this._geofenceState.raySourceId = raySourceId;
        this._geofenceState.rayLayerId = rayLayerId;
        this._geofenceState.previewSourceId = previewSourceId;
        this._geofenceState.previewFillId = previewFillId;
        this._geofenceState.previewOutlineId = previewOutlineId;

        try {
          map.addSource(raySourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [lngLat.lng, lngLat.lat],
                  [lngLat.lng, lngLat.lat],
                ],
              },
              properties: {},
            },
          });
          map.addLayer({
            id: `${rayLayerId}-halo`,
            type: "line",
            source: raySourceId,
            paint: {
              "line-color": "#000000",
              "line-width": 4,
              "line-dasharray": [2, 2],
              "line-opacity": 0.5,
            },
          });
          map.addLayer({
            id: rayLayerId,
            type: "line",
            source: raySourceId,
            paint: {
              "line-color": "#0b1d2a",
              "line-width": 2,
              "line-dasharray": [2, 2],
              "line-opacity": 0.9,
            },
          });
        } catch {}

        try {
          map.addSource(previewSourceId, {
            type: "geojson",
            data: this._buildCirclePolygon(
              { lng: lngLat.lng, lat: lngLat.lat },
              50,
            ),
          });
          map.addLayer({
            id: previewFillId,
            type: "fill",
            source: previewSourceId,
            paint: {
              "fill-color": "#0b1d2a",
              "fill-opacity": 0.16,
            },
          });
          map.addLayer({
            id: `${previewOutlineId}-halo`,
            type: "line",
            source: previewSourceId,
            paint: {
              "line-color": "#000000",
              "line-width": 4,
              "line-opacity": 0.5,
            },
          });
          map.addLayer({
            id: previewOutlineId,
            type: "line",
            source: previewSourceId,
            paint: {
              "line-color": "#0b1d2a",
              "line-width": 2,
              "line-dasharray": [4, 4],
              "line-opacity": 0.95,
            },
          });
        } catch {}

        return;
      }

      const center = this._geofenceState.center;
      const radiusMeters = this.distanceKm(
        [center.lat, center.lng],
        [lngLat.lat, lngLat.lng],
      ) * 1000;
      const feature = this._buildCirclePolygon(center, Math.max(50, radiusMeters));
      const id = `geofence-${imei}-${Date.now()}`;
      const sourceId = `${id}-src`;
      const layerId = `${id}-layer`;

      try {
        map.addSource(sourceId, {
          type: "geojson",
          data: feature,
        });
        map.addLayer({
          id: layerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": "#0b1d2a",
            "fill-opacity": 0.18,
          },
        });
        map.addLayer({
          id: `${layerId}-outline-halo`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#000000",
            "line-width": 4,
            "line-opacity": 0.55,
          },
        });
        map.addLayer({
          id: `${layerId}-outline`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#0b1d2a",
            "line-width": 2,
          },
        });
        this._geofenceLayers.set(id, {
          sourceId,
          fillId: layerId,
          outlineId: `${layerId}-outline`,
          outlineHaloId: `${layerId}-outline-halo`,
        });
      } catch {}

      try {
        window.dispatchEvent(
          new CustomEvent("truckly:geofence-created", {
            detail: {
              imei,
              center,
              radiusMeters,
              feature,
              geofenceId: id,
            },
          }),
        );
      } catch {}

      this.stopGeofence();
    };

    const handleMove = (ev: any) => {
      if (!this._geofenceState.center) return;
      const lngLat = ev?.lngLat;
      if (!lngLat) return;
      const center = this._geofenceState.center;
      const radiusMeters = this.distanceKm(
        [center.lat, center.lng],
        [lngLat.lat, lngLat.lng],
      ) * 1000;
      const raySourceId = this._geofenceState.raySourceId;
      const previewSourceId = this._geofenceState.previewSourceId;
      if (raySourceId) {
        const raySource = map.getSource(raySourceId) as any;
        raySource?.setData?.({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [center.lng, center.lat],
              [lngLat.lng, lngLat.lat],
            ],
          },
          properties: {},
        });
      }
      if (previewSourceId) {
        const previewSource = map.getSource(previewSourceId) as any;
        previewSource?.setData?.(
          this._buildCirclePolygon(center, Math.max(50, radiusMeters)),
        );
      }
    };

    this._geofenceState.onClick = handleClick;
    this._geofenceState.onMove = handleMove;
    map.on("click", handleClick);
    map.on("mousemove", handleMove);
  }

  stopGeofence() {
    if (!this._geofenceState.active) return;
    const map = this.map;
    if (this._geofenceState.onClick) {
      try {
        map.off("click", this._geofenceState.onClick);
      } catch {}
    }
    if (this._geofenceState.onMove) {
      try {
        map.off("mousemove", this._geofenceState.onMove);
      } catch {}
    }
      try {
        const rayLayerId = this._geofenceState.rayLayerId;
        const raySourceId = this._geofenceState.raySourceId;
        if (rayLayerId && map.getLayer(`${rayLayerId}-halo`)) {
          map.removeLayer(`${rayLayerId}-halo`);
        }
        if (rayLayerId && map.getLayer(rayLayerId)) map.removeLayer(rayLayerId);
        if (raySourceId && map.getSource(raySourceId)) map.removeSource(raySourceId);
      } catch {}
      try {
        const previewFillId = this._geofenceState.previewFillId;
        const previewOutlineId = this._geofenceState.previewOutlineId;
        const previewSourceId = this._geofenceState.previewSourceId;
        if (previewFillId && map.getLayer(previewFillId)) map.removeLayer(previewFillId);
        if (previewOutlineId && map.getLayer(`${previewOutlineId}-halo`)) {
          map.removeLayer(`${previewOutlineId}-halo`);
        }
        if (previewOutlineId && map.getLayer(previewOutlineId)) map.removeLayer(previewOutlineId);
        if (previewSourceId && map.getSource(previewSourceId)) map.removeSource(previewSourceId);
      } catch {}
    map.getCanvas().style.cursor = "";
    this._geofenceState = { active: false, imei: null, center: null };
    this._setMarkersDimmed(false);
  }

  createGeofence(
    imei: string,
    center: { lng: number; lat: number },
    radiusMeters: number,
    geofenceId?: string,
  ) {
    if (!imei || !center || !Number.isFinite(center.lng) || !Number.isFinite(center.lat)) {
      return null;
    }
    const safeRadius = Math.max(50, Number(radiusMeters) || 0);
    if (!Number.isFinite(safeRadius) || safeRadius <= 0) return null;
    const id = geofenceId || `geofence-${imei}-${Date.now()}`;
    if (this._geofenceLayers.has(id)) {
      this.updateGeofence(id, center, safeRadius);
      return id;
    }

    this.stopGeofence();
    this.closeOtherPopups(null);

    const map = this.map;
    const feature = this._buildCirclePolygon(center, safeRadius);
    const sourceId = `${id}-src`;
    const layerId = `${id}-layer`;

    try {
      map.addSource(sourceId, {
        type: "geojson",
        data: feature,
      });
      map.addLayer({
        id: layerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": "#0b1d2a",
          "fill-opacity": 0.18,
        },
      });
      map.addLayer({
        id: `${layerId}-outline-halo`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#000000",
          "line-width": 4,
          "line-opacity": 0.55,
        },
      });
      map.addLayer({
        id: `${layerId}-outline`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#0b1d2a",
          "line-width": 2,
        },
      });
      this._geofenceLayers.set(id, {
        sourceId,
        fillId: layerId,
        outlineId: `${layerId}-outline`,
        outlineHaloId: `${layerId}-outline-halo`,
      });
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent("truckly:geofence-created", {
          detail: {
            imei,
            center,
            radiusMeters: safeRadius,
            feature,
            geofenceId: id,
          },
        }),
      );
    } catch {}

    return id;
  }

  updateGeofence(geofenceId: string, center: { lng: number; lat: number }, radiusMeters: number) {
    if (!geofenceId) return;
    const entry = this._geofenceLayers.get(geofenceId);
    if (!entry) return;
    const map = this.map;
    const source = map.getSource(entry.sourceId) as any;
    if (!source?.setData) return;
    const feature = this._buildCirclePolygon(center, Math.max(50, radiusMeters));
    source.setData(feature);
  }

  _withStyleReady(cb: () => void) {
    const map = this.map;
    if (map.isStyleLoaded && map.isStyleLoaded()) {
      cb();
      return;
    }
    map.once?.("load", cb);
  }

  clearRoute(imei?: string) {
    const map = this.map;
    const removeOne = (routeImei: string) => {
      const ids = this._routeLayers.get(routeImei);
      if (!ids) return;
      try {
        if (map.getLayer(ids.layerId)) map.removeLayer(ids.layerId);
      } catch {}
      try {
        if (map.getLayer(ids.casingId)) map.removeLayer(ids.casingId);
      } catch {}
      try {
        if (map.getSource(ids.sourceId)) map.removeSource(ids.sourceId);
      } catch {}
      this._routeLayers.delete(routeImei);
    };

    if (imei) {
      removeOne(imei);
      return;
    }
    Array.from(this._routeLayers.keys()).forEach(removeOne);
  }

  drawRoute(imei: string, history: Array<{ gps?: any; io?: any }>) {
    if (!imei || !Array.isArray(history) || !history.length) return;
    const map = this.map;

    this._withStyleReady(() => {
      this.clearRoute(imei);

      const features = [];
      for (let i = 0; i < history.length - 1; i += 1) {
        const a = history[i];
        const b = history[i + 1];
        const aGps = a?.gps || {};
        const bGps = b?.gps || {};
        const aLon = Number(aGps.Longitude ?? aGps.longitude ?? aGps.lon);
        const aLat = Number(aGps.Latitude ?? aGps.latitude ?? aGps.lat);
        const bLon = Number(bGps.Longitude ?? bGps.longitude ?? bGps.lon);
        const bLat = Number(bGps.Latitude ?? bGps.latitude ?? bGps.lat);
        if (
          !Number.isFinite(aLon) ||
          !Number.isFinite(aLat) ||
          !Number.isFinite(bLon) ||
          !Number.isFinite(bLat)
        ) {
          continue;
        }

        const speed = Number(aGps.Speed ?? a?.io?.speed ?? 0);
        const ignition = Number(a?.io?.ignition ?? a?.io?.ignitionStatus ?? 0);
        let color = "#00ff00";
        if (speed <= 5 && ignition === 1) color = "#ffd000";
        if (speed <= 5 && ignition === 0) color = "#ff0000";

        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [aLon, aLat],
              [bLon, bLat],
            ],
          },
          properties: { color, index: i },
        });
      }

      if (!features.length) return;

      const sourceId = `route-${imei}`;
      const layerId = `route-line-${imei}`;
      const casingId = `route-casing-${imei}`;
      this._routeLayers.set(imei, { sourceId, layerId, casingId });

      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      try {
        map.addLayer({
          id: casingId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              3,
              10,
              6,
              14,
              9,
              18,
              14,
            ],
            "line-color": "#000000",
            "line-opacity": 0.25,
          },
        });
      } catch {}

      try {
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              2,
              10,
              4,
              14,
              6,
              18,
              10,
            ],
            "line-color": ["case", ["has", "color"], ["get", "color"], "#00ff00"],
            "line-opacity": 0.95,
          },
        });
      } catch {}

      const points = history
        .map((point) => {
          const gps = point?.gps || {};
          const lon = Number(gps.Longitude ?? gps.longitude ?? gps.lon);
          const lat = Number(gps.Latitude ?? gps.latitude ?? gps.lat);
          return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
        })
        .filter(Boolean) as [number, number][];

      if (points.length > 1 && typeof map.fitBounds === "function") {
        const lons = points.map((p) => p[0]);
        const lats = points.map((p) => p[1]);
        const sw = [Math.min(...lons), Math.min(...lats)];
        const ne = [Math.max(...lons), Math.max(...lats)];
        if (
          Number.isFinite(sw[0]) &&
          Number.isFinite(sw[1]) &&
          Number.isFinite(ne[0]) &&
          Number.isFinite(ne[1])
        ) {
          map.fitBounds([sw, ne], { padding: 60, maxZoom: 14 });
        }
      }
    });
  }

  setRouteProgress(imei: string, position: number) {
    const ids = this._routeLayers.get(imei);
    if (!ids) return;
    const map = this.map;
    const idx = Math.max(0, Math.floor(position));
    const filterExpr: any = ["<", ["get", "index"], idx + 1];
    try {
      if (map.getLayer(ids.layerId)) {
        map.setFilter(ids.layerId, filterExpr);
      }
      if (map.getLayer(ids.casingId)) {
        map.setFilter(ids.casingId, filterExpr);
      }
    } catch {}
  }

  updateRouteMarker(
    imei: string,
    point: { gps?: any },
    heading = 0,
    statusClass = "",
  ) {
    const marker = this.markers.get(imei);
    const gps = point?.gps || {};
    const lon = Number(gps?.Longitude ?? gps?.longitude ?? gps?.lon);
    const lat = Number(gps?.Latitude ?? gps?.latitude ?? gps?.lat);
    if (!marker || !Number.isFinite(lon) || !Number.isFinite(lat)) return;

    marker.setLngLat([lon, lat]);
    const el = marker.getElement ? marker.getElement() : marker._element;
    if (el) {
      el.querySelectorAll<HTMLElement>("[data-role='marker-arrow']").forEach((node) => {
        node.style.transform = `rotate(${heading}deg)`;
      });
      ["success", "danger", "warning"].forEach((cls) => el.classList.remove(cls));
      if (statusClass) el.classList.add(statusClass);
    }
  }

  hideOtherMarkers(activeImei: string) {
    this._hiddenMarkers.clear();
    this.markers.forEach((marker, id) => {
      if (id === activeImei) return;
      const el = marker.getElement ? marker.getElement() : marker._element;
      if (!el) return;
      if (el.style.display !== "none") {
        el.style.display = "none";
        this._hiddenMarkers.add(id);
      }
    });
  }

  showOnlyMarkers(imeis: string[]) {
    if (!Array.isArray(imeis) || imeis.length === 0) {
      this.showAllMarkers();
      return;
    }
    const allowed = new Set(imeis.map((value) => String(value)));
    this._hiddenMarkers.clear();
    this.markers.forEach((marker, id) => {
      const baseId = String(id || "");
      const normalizedId = baseId.startsWith("preview:") ? baseId.slice(8) : baseId;
      const shouldShow = allowed.has(normalizedId);
      const el = marker.getElement ? marker.getElement() : marker._element;
      if (!el) return;
      if (shouldShow) {
        el.style.display = "";
        return;
      }
      if (el.style.display !== "none") {
        el.style.display = "none";
      }
      this._hiddenMarkers.add(id);
    });
  }

  showAllMarkers() {
    this._hiddenMarkers.forEach((id) => {
      const marker = this.markers.get(id);
      const el = marker?.getElement ? marker.getElement() : marker?._element;
      if (el) el.style.display = "";
    });
    this._hiddenMarkers.clear();
  }

  _resolveTheme(preferred?: "light" | "dark") {
    if (preferred) return preferred;
    const isLight = document?.body?.classList?.contains("theme-light");
    return isLight ? "light" : "dark";
  }

  _getDefaultMarkerTemplate({ useArrow = true } = {}) {
    const directionIcon = useArrow
      ? `<svg data-role="marker-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>`
      : `<div data-role="marker-arrow" class="truckly-default-marker__arrow-dot"></div>`;
    return `
      <div class="truckly-default-marker">
        <span class="truckly-default-marker__plate" data-role="marker-plate">-</span>
        <span class="truckly-default-marker__arrow">${directionIcon}</span>
      </div>
    `;
  }

  _updateDefaultMarkerContent(element: HTMLElement | null, { vehicle, angle }: { vehicle?: any; angle?: number }) {
    if (!element) return;
    const plateNode = element.querySelector<HTMLElement>("[data-role='marker-plate']");
    if (plateNode) {
      plateNode.textContent = this._getVehiclePlateLabel(vehicle);
    }
    const rotation = Number(angle) || 0;
    element.querySelectorAll<HTMLElement>("[data-role='marker-arrow']").forEach((node) => {
      node.style.transform = `rotate(${rotation}deg)`;
    });
  }

  _getVehiclePlateLabel(vehicle: any) {
    if (!vehicle) return "-";
    return vehicle?.plate?.v ?? vehicle?.plate ?? vehicle?.nickname ?? vehicle?.name ?? "-";
  }

  _getVehicleDisplayLabel(vehicle: any) {
    if (!vehicle) return "-";
    const nickname = vehicle?.nickname ?? vehicle?.name;
    const plate = vehicle?.plate?.v ?? vehicle?.plate;
    if (nickname && plate) return `${nickname} - ${plate}`;
    return nickname || plate || "-";
  }

  _syncMarkerClasses(element: HTMLElement, { status, classlist, initial = false }: { status?: string; classlist?: string; initial?: boolean }) {
    if (!element) return;
    if (typeof classlist === "string") {
      element.className = classlist;
      return;
    }
    const stateClasses = ["success", "danger", "warning"];
    stateClasses.forEach((cls) => element.classList.remove(cls));
    if (initial) {
      element.className = "custom-marker";
    } else if (!element.classList.contains("custom-marker")) {
      element.classList.add("custom-marker");
    }
    if (status) {
      element.classList.add(status);
    }
  }

  addOrUpdateMarker(input: TrucklyMarkerInput) {
    try {
      const numericLng = Number(input.lng);
      const numericLat = Number(input.lat);
      if (!Number.isFinite(numericLng) || !Number.isFinite(numericLat)) return null;

      const angle = Number(
        input.angle ??
          input.device?.data?.gps?.angle ??
          input.device?.data?.gps?.Angle ??
          input.device?.gps?.angle ??
          input.device?.gps?.Angle ??
          0,
      );
      const collapsedValue = this.map.getZoom() < MAX_ZOOM ? "true" : "false";
      const defaultTemplate = this._getDefaultMarkerTemplate({ useArrow: true });
      const templateToUse = input.html ?? defaultTemplate;
      const useCustomTemplate = Boolean(input.html);

      let marker = this.markers.get(input.id);

      if (!marker) {
        const element = document.createElement("div");
        this._syncMarkerClasses(element, { status: input.status, classlist: input.classlist, initial: true });
        element.dataset.collapsed = collapsedValue;
        element.innerHTML = templateToUse;

        marker = new maplibregl.Marker({ element }) as ManagedMarker;
        marker.setLngLat([numericLng, numericLat]);

        if (!useCustomTemplate) {
          this._updateDefaultMarkerContent(element, { vehicle: input.vehicle, angle });
        } else {
          element.querySelectorAll<HTMLElement>("[data-role='marker-arrow']").forEach((node) => {
            node.style.transform = `rotate(${angle}deg)`;
          });
        }

        marker._usesDefaultTemplate = !useCustomTemplate;

        if (input.hasPopup) {
          const popup = new maplibregl.Popup({ offset: 12 });
          if (input.tooltip instanceof HTMLElement) {
            popup.setDOMContent(input.tooltip);
            (popup as any).__contentNode = input.tooltip;
            (popup as any).__contentHTML = null;
          } else {
            popup.setHTML(input.tooltip || `<b>${input.id}</b>`);
            (popup as any).__contentHTML = input.tooltip || `<b>${input.id}</b>`;
            (popup as any).__contentNode = null;
          }
          try {
            popup.on("open", () => {
              this.closeOtherPopups(marker!);
              this.focusMarker(marker!, { openPopup: false });
            });
          } catch {}
          marker.setPopup(popup);
        }

        marker.addTo(this.map);
        this.markers.set(input.id, marker);
        marker._customClassList = input.classlist === undefined ? null : input.classlist;

        const markerNode = marker.getElement ? marker.getElement() : marker._element;
        if (markerNode?.classList?.contains("custom-marker")) {
          markerNode.addEventListener("click", () => {
            if (this.onMarkerSelect) this.onMarkerSelect(marker!);
          });
        }
        markerNode?.addEventListener("mouseover", (ev) => this.hoverMarker(ev as any));
      } else {
        marker.setLngLat([numericLng, numericLat]);
        const element = marker.getElement ? marker.getElement() : marker._element;
        if (element) {
          if (input.classlist !== undefined) {
            marker._customClassList = input.classlist;
          }
          const hasCustomClassList = marker._customClassList !== null;
          const shouldSkipClassSync = hasCustomClassList && input.classlist === undefined;
          if (!shouldSkipClassSync) {
            this._syncMarkerClasses(element, { status: input.status, classlist: input.classlist });
          }
          element.dataset.collapsed = collapsedValue;

          if (useCustomTemplate) {
            element.innerHTML = input.html!;
            marker._usesDefaultTemplate = false;
            element.querySelectorAll<HTMLElement>("[data-role='marker-arrow']").forEach((node) => {
              node.style.transform = `rotate(${angle}deg)`;
            });
          } else {
            if (!marker._usesDefaultTemplate) {
              element.innerHTML = defaultTemplate;
            }
            this._updateDefaultMarkerContent(element, { vehicle: input.vehicle, angle });
            marker._usesDefaultTemplate = true;
          }
        }

        if (input.tooltip && input.hasPopup) {
          const popup = marker.getPopup();
          if (popup) {
            if (input.tooltip instanceof HTMLElement) {
              if ((popup as any).__contentNode !== input.tooltip) {
                popup.setDOMContent(input.tooltip);
                (popup as any).__contentNode = input.tooltip;
                (popup as any).__contentHTML = null;
              }
            } else {
              const nextHtml = input.tooltip || `<b>${input.id}</b>`;
              if ((popup as any).__contentHTML !== nextHtml) {
                popup.setHTML(nextHtml);
                (popup as any).__contentHTML = nextHtml;
                (popup as any).__contentNode = null;
              }
            }
            try {
              (popup as any).off && (popup as any).off("open");
              (popup as any).on && (popup as any).on("open", () => {
                this.closeOtherPopups(marker!);
                this.focusMarker(marker!, { openPopup: false });
              });
            } catch {}
          }
        }
      }

      marker!.vehicle = input.vehicle;
      marker!.device = input.device;
      marker!.status = input.status;

      marker!._lat = numericLat;
      marker!._lng = numericLng;

      const latestElement = marker!.getElement?.() ?? marker!._element;
      if (latestElement) {
        if (marker!._baseHTML === undefined) {
          marker!._baseHTML = latestElement.innerHTML;
        }
        marker!._defaultHTML = latestElement.innerHTML;
      }

      this._scheduleUpdateClusters();

      return marker!;
    } catch (e) {
      console.error("Error while parsing device", input.device, e);
      return null;
    }
  }

  _updateMarkerCollapseState(force = false) {
    const zoom = this.map.getZoom();
    const collapsedValue = zoom < MAX_ZOOM ? "true" : "false";
    if (!force && this._lastMarkerCollapseValue === collapsedValue) return;
    this._lastMarkerCollapseValue = collapsedValue;
    this.markers.forEach((marker) => {
      const element = marker.getElement ? marker.getElement() : marker._element;
      if (!element) return;
      if (!this.hoveringMarker) {
        if (element.classList.contains("custom-marker")) {
          element.dataset.collapsed = collapsedValue;
        }
      }
    });
  }

  hoverMarker(ev: MouseEvent) {
    const target = ev.currentTarget as HTMLElement | null;
    if (!target) return;
    if (target.dataset.collapsed === "false") return;
    target.removeEventListener("mouseenter", this.hoverMarker as any);
    target.addEventListener("mouseleave", this.unHoverMarker as any);
    target.dataset.collapsed = "false";
    this.hoveringMarker = true;
  }

  unHoverMarker = (ev: MouseEvent) => {
    const target = ev.currentTarget as HTMLElement | null;
    if (!target) return;
    target.dataset.collapsed = "true";
    target.removeEventListener("mouseleave", this.unHoverMarker as any);
    target.addEventListener("mouseenter", this.hoverMarker as any);
    this.hoveringMarker = false;
  };

  removeMarker(id: string) {
    const marker = this.markers.get(id);
    if (marker) {
      marker.remove();
      this.markers.delete(id);
      this._scheduleUpdateClusters();
    }
  }

  clearMarkers() {
    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();
    this.hoveringMarker = false;
  }

  resetClusterState({ animate = true } = {}) {
    if (typeof window !== "undefined" && (window as any).rewinding) return;
    const zoom = this.map?.getZoom?.();
    this.markers.forEach((marker) => {
      const el = (marker as ManagedMarker)?._element;
      if (!el) return;
      const clusterMeta = (marker as ManagedMarker)._clusterMeta;
      const restoreHTML = (marker as ManagedMarker)._defaultHTML !== undefined
        ? (marker as ManagedMarker)._defaultHTML
        : (marker as ManagedMarker)._baseHTML;
      if (restoreHTML !== undefined) el.innerHTML = restoreHTML;
      el.style.display = "";
      el.classList.remove("clustered-marker");
      el.classList.remove("custom-marker--split");
      el.style.removeProperty("--split-delay");
      el.style.removeProperty("animationDelay");
      if (Number.isFinite(zoom) && el.classList.contains("custom-marker")) {
        el.dataset.collapsed = zoom < MAX_ZOOM ? "true" : "false";
      }

      if (clusterMeta && animate) {
        const delayMs = Math.max(0, clusterMeta.index || 0) * 40;
        if (delayMs > 0) el.style.setProperty("--split-delay", `${delayMs}ms`);
        const handleAnimationEnd = () => {
          el.classList.remove("custom-marker--split");
          el.style.removeProperty("--split-delay");
          el.style.removeProperty("animationDelay");
          el.removeEventListener("animationend", handleAnimationEnd);
        };
        el.addEventListener("animationend", handleAnimationEnd, { once: true });
        el.classList.add("custom-marker--split");
      }

      this._unbindClusterLeader(marker as ManagedMarker);
      delete (marker as ManagedMarker)._clusterMeta;
      delete (marker as ManagedMarker)._clusterMembers;
    });
  }

  _scheduleUpdateClusters({ force = false }: { force?: boolean } = {}) {
    if (typeof window !== "undefined" && (window as any).rewinding) return;
    if (force && this._clusterUpdateFrame !== null) {
      cancelAnimationFrame(this._clusterUpdateFrame);
      this._clusterUpdateFrame = null;
      this._clusterUpdateScheduled = false;
    }
    if (this._clusterUpdateScheduled) return;
    this._clusterUpdateScheduled = true;
    this._clusterUpdateFrame = requestAnimationFrame(() => {
      this._clusterUpdateFrame = null;
      this._clusterUpdateScheduled = false;
      this.updateClusters();
    });
  }

  updateClusters() {
    if (typeof window !== "undefined" && (window as any).rewinding) return;
    if (!this.map || typeof this.map.getZoom !== "function") return;
    if (this.markers.size <= 1) {
      this.resetClusterState({ animate: true });
      return;
    }

    const zoom = this.map.getZoom();
    if (!Number.isFinite(zoom)) return;
    if (zoom >= CLUSTER_MIN_ZOOM) {
      this.resetClusterState({ animate: true });
      return;
    }

    this.resetClusterState({ animate: false });

    const radiusKm = CLUSTER_BASE_KM * Math.pow(2, CLUSTER_MIN_ZOOM - zoom);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) return;

    this._clusters = [];
    const clusters: ClusterBucket[] = [];
    this.markers.forEach((marker) => {
      const el = (marker as ManagedMarker)?._element;
      if (!el) return;
      const currentDisplay = window.getComputedStyle(el).display;
      if (currentDisplay === "none") return;

      const rawLat = (marker as ManagedMarker)._lat;
      const rawLng = (marker as ManagedMarker)._lng;
      if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return;
      const lat = rawLat as number;
      const lng = rawLng as number;

      let bucket: ClusterBucket | null = null;
      for (let i = 0; i < clusters.length; i++) {
        if (this.distanceKm(clusters[i].center, [lat, lng]) <= radiusKm) {
          bucket = clusters[i];
          break;
        }
      }

      if (!bucket) {
        bucket = { center: [lat, lng], members: [] };
        clusters.push(bucket);
      } else {
        const len = bucket.members.length + 1;
        bucket.center[0] += (lat - bucket.center[0]) / len;
        bucket.center[1] += (lng - bucket.center[1]) / len;
      }

      bucket.members.push(marker as ManagedMarker);
    });

    clusters.forEach((cluster) => {
      if (cluster.members.length <= 1) return;
      const [leader, ...rest] = cluster.members;
      if (!leader._element) return;

      cluster.members.forEach((marker, index) => {
        marker._clusterMeta = { index, count: cluster.members.length };
      });

      leader._clusterMembers = cluster.members;
      leader._element.innerHTML = this.getClusterHTML(cluster.members.length);
      leader._element.dataset.collapsed = "false";
      leader._element.classList.add("clustered-marker");
      this._bindClusterLeader(leader);
      this._clusters.push(cluster!);
      rest.forEach((m) => {
        if (!m._element) return;
        m._element.style.display = "none";
        m._element.dataset.collapsed = "true";
      });
    });
  }

  distanceKm([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) {
    if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2))
      return Infinity;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  getClusterHTML(count: number) {
    return `<div class="cluster-marker">${count}</div>`;
  }

  _unbindClusterLeader(marker: ManagedMarker) {
    if (!marker) return;
    const el = marker._element;
    if (el && marker._clusterHandlers) {
      marker._clusterHandlers.forEach(({ type, handler }) => el.removeEventListener(type, handler));
    }
    if (marker._clusterPopup) {
      try {
        marker._clusterPopup.remove();
      } catch {}
    }
    marker._clusterHandlers = null;
    marker._clusterPopup = null;
    marker._isClusterLeader = false;
  }

  _bindClusterLeader(marker: ManagedMarker) {
    if (!marker?._element || !Array.isArray(marker._clusterMembers) || marker._clusterMembers.length < 2) return;
    this._unbindClusterLeader(marker);
    const el = marker._element;
    marker._isClusterLeader = true;
    marker._clusterHandlers = [];
    const openCluster = (ev: Event) => {
      ev?.stopPropagation?.();
      ev?.preventDefault?.();
      this._showClusterPopup(marker);
    };
    ["click", "mouseenter"].forEach((type) => {
      el.addEventListener(type, openCluster);
      marker._clusterHandlers!.push({ type, handler: openCluster });
    });
  }

  _buildClusterPopupContent(members: ManagedMarker[] = [], onClose?: () => void) {
    const outer = document.createElement("div");
    outer.className = "cluster-popup-outer";
    const inner = document.createElement("div");
    inner.className = "cluster-popup-inner";
    members.forEach((member, index) => {
      const vehicle = member?.vehicle;
      const plateLabel = this._getVehicleDisplayLabel(vehicle);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "cluster-popup-entry";
      row.innerHTML = `<span class=\"cluster-popup-entry__icon\">${index + 1}</span><span>${plateLabel}</span>`;
      row.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        this.focusMarker(member, { openPopup: true, offset: true });
        const popup = typeof (member as any).getPopup === "function" ? (member as any).getPopup() : null;
        if (popup) {
          try {
            popup.addTo(this.map);
          } catch {}
        }
        onClose?.();
      });
      inner.appendChild(row);
    });
    outer.appendChild(inner);
    if (onClose) {
      outer.addEventListener("mouseleave", () => onClose(), { passive: true });
    }
    return outer;
  }

  _showClusterPopup(marker: ManagedMarker) {
    if (!marker || !marker._clusterMembers || marker._clusterMembers.length < 2) return;
    if (!marker._clusterPopup) {
      marker._clusterPopup = new maplibregl.Popup({ offset: 12, closeButton: false });
    }
    const closeActivePopup = () => {
      if (this._activeClusterPopup) {
        try {
          this._activeClusterPopup.remove();
        } catch {}
      }
    };
    const content = this._buildClusterPopupContent(marker._clusterMembers, closeActivePopup);
    marker._clusterPopup.setDOMContent(content);
    marker._clusterPopup.setLngLat((marker as any).getLngLat());
    marker._clusterPopup.addTo(this.map);
    this._activeClusterPopup = marker._clusterPopup;
  }

  fitToMarkers() {
    if (this.markers.size === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    this.markers.forEach((m) => bounds.extend(m.getLngLat()));
    this.map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
  }

  closeOtherPopups(activeMarker?: ManagedMarker | null) {
    this.markers.forEach((marker) => {
      if (activeMarker && marker === activeMarker) return;
      const popup = typeof (marker as any).getPopup === "function" ? (marker as any).getPopup() : null;
      if (!popup) return;
      try {
        if (typeof (popup as any).isOpen === "function") {
          if ((popup as any).isOpen()) popup.remove();
        } else {
          popup.remove();
        }
      } catch {}
    });
    if (this._activeClusterPopup) {
      try {
        this._activeClusterPopup.remove();
      } catch {}
      this._activeClusterPopup = null;
    }
  }

  focusMarker(marker: ManagedMarker, { openPopup = true, offset = false } = {}) {
    if (!marker || typeof marker.getLngLat !== "function") return false;
    const lngLat = marker.getLngLat();
    if (!lngLat) return false;

    this.closeOtherPopups(marker);
    this.resetClusterState({ animate: true });
    const currentZoom = this.map?.getZoom?.();
    this.map.flyTo({
      center: offset ? { lng: lngLat.lng, lat: lngLat.lat - 0.0185 } : lngLat,
      zoom: Math.max(Number.isFinite(currentZoom) ? currentZoom : 12, 12.5),
      speed: 1.2,
      curve: 1.4,
    });

    if (openPopup && typeof marker.getPopup === "function") {
      const popup = marker.getPopup();
      if (popup) {
        if (typeof (popup as any).isOpen === "function" && (popup as any).isOpen()) {
          popup.setLngLat(lngLat);
        } else if (typeof (marker as any).togglePopup === "function") {
          (marker as any).togglePopup();
        } else {
          popup.setLngLat(lngLat).addTo(this.map);
        }
      }
    }
    return true;
  }

  _setMarkersDimmed(dimmed: boolean) {
    const opacity = dimmed ? "0.5" : "1";
    this.markers.forEach((marker) => {
      const el = marker.getElement ? marker.getElement() : marker._element;
      if (!el) return;
      el.style.opacity = opacity;
      el.style.pointerEvents = dimmed ? "none" : "";
      if (dimmed) {
        el.classList.add("truckly-marker-dimmed");
      } else {
        el.classList.remove("truckly-marker-dimmed");
      }
    });
  }

  findMarkers(query: string | RegExp) {
    if (!query) return [];
    const regex = query instanceof RegExp ? query : new RegExp(String(query), "i");
    const results: { id: string; marker: ManagedMarker; vehicle: any; device: any }[] = [];
    const testField = (value: any) => {
      (regex as any).lastIndex = 0;
      return regex.test(String(value));
    };
    this.markers.forEach((marker, id) => {
      const vehicle = marker.vehicle || {};
      const device = marker.device || {};
      const fields = [
        vehicle.nickname,
        vehicle.name,
        vehicle.plate?.v,
        vehicle.plate,
        device?.data?.io?.driver1Id,
        device?.data?.io?.driver2Id,
        device?.driverName,
      ].filter(Boolean);
      if (fields.some(testField)) {
        results.push({ id, marker: marker as ManagedMarker, vehicle, device });
      }
    });
    return results;
  }

  searchVehicles(queryInfo: string | { raw?: string; allowRegex?: boolean; flags?: string } | RegExp = {}) {
    const raw = typeof queryInfo === "string"
      ? queryInfo
      : (queryInfo as any)?.raw ?? "";
    const trimmed = (raw || "").trim();

    if (!trimmed) {
      this.resetClusterState({ animate: true });
      return { matches: [], focused: false, query: "" };
    }

    const allowRegex = Boolean((queryInfo as any)?.allowRegex);
    const flags = typeof (queryInfo as any)?.flags === "string" ? (queryInfo as any).flags : "i";
    let regex = queryInfo instanceof RegExp ? queryInfo : null;

    if (!regex && allowRegex) {
      try {
        regex = new RegExp(trimmed, flags);
      } catch (err) {
        console.warn("Invalid regex pattern:", trimmed, err);
      }
    }

    if (!regex) {
      const escaped = escapeRegex(trimmed);
      try {
        regex = new RegExp(escaped, flags);
      } catch (err) {
        console.warn("Unable to build fallback regex for:", trimmed, err);
        return { matches: [], focused: false, query: trimmed, invalid: true };
      }
    }

    const matches = this.findMarkers(regex!);
    const firstMatch = matches[0]?.marker;
    const focused = firstMatch ? this.focusMarker(firstMatch) : false;

    return {
      matches: matches.map((m) => ({
        id: m.id,
        vehicle: {
          nickname: m.vehicle?.nickname || null,
          plate: m.vehicle?.plate?.v || m.vehicle?.plate || null,
        },
        device: {
          driver1Id: m.device?.data?.io?.driver1Id || null,
          driver2Id: m.device?.data?.io?.driver2Id || null,
        },
      })),
      focused: Boolean(focused),
      query: (regex as RegExp).source,
      flags,
    };
  }
}
