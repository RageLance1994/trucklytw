/* global maplibregl */

(() => {
  // Stato globale mantenuto da maps.js
  const _state = {
    map: null,
    markers: {},       // imei → marker instance
    popups: {},        // imei → popup instance
    vehicles: {},      // imei → vehicle base info
  };

  // ============================
  // UTILITY FORMATTING
  // ============================

  function formatTimestamp(ts) {
    if (!ts) return "N/D";
    try {
      return new Date(ts).toLocaleString("it-IT");
    } catch {
      return "N/D";
    }
  }

  function popupHTML(v) {
    return `
      <div class="w-[260px] bg-zinc-900 text-white rounded-lg shadow-lg p-3">
        <div class="flex justify-between items-center mb-2">
          <div class="font-semibold text-base">${v.nickname || "Senza nome"}</div>
          <span class="px-2 py-0.5 rounded text-xs bg-green-600">
            ${v.statusLabel || "Sconosciuto"}
          </span>
        </div>

        <div class="h-px w-full bg-zinc-700 mb-2"></div>

        <div class="flex items-center gap-2 text-sm mb-1">
          <span>🕒</span> <span class="font-medium">Ultimo:</span>
          <span>${formatTimestamp(v.lastUpdate)}</span>
        </div>

        <div class="flex items-center gap-2 text-sm mb-1">
          <span>📍</span>
          <span>${v.lat}</span>
          <span>${v.lon}</span>
        </div>

        <div class="flex items-center gap-2 text-sm mb-1">
          <span>➡️</span>
          <span class="truncate">${v.address || "N/D"}</span>
        </div>

        <div class="flex items-center gap-2 text-sm mb-1">
          <span>🏎️</span> <span>${v.speed} km/h</span>
        </div>

        <div class="flex items-center gap-2 text-sm mb-1">
          <span>🚚</span> <span class="font-medium">${v.plate || "N/D"}</span>
        </div>

        <div class="flex items-center gap-2 text-sm mb-1">
          <span>⛽</span> 
          <span>${v.fuelLiters} L / ${v.fuelCapacity} L</span>
          <span class="text-zinc-400 text-xs ml-auto">${v.fuelPct}%</span>
        </div>

        <div class="flex items-center gap-2 text-sm">
          <span>🧑‍✈️</span>
          <span>${v.driverName || "N/D"}</span>
          <span class="ml-auto text-xs px-2 py-0.5 rounded bg-blue-600">
            ${v.driverStatusLabel || "N/D"}
          </span>
        </div>
      </div>
    `;
  }

  // ======================================
  // CREA MARKER + POPUP (una sola volta)
  // ======================================

  function createMarker(vehicle) {
    const { imei } = vehicle;

    const el = document.createElement("div");
    el.className = "truck-marker";
    el.style.width = "22px";
    el.style.height = "22px";
    el.style.borderRadius = "50%";
    el.style.background = "#4ade80"; // verde acceso
    el.style.border = "2px solid #000";

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([vehicle.lon, vehicle.lat])
      .addTo(_state.map);

    const popup = new maplibregl.Popup({
      offset: 28,
      closeButton: true,
      closeOnClick: false
    });

    marker.setPopup(popup);

    // click sul marker → notifica React
    el.addEventListener("click", () => {
      window.dispatchEvent(
        new CustomEvent("vchange", { detail: { imei } })
      );
    });

    _state.markers[imei] = marker;
    _state.popups[imei] = popup;

    return marker;
  }

  // =======================================
  // UPDATE MARKER + POPUP LIVE
  // =======================================

  function updateMarker(imei, update) {
    const marker = _state.markers[imei];
    const popup = _state.popups[imei];

    if (!marker) return;

    const { gps } = update;
    if (gps) {
      marker.setLngLat([gps.longitude, gps.latitude]);
    }

    const v = {
      ..._state.vehicles[imei],
      lat: gps?.latitude || "N/D",
      lon: gps?.longitude || "N/D",
      speed: gps?.speed || 0,
      lastUpdate: update.timestamp,
      address: update.address || "N/D",
      fuelLiters: update.fuel?.liters ?? 0,
      fuelCapacity: update.fuel?.capacity ?? 0,
      fuelPct: update.fuel?.percent ?? 0,
      driverName: update.driver?.name ?? "N/D",
      driverStatusLabel: update.driver?.state ?? "N/D",
      statusLabel: update.status ?? "Sconosciuto",
    };

    const html = popupHTML(v);

    popup.setHTML(html);
  }

  // =======================================
  // INIT MAP (funzione chiamata da React)
  // =======================================

  window.initMap = function (mapDiv, vehicles) {
    console.log("🚀 Initializing Truckly Map...");

    _state.vehicles = {};
    vehicles.forEach(v => {
      _state.vehicles[v.imei] = v;
    });

    const map = new maplibregl.Map({
      container: mapDiv,
      style: "/maps/style.json",
      center: [12.5, 42.0],
      zoom: 6,
      maxZoom: 18,
      minZoom: 2
    });

    _state.map = map;

    map.addControl(new maplibregl.NavigationControl());

    map.on("load", () => {
      console.log("🗺️ Mappa caricata, creo markers…");

      vehicles.forEach(v => {
        createMarker({
          imei: v.imei,
          nickname: v.nickname,
          plate: v.plate,
          lat: v.lat ?? 0,
          lon: v.lon ?? 0
        });
      });
    });

    return map;
  };

  // =======================================
  // FUNZIONE DI UPDATE GLOBALE (chiamata da React)
  // =======================================

  window.updateVehicle = function ({ imei, data }) {
    updateMarker(imei, data);
  };

  // =======================================
  // FOCUS VEICOLO (per aprire dettaglio)
  // =======================================

  window.focusVehicle = function (imei) {
    const marker = _state.markers[imei];
    if (!marker || !_state.map) return;

    const lngLat = marker.getLngLat();
    _state.map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: 12 });

    const popup = _state.popups[imei];
    if (popup) popup.addTo(_state.map);
  };

})();
