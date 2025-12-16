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
const CLUSTER_MIN_ZOOM = 12;
const CLUSTER_BASE_KM = 0.4;
const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const escapeRegex = (value = "") => value.replace(REGEX_ESCAPE, "\\$&");

export class TrucklyMap {
  map: MlMap;
  markers: Map<string, ManagedMarker> = new Map();
  _clusterUpdateScheduled = false;
  _clusterUpdateFrame: number | null = null;
  _clusters: ClusterBucket[] = [];
  _handleThemeChange?: () => void;
  _activeClusterPopup: Popup | null = null;
  hoveringMarker = false;
  onMarkerSelect?: (marker: ManagedMarker) => void;
  _lastMarkerCollapseValue: "true" | "false" | null = null;

  styles = {
    dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
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

    const containerId =
      typeof container === "string"
        ? container
        : (container as HTMLElement).id || "truckly-map";

    const themeStyle = this._resolveTheme(theme) === "light"
      ? this.styles.light
      : this.styles.dark;

    this.map = new maplibregl.Map({
      container,
      style: styleUrl || themeStyle,
      center,
      zoom,
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
    this.markers.forEach((m) => m.remove());
    this.markers.clear();
    this.map?.remove();
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

      const angle = Number(input.angle ?? input.device?.data?.gps?.Angle ?? input.device?.gps?.Angle ?? 0);
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

      const latestElement = marker!.getElement ? marker!.getElement() : marker!._element;
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
    const zoom = typeof this.map.getZoom === "function" ? this.map.getZoom() : MAX_ZOOM;
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
    const zoom = this.map?.getZoom?.();
    this.markers.forEach((marker) => {
      const el = (marker as ManagedMarker)?._element;
      if (!el) return;
      const clusterMeta = (marker as ManagedMarker)._clusterMeta;
      const restoreHTML = (marker as ManagedMarker)._baseHTML !== undefined
        ? (marker as ManagedMarker)._baseHTML
        : (marker as ManagedMarker)._defaultHTML;
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

      const lat = (marker as ManagedMarker)._lat;
      const lng = (marker as ManagedMarker)._lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

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
      this._clusters.push(cluster);
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

  focusMarker(marker: ManagedMarker, { openPopup = true, offset = false } = {}) {
    if (!marker || typeof marker.getLngLat !== "function") return false;
    const lngLat = marker.getLngLat();
    if (!lngLat) return false;

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
