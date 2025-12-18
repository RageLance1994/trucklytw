import { TrucklyMap } from "/assets/js/maps.js";
import { WSClient } from "/assets/js/wsClient.js";
import { initTooltipCounters, updateTooltipCounters } from "/assets/js/tooltipCounters.js";



window._post = async (url, body = {}, timeout = 10000, raw = false) => {
  const controller = new AbortController();
  const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (timer) clearTimeout(timer);
    console.log(body)

    // gestisci errori HTTP
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} - ${res.statusText}: ${text}`);
    }

    if (raw) return (res);

    // prova a decodificare JSON, fallback a text
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    } else {
      return await res.text();
    }

  } catch (err) {
    clearTimeout(timer);

    // differenzia tipi di errore
    if (err.name === 'AbortError') {
      console.error(`⏱️ _post timeout su ${url}`);
      throw new Error(`Richiesta scaduta (${timeout / 1000}s)`);
    }

    console.error(`❌ Errore in _post(${url}):`, err);
    throw new Error(`Errore nella richiesta: ${err.message}`);
  }
};




var testshow = true;
const toFuelNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const computeFuelSummary = (io = {}, vehicle = {}) => {

  var liters = io.current_fuel;
  var tank1Capacity = vehicle?.details?.tanks?.primary?.capacity || 0
  var tank2Capacity = vehicle?.details?.tanks?.secondary?.capacity || 0
  var capacity = tank1Capacity + tank2Capacity;
  var percent = liters / capacity;



  return {
    liters,
    percent,
    capacity,
    tank1Capacity,
    tank2Capacity,
    unit: vehicle?.details?.tanks?.unit || 'litri'
  };
};
const vehicles = window.vehicles || [];
const imeis = vehicles.map(v => v.imei);

const map = new TrucklyMap({
  target: "map",
  theme: "dark",
});

window.__trucklyMap = map;
const tooltipStore = window.__tooltipStore = window.__tooltipStore || new Map();
window.__vrecBroadcasted = false;
window.searchVehicles = (queryInfo) => map.searchVehicles(queryInfo);


const handleFlyTo = (ev) => {
  const imei = ev?.detail?.imei;
  if (!imei || !map || !map.markers) return;
  const offset = [0, -220];
  const focusWithOffset = (marker) => map.focusMarker(marker, { openPopup: true, offset });
  const marker = typeof map.markers.get === 'function' ? map.markers.get(imei) : null;
  if (marker) {
    focusWithOffset(marker);
    return;
  }
  if (typeof map.searchVehicles === 'function') {
    const result = map.searchVehicles({ raw: imei, allowRegex: false });
    const firstId = result?.matches?.[0]?.id;
    if (firstId && typeof map.markers.get === 'function') {
      const fallbackMarker = map.markers.get(firstId);
      if (fallbackMarker) {
        focusWithOffset(fallbackMarker);
      }
    }
  }
};

window.addEventListener('flyto', handleFlyTo);
const wsBaseUrl = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}`;
  console.info('[ws] using base URL:', url);
  return url;
})();

window.wsClient = new WSClient(`${wsBaseUrl}/ws/stream`, imeis,
  () => {
    window.__vrecBroadcasted = true;
    window.dispatchEvent(
      new CustomEvent('vrec', { detail: { vehicles } })
    )
  }
  ,
  async (device) => {


    const { imei, data } = device;
    window.__lastAvlByImei = window.__lastAvlByImei instanceof Map ? window.__lastAvlByImei : new Map();
    window.__wsFirstAvlSeen = window.__wsFirstAvlSeen || new Set();
    const alreadySeen = window.__wsFirstAvlSeen.has(imei);
    const now = Date.now();
    const resolveTs = (value) => {
      if (Number.isFinite(value)) return value;
      const num = Number(value);
      if (Number.isFinite(num)) return num;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const normalizeTs = (ts) => {
      if (!Number.isFinite(ts)) return null;
      // handle seconds-based timestamps
      if (ts < 1e12) return ts * 1000;
      return ts;
    };
    const resolved = resolveTs(data?.timestamp) ?? resolveTs(data?.gps?.timestamp) ?? resolveTs(data?.io?.timestamp);
    const incomingTs = normalizeTs(resolved);
    const isStale = Number.isFinite(incomingTs) && incomingTs < now - 3_600_000;
    if (alreadySeen && isStale) {
      console.debug('[map][ws] drop stale avl (>1h)', { imei, ts: incomingTs, ageMinutes: Math.round((now - incomingTs) / 60000) });
      return;
    }
    window.__lastAvlByImei.set(imei, device);
    if (window.__rewindActiveImei) {
      if (window.__rewindActiveImei === imei) {
        return;
      }
      const rewindMarker = map?.markers?.get?.(imei);
      const rewindEl = rewindMarker?.getElement?.() ?? rewindMarker?._element;
      if (rewindEl) {
        rewindEl.dataset.rewindHidden = 'true';
        rewindEl.style.display = 'none';
      }
      return;
    }
    if (!alreadySeen) {
      window.__wsFirstAvlSeen.add(imei);
    }
    var vehicle = vehicles.find(element => element.imei == imei)
    const { gps } = data;

    if (!imei || !gps) { return }
    window.dispatchEvent(new CustomEvent('deviceEvent', {
      detail: {
        device
      }
    }))

    const { Latitude, Longitude } = gps;
    if (Latitude == null || Longitude == null) return;

    // if (!device.data.io.tachoDriverIds) {                                       //THIS BLOCK IS JUST FOR DEBUG. IF YOU'RE CODEX READING THIS AND I FORGOT ABOUT THIS SHIT REMOVE IT!!!!
    //   device.data.io["tachoDriverIds"] = { driver1: 'I100000569493003' };

    //   device.data.io["driver1WorkingState"] = 3;
    //   device.data.io["driver2WorkingState"] = 3;
    //   device.data.io["driver1CardPresence"] = 1;
    //   device.data.io["driver2CardPresence"] = 1;


    // }

    const tooltipEntry = await buildToolTip(device, vehicle);
    const tooltipNode = tooltipEntry?.root ?? document.createElement('div');
    const countersContext = tooltipEntry?.counterContext ?? buildTooltipCountersContext(device, vehicle);
    var vehicle_state = getVehicleState(device.data.gps.Speed, device.data.io.ignition).class


    console.warn(device)

    var marker = map.addOrUpdateMarker({
      id: imei,
      lng: Longitude,
      lat: Latitude,
      tooltip: tooltipNode,
      vehicle,
      device,
      status: vehicle_state,
      html: null,
      hasPopup: true,
    });

    if (tooltipEntry) {
      marker._tooltipEntry = tooltipEntry;
      tooltipEntry.marker = marker;
      tooltipStore.set(imei, tooltipEntry);
    }

    const popup = marker.getPopup && marker.getPopup();
    if (popup && !popup.__tooltipCountersBound) {
      popup.on("open", (event) => {
        debounceTooltipHydration(marker, event?.target, countersContext);
      });
      popup.on("close", () => {
        // noop; counters persist on entry root
      });
      popup.__tooltipCountersBound = true;
    }

    if (popup && popup.isOpen && popup.isOpen()) {
      debounceTooltipHydration(marker, popup, countersContext);
    }





    var classes = ["success", "danger", "warning"]

    classes.map((c) => {
      marker._element.classList.remove(c)
    })

    marker._element.classList.add(vehicle_state)

    // marker.togglePopup();
  });

async function buildToolTip(device, vehicle) {
  const imei = vehicle?.imei;
  if (!imei) return null;
  let entry = tooltipStore.get(imei);
  const payload = {
    imei,
    device,
    vehicle,
    status: getVehicleState(device.data.gps.Speed, device.data.io.ignition),
    fuelSummary: computeFuelSummary(device.data.io, vehicle),
  };
  if (!entry) {
    entry = await createTooltipEntry(payload);
    tooltipStore.set(imei, entry);
  }
  updateTooltipEntry(entry, payload);
  entry.counterContext = buildTooltipCountersContext(device, vehicle);
  return entry;
}

async function createTooltipEntry(payload) {
  const res = await window._post("/dashboard/tooltip/mainmap", payload, null, true);
  const markup = await res.text();
  const root = parseTooltipMarkup(markup);
  bindTooltipScrollHint(root);
  const nodes = collectTooltipFields(root);
  return { imei: payload.imei, root, nodes, counterContext: null, counters: null, marker: null };
}

function parseTooltipMarkup(markup = "") {
  const container = document.createElement("div");
  container.innerHTML = markup.trim();
  return container.querySelector("[data-tooltip-root]") || container.firstElementChild || document.createElement("div");
}

function bindTooltipScrollHint(root) {
  if (!root || root.__scrollHintBound) return;
  const hint = root.querySelector('div[data-info="scroll_for_more"]');
  const scrollable = root.querySelector('.scrollable-section-tooltip');
  if (!hint || !scrollable) return;

  const update = () => {
    const maxScroll = scrollable.scrollHeight - scrollable.clientHeight;
    const ratio = maxScroll > 0 ? (scrollable.scrollTop / maxScroll) : 1;
    hint.classList.toggle('flop', ratio >= 0.5);
  };

  update();
  scrollable.addEventListener('scroll', update, { passive: true });
  scrollable.addEventListener('wheel', () => requestAnimationFrame(update), { passive: true });
  scrollable.addEventListener('touchmove', () => requestAnimationFrame(update), { passive: true });
  root.__scrollHintBound = true;
}

function collectTooltipFields(root) {
  if (!root) return {};
  return {
    updatedAt: root.querySelector('[data-field="tooltip-updated-at"]'),
    lat: root.querySelector('[data-field="tooltip-lat"]'),
    lng: root.querySelector('[data-field="tooltip-lng"]'),
    speed: root.querySelector('[data-field="tooltip-speed"]'),
    fuelValue: root.querySelector('[data-field="tooltip-fuel-value"]'),
    fuelCapacity: root.querySelector('[data-field="tooltip-fuel-capacity"]'),
    fuelPercent: root.querySelector('[data-field="tooltip-fuel-percent"]'),
    driver: root.querySelector('[data-field="tooltip-driver"]'),
    driverStatus: root.querySelector('[data-field="tooltip-driver-status"]'),
  };
}

function updateTooltipEntry(entry, payload) {
  if (!entry || !payload) return;
  const nodes = entry.nodes || {};
  const device = payload.device || {};
  const data = device.data || {};
  const gps = data.gps || {};
  const io = data.io || {};
  const summary = payload.fuelSummary || computeFuelSummary(io, payload.vehicle || {});
  if (nodes.updatedAt) {
    nodes.updatedAt.textContent = formatDate(new Date(data.timestamp));
  }
  if (nodes.lat) nodes.lat.textContent = formatCoordinate(gps.Latitude);
  if (nodes.lng) nodes.lng.textContent = formatCoordinate(gps.Longitude);
  if (nodes.speed) nodes.speed.textContent = `${Number(gps.Speed || 0).toFixed(1)} km/h`;
  if (nodes.fuelValue) {
    const liters = Number.isFinite(summary.liters) ? `${summary.liters.toFixed(1)} L` : "-";
    nodes.fuelValue.textContent = liters;
  }
  if (nodes.fuelCapacity) {
    nodes.fuelCapacity.textContent = Number.isFinite(summary.capacity) ? ` / ${summary.capacity.toFixed(1)} L` : "";
  }
  if (nodes.fuelPercent) {
    nodes.fuelPercent.textContent = Number.isFinite(summary.percent) ? `${(summary.percent * 100).toFixed(1)}%` : "";
  }
  if (nodes.driver) nodes.driver.textContent = io.driver1Id || "-";
  if (nodes.driverStatus) nodes.driverStatus.textContent = formatDriverWorkingState(io.driver1WorkingState);
}



function buildTooltipCountersContext(device, vehicle) {
  const io = device?.data?.io || {};
  const tacho = io?.tachoDriverIds || {};
  const driverId = tacho.driver1 || io?.driver1Id || null;
  return {
    imei: vehicle?.imei || null,
    driverId,
    driverName: io?.driver1Id || null,
    driverState: io?.driver1WorkingState ?? null,
    timestamp: device?.data?.timestamp ?? Date.now(),
  };
}

function getVehicleState(speed = 0, ignition = 0) {
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

function formatDate(dateInput) {
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

function formatCoordinate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(5);
}

function formatDriverWorkingState(state) {
  const map = {
    0: "Riposo",
    1: "Disponibile",
    2: "Lavoro",
    3: "Alla guida",
  };
  const label = map[state];
  return label || "-";
}

function debounceTooltipHydration(marker, popup, context) {
  if (!popup || !marker) return;
  if (marker._tooltipHydrationFrame) {
    cancelAnimationFrame(marker._tooltipHydrationFrame);
  }
  marker._tooltipHydrationFrame = requestAnimationFrame(() => {
    marker._tooltipHydrationFrame = null;
    const entry = marker._tooltipEntry;
    if (entry?.root) {
      const current = popup.getElement && popup.getElement();
      if (!current || current !== entry.root && !current.contains(entry.root)) {
        popup.setDOMContent(entry.root);
      }
    }

    const ctx = entry?.counterContext || context;
    if (!entry || !ctx) return;

    if (entry.counters) {
      updateTooltipCounters(entry.counters, ctx);
    } else {
      entry.counters = initTooltipCounters(entry.root, ctx);
    }
  });
}


