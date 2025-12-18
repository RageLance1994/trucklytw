const MAX_ZOOM = 15;

const GOOGLE_STYLES = {
  light: [
    { elementType: "geometry", stylers: [{ color: "#ebe3cd" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#523735" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f5f1e6" }] },
    {
      featureType: "administrative",
      elementType: "geometry.stroke",
      stylers: [{ color: "#c9b2a6" }]
    },
    {
      featureType: "poi",
      elementType: "geometry",
      stylers: [{ color: "#dfd2ae" }]
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#f5f1e6" }]
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#f8c967" }]
    },
    {
      featureType: "water",
      elementType: "geometry.fill",
      stylers: [{ color: "#b9d3c2" }]
    }
  ],
  dark: [
    { elementType: "geometry", stylers: [{ color: "#1d1d1d" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#cfcfcf" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
    {
      featureType: "water",
      elementType: "geometry.fill",
      stylers: [{ color: "#0f252e" }]
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#2c2c2c" }]
    },
    {
      featureType: "poi",
      elementType: "geometry",
      stylers: [{ color: "#202020" }]
    },
    {
      featureType: "transit",
      elementType: "geometry",
      stylers: [{ color: "#1f1f1f" }]
    },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#d0d0d0" }]
    }
  ]
};

const DEFAULT_CENTER = [12.4964, 41.9028]; // [lng, lat]

const toLatLng = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export class GoogleMapsProvider {
  constructor({ target, theme = "dark", center = DEFAULT_CENTER, zoom = 6, markers = [] } = {}) {
    if (!window.google || !window.google.maps) {
      throw new Error("Google Maps API not available. Ensure the script is preloaded with a valid key.");
    }

    this.targetId = target;
    this.theme = theme;
    this.center = Array.isArray(center) && center.length === 2 ? center : DEFAULT_CENTER;
    this.zoom = zoom;
    this.styles = GOOGLE_STYLES;
    this.markers = new Map();
    this.hoverMarker = this.hoverMarker.bind(this);
    this.unHoverMarker = this.unHoverMarker.bind(this);
    this.hoveringMarker = false;
    this._listeners = [];
    this._infoWindow = new window.google.maps.InfoWindow();

    this.targetDom = typeof target === "string"
      ? document.querySelector(`#${target}`) || document.getElementById(target)
      : target;

    if (!this.targetDom) {
      throw new Error(`[GoogleMapsProvider] target "${target}" not found`);
    }

    const initialCenter = {
      lat: toLatLng(this.center[1], DEFAULT_CENTER[1]),
      lng: toLatLng(this.center[0], DEFAULT_CENTER[0])
    };

    this.map = new window.google.maps.Map(this.targetDom, {
      center: initialCenter,
      zoom: this.zoom,
      styles: this.styles[this.theme] || null,
      disableDefaultUI: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy"
    });

    this._listeners.push(
      this.map.addListener("zoom_changed", () => this._updateMarkerCollapseState())
    );

    const initialMarkers = Array.isArray(markers) ? markers : [];
    initialMarkers.forEach((marker) => this.addOrUpdateMarker(marker));
  }

  getMap() {
    return this.map;
  }

  destroy() {
    this.clearMarkers();
    this._listeners.forEach(listener => {
      try { listener.remove(); } catch { window.google.maps.event.removeListener(listener); }
    });
    this._listeners = [];
    if (this._infoWindow) {
      try { this._infoWindow.close(); } catch { }
      this._infoWindow = null;
    }
    this.map = null;
  }

  switchTheme(theme) {
    const next = theme || (this.theme === "dark" ? "light" : "dark");
    this.theme = next;
    if (this.map) {
      this.map.setOptions({ styles: this.styles[this.theme] || null });
    }
  }

  addOrUpdateMarker(markerData = {}) {
    const normalized = this._normalizeMarker(markerData);
    if (!normalized || !this.map) return null;

    const { id } = normalized;
    const existing = this.markers.get(id);
    const html = this._buildMarkerHtml(normalized);

    if (!existing) {
      const entry = this._createMarkerEntry(normalized, html);
      if (!entry) return null;
      this.markers.set(id, entry);
      return entry.marker;
    }

    existing.data = normalized;
    if (existing.marker) {
      existing.marker.position = { lat: normalized.lat, lng: normalized.lng };
      if (typeof existing.marker.setPosition === "function") {
        existing.marker.setPosition({ lat: normalized.lat, lng: normalized.lng });
      }
    }
    if (existing.element) {
      existing.element.className = `custom-marker ${normalized.status || ""}`.trim();
      existing.element.dataset.collapsed = String(this._shouldCollapse());
      existing.element.innerHTML = html;
    }

    return existing.marker;
  }

  removeMarker(id) {
    const entry = this.markers.get(id);
    if (!entry) return;

    if (entry.clickListener) {
      try { entry.clickListener.remove(); } catch { window.google.maps.event.removeListener(entry.clickListener); }
    }
    if (entry.marker) {
      try { entry.marker.setMap(null); } catch { }
    }
    if (entry.element && entry.element.remove) {
      entry.element.remove();
    }

    this.markers.delete(id);
    if (this._infoWindow) {
      try { this._infoWindow.close(); } catch { }
    }
  }

  fitToMarkers() {
    if (!this.map || this.markers.size === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    this.markers.forEach(entry => {
      const { data } = entry;
      if (Number.isFinite(data?.lat) && Number.isFinite(data?.lng)) {
        bounds.extend({ lat: data.lat, lng: data.lng });
      }
    });
    try {
      this.map.fitBounds(bounds, { padding: 50 });
      if (this.map.getZoom() > MAX_ZOOM) {
        this.map.setZoom(MAX_ZOOM);
      }
    } catch { }
  }

  hoverMarker(ev) {
    const target = ev?.currentTarget;
    if (!target || target.dataset.collapsed === "false") return;
    target.removeEventListener("mouseenter", this.hoverMarker);
    target.addEventListener("mouseleave", this.unHoverMarker);
    target.dataset.collapsed = "false";
    this.hoveringMarker = true;
  }

  unHoverMarker(ev) {
    const target = ev?.currentTarget;
    if (!target) return;
    target.dataset.collapsed = "true";
    target.removeEventListener("mouseleave", this.unHoverMarker);
    target.addEventListener("mouseenter", this.hoverMarker);
    this.hoveringMarker = false;
  }

  clearMarkers() {
    this.markers.forEach((_, id) => this.removeMarker(id));
    this.markers.clear();
  }

  _normalizeMarker(data = {}) {
    const id = data.id ?? data.imei;
    let lng = Number(data.lng ?? data.lon ?? data.longitude);
    let lat = Number(data.lat ?? data.latitude);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      const device = data.device || {};
      lng = Number(device?.data?.gps?.Longitude ?? device?.gps?.Longitude);
      lat = Number(device?.data?.gps?.Latitude ?? device?.gps?.Latitude);
    }

    if (!Number.isFinite(lng) || !Number.isFinite(lat) || id === undefined || id === null) {
      return null;
    }

    return {
      ...data,
      id,
      lng,
      lat
    };
  }

  _shouldCollapse() {
    if (!this.map) return true;
    const zoom = this.map.getZoom?.();
    return Number.isFinite(zoom) ? zoom < MAX_ZOOM : true;
  }

  _buildMarkerHtml({ vehicle, device, angle, status }) {
    const plate = vehicle?.plate?.v || vehicle?.plate || vehicle?.nickname || "—";
    const guessAngle =
      Number(angle) ??
      Number(device?.data?.gps?.Angle) ??
      Number(device?.gps?.Angle) ??
      0;
    const deg = Number.isFinite(guessAngle) ? guessAngle : 0;
    const iconHtml = `<i class="fa fa-arrow-up" style="transform:rotate(${deg}deg);"></i>`;

    return `
      <div class="wrapper-h rectangle j-center a-center relative">
        <a class="compass"><i class="fa fa-truck flipped-x"></i></a>
        <p>${plate}</p>
        <a class="compass">
          ${iconHtml}
        </a>
      </div>
      <div class="wrapper-h nopadding circle j-center a-center relative">
        <a class="compass" style="padding-bottom:2px;">
          ${iconHtml}
        </a>
      </div>
    `;
  }

  _createMarkerEntry(data, html) {
    const element = document.createElement("div");
    element.className = `custom-marker ${data.status || ""}`.trim();
    element.dataset.collapsed = String(this._shouldCollapse());
    element.innerHTML = html;

    element.addEventListener("mouseover", this.hoverMarker);
    element.addEventListener("mouseleave", this.unHoverMarker);

    if (data.vehicle) {
      element.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("vchange", { detail: { vehicle: data.vehicle } }));
      });
    }

    const entry = {
      marker: null,
      element,
      data,
      clickListener: null
    };

    const { AdvancedMarkerElement } = window.google.maps.marker || {};

    if (AdvancedMarkerElement) {
      entry.marker = new AdvancedMarkerElement({
        map: this.map,
        position: { lat: data.lat, lng: data.lng },
        content: element,
        collisionBehavior: "REQUIRED"
      });
      entry.clickListener = entry.marker.addListener("click", () => this._handleMarkerClick(entry));
    } else {
      entry.marker = new window.google.maps.Marker({
        map: this.map,
        position: { lat: data.lat, lng: data.lng },
        title: data.tooltip || (data.vehicle?.plate?.v ?? `Marker ${data.id}`)
      });
      entry.clickListener = entry.marker.addListener("click", () => this._handleMarkerClick(entry));
    }

    return entry;
  }

  _handleMarkerClick(entry) {
    if (!entry || !this.map) return;
    const tooltip = entry.data.tooltip || `<b>Marker ${entry.data.id}</b>`;
    if (!this._infoWindow) {
      this._infoWindow = new window.google.maps.InfoWindow();
    }
    this._infoWindow.setContent(tooltip);
    try {
      this._infoWindow.open({
        map: this.map,
        anchor: entry.marker
      });
    } catch {
      this._infoWindow.open(this.map, entry.marker);
    }
  }

  _updateMarkerCollapseState() {
    if (this.hoveringMarker) return;
    const shouldCollapse = this._shouldCollapse();
    this.markers.forEach(entry => {
      if (entry.element) {
        entry.element.dataset.collapsed = String(shouldCollapse);
      }
    });
  }
}
