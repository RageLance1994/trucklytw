import { TagInputManager } from "/assets/js/tagManager.js";
import { createMenu } from "/assets/js/menus.js"
import { TrucklyMap } from "/assets/js/maps.js";
import * as _nt from "/assets/js/notifications.js"
import * as _ti from "/assets/js/tooltipInteractions.js"; 
import { handleVehicleInteraction } from "/assets/js/tooltipInteractions.js";


const arf = [   //actions that require floateer
  "route@trip",
  "route@custom",
]



window._post = async (url, body = {}, timeout = 10000, raw = false) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
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

    clearTimeout(timer);

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




const navs = document.querySelectorAll('.navbar-item');
const activeNavs = document.querySelectorAll('.navbar-item[data-action]:not([data-action=""])');
const navbarItems = document.querySelectorAll('.navbar-item .menu-item');
const regol = document.querySelector('.overlay[data-role="inforegister"]')
const bottom = document.querySelector('#bottom_section');
const imeiRegex = /^\d{15}$/; // Teltonika IMEI: 15 cifre 
const devicePreview = regol.querySelector('.devicepreview');
const mainMapFrame = document.querySelector('#mainmapframe')
const mainMapOverlay = document.querySelector('#main_map_overlay');
const navbarSearchInput = document.querySelector('[data-role="search-input"]');
const navbarSearchSpinner = document.querySelector('[data-role="search-spinner"]');
const navbarSearchBar = document.querySelector('.searchbar');
const navbarSearchToggle = document.querySelector('.sbtoggle');
const navbarSearchClose = document.querySelector('.searchbar .mobileshow a');
let navbarSearchTimeout = null;
const mobileSearchMedia = window.matchMedia('(max-width: 900px)');
const userContext = window.__TRUCKLY_USER || {};
const datasetPrivilege = document.body?.dataset?.privilege;
const datasetRole = document.body?.dataset?.role;
const datasetCanManage = document.body?.dataset?.canManageVehicles;
const parsedPrivilege = Number.parseInt(
  (datasetPrivilege && datasetPrivilege.length ? datasetPrivilege : userContext.privilege),
  10
);
const parsedRole = Number.parseInt(
  (datasetRole && datasetRole.length ? datasetRole : userContext.role),
  10
);
const canManageVehicles = (() => {
  if (typeof userContext.canManageVehicles === 'boolean') return userContext.canManageVehicles;
  if (typeof datasetCanManage === 'string') return datasetCanManage === 'true';
  if (Number.isInteger(userContext.effectivePrivilege)) return userContext.effectivePrivilege <= 1;
  if (Number.isInteger(parsedPrivilege)) return parsedPrivilege <= 1;
  if (Number.isInteger(parsedRole)) return parsedRole <= 1;
  return false;
})();
const notifyPermissionDenied = (message = "Non hai i permessi per modificare i veicoli o gli autisti.") => {
  if (typeof window.notify === 'function') {
    window.notify('warning', 'Permesso negato', message);
  } else {
    alert(message);
  }
};
const wsBaseUrl = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}`;
  console.info('[ws-devicepreview] using base URL:', url);
  return url;
})();

const setMainMapOverlay = (visible) => {
  if (!mainMapOverlay) return;
  mainMapOverlay.classList.toggle('hidden', !visible);
};

const bindVrecOverlayHandler = () => {
  const frameWin = mainMapFrame?.contentWindow;
  if (!frameWin) return;
  try {
    frameWin.addEventListener('vrec', () => {
      setTimeout(() => {
        setMainMapOverlay(false)
      },1500)
    });
  } catch (err) {
    console.warn('[board] unable to bind vrec listener on frame', err);
  }
};

if (mainMapFrame) {
  if (mainMapFrame.contentWindow && mainMapFrame.contentDocument?.readyState === 'complete') {
    bindVrecOverlayHandler();
  } else {
    mainMapFrame.addEventListener('load', bindVrecOverlayHandler);
  }
}
// Fallback in case vrec is dispatched on the parent window
window.addEventListener('vrec', () => setMainMapOverlay(false));

const toggleNavbarSearchSpinner = (isActive) => {
  if (!navbarSearchSpinner) return;
  navbarSearchSpinner.classList.toggle('is-visible', Boolean(isActive));
};

const dispatchMapSearch = (value, { notifyOnEmpty = false } = {}) => {
  const frameWindow = mainMapFrame?.contentWindow;
  if (!frameWindow || typeof frameWindow.searchVehicles !== 'function') {
    toggleNavbarSearchSpinner(false);
    return;
  }

  const response = frameWindow.searchVehicles({ raw: value });
  toggleNavbarSearchSpinner(false);

  if (!response) return null;

  if (response.invalid && value.trim().length) {
    console.warn('[Truckly] Query di ricerca non valida:', value);
  }

  if (
    notifyOnEmpty &&
    value.trim().length &&
    (!response.matches || response.matches.length === 0)
  ) {
    console.info('[Truckly] Nessun veicolo trovato per:', value.trim());
  }

  return response;
};

if (navbarSearchInput) {
  navbarSearchInput.addEventListener('input', (event) => {
    const { value } = event.currentTarget;
    clearTimeout(navbarSearchTimeout);
    const trimmed = value.trim();
    if (!trimmed) {
      dispatchMapSearch("", { notifyOnEmpty: false });
      return;
    }
    toggleNavbarSearchSpinner(true);
    navbarSearchTimeout = setTimeout(() => {
      dispatchMapSearch(value, { notifyOnEmpty: false });
    }, 300);
  });

  navbarSearchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const { value } = event.currentTarget;
    clearTimeout(navbarSearchTimeout);
    if (!value.trim()) {
      dispatchMapSearch("", { notifyOnEmpty: false });
      return;
    }
    toggleNavbarSearchSpinner(true);
    dispatchMapSearch(value, { notifyOnEmpty: true });
  });
}

// mobile search bar toggle
if (navbarSearchBar && navbarSearchToggle) {
  const resetSearchbarForDesktop = () => {
    if (!mobileSearchMedia.matches) {
      navbarSearchBar.classList.remove('shrunk');
    }
  };

  navbarSearchToggle.addEventListener('click', () => {
    if (!mobileSearchMedia.matches) return;
    navbarSearchBar.classList.toggle('shrunk');
  });

  if (navbarSearchClose) {
    navbarSearchClose.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (!mobileSearchMedia.matches) return;
      navbarSearchBar.classList.add('shrunk');
    });
  }

  mobileSearchMedia.addEventListener('change', resetSearchbarForDesktop);
  resetSearchbarForDesktop();
}
import { Table } from "/assets/js/tables.js";

// mappa per tenere i riferimenti 
const buttonListeners = new Map();
const restrictedActions = new Set(['newvehicle', 'newdriver']);

const addButtonListener = (target, button, callback) => {
  const handler = (ev) => {
    if (ev.key !== button) return;
    callback();
  };
  buttonListeners.set(callback, handler); // salva il riferimento
  target.addEventListener('keyup', handler);
};

const removeButtonListener = (target, callback) => {
  const handler = buttonListeners.get(callback);
  if (handler) {
    target.removeEventListener('keyup', handler);
    buttonListeners.delete(callback); // pulizia
  }
};




activeNavs.forEach((an) => {
  an.addEventListener('click', navbarAction);
});

navbarItems.forEach(f => {
  const { action } = f.dataset;
  if (!canManageVehicles && restrictedActions.has(action)) {
    f.classList.add('hidden');
    f.setAttribute('aria-disabled', 'true');
    f.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      notifyPermissionDenied();
    });
    return;
  }
  f.addEventListener('click', (ev) => {
    menuAction(ev);
    const leafletContainer = document.querySelector('.leaflet-container');
    if (!leafletContainer) return;
    leafletContainer.style.zIndex = "1";
  });
});

function menuAction(ev) {
  const { action } = ev.currentTarget.dataset;

  const tgt = ev.currentTarget;

  tgt.parentNode.classList.add('blocked');
  setTimeout(() => {
    tgt.parentNode.classList.remove('blocked');
  }, 500);

  if(arf.includes(action)){
    console.warn(`Handling to rewinder interactions`); 
    return
  }

  if (!canManageVehicles && restrictedActions.has(action)) {
    notifyPermissionDenied();
    return;
  }

  switch (action) {

    case 'quickview':
      document.querySelector('#left_section').classList.toggle('scrolled');
      break;

    case 'vehiclesummary':
      if(!window.tooltipStore) return; 
      document.querySelector('#right_section').classList.toggle('scrolled');
      
      var _vtgt = [...window.tooltipStore.values()][0]; 
      if(!_vtgt){
        window.notify('warning',`Seleziona un veicolo`,`Seleziona un veicolo dalla mpappa`)
      }
      handleVehicleInteraction(_vtgt,{currentTarget: {dataset:{interaction:'fuel'}}},_vtgt.imei); 

      

      break;


    case 'newvehicle':
      toggleRegol('newvehicle')
      break;

    case 'vehicletable':
      toggleBottom();

      break;
    case 'newdriver':
      document.querySelector('.devicepreview').dataset.collapsed = "true"
      toggleRegol('newvdriver');
      break;

    case 'logout':
      location.href = "/logout";




  }
}

function navbarAction(ev) {
  const { action } = ev.currentTarget.dataset;

  switch (action) {
    case 'switchteme':
      switchTheme();
      break;
  }
}

function switchTheme() {
  document.body.classList.toggle('theme-light');
  const dark = !document.body.classList.contains('theme-light');
  const desiredTheme = dark ? 'dark' : 'light';

  // logo navbar
  const navImage = document.querySelector('img[data-image="navbarimage"]');
  if (navImage) {
    navImage.src = `/assets/images/logo_${dark ? 'white' : 'black'}.png`;
  }

  // cambia tutti gli svg
  const svgs = [...document.querySelectorAll('img')].filter(el => el.src.endsWith('.svg'));
  svgs.forEach(svg => {
    let src = svg.src;

    if (dark) {
      if (src.includes('_black.svg')) {
        svg.src = src.replace('_black.svg', '_white.svg');
      }
    } else {
      if (src.includes('_white.svg')) {
        svg.src = src.replace('_white.svg', '_black.svg');
      }
    }
  });

  // sync map styles with current theme (main map + iframe + minimap)
  try {
    if (window.__trucklyMap?.switchTheme) {
      window.__trucklyMap.switchTheme(desiredTheme);
    }
  } catch { }
  try {
    const frame = document.querySelector('iframe#mainmapframe');
    const mapWin = frame?.contentWindow;
    if (mapWin?.__trucklyMap?.switchTheme) {
      mapWin.__trucklyMap.switchTheme(desiredTheme);
    }
  } catch { }
  try {
    if (window.miniMapInstance?.switchTheme) {
      window.miniMapInstance.switchTheme(desiredTheme);
    }
  } catch { }

  localStorage.setItem("theme", dark ? "theme-dark" : "theme-light");
  document.dispatchEvent(new Event('themechange'));
}

// applica preferenza salvata
if (localStorage.getItem('theme') == "theme-light") {
  switchTheme();
}
var menuFeatures = canManageVehicles ? [
  { name: 'Veicolo', tab: 'tab_newvehicle', visible: true },
  { name: 'Autista', tab: 'tab_newvdriver', visible: true },
]: [];


const vehicleTagManager = new TagInputManager("vehicleTags", "vehicleTagsInput", {
  suggestions: ["Telemetria", "GPS", "Temperatura", "CAN", "Rimorchio", "Motore", "Alert"],
  onChange: (tags) => {
    document.getElementById("vehicleTagsHidden").value = JSON.stringify(tags);
  }
});

document.querySelectorAll('a[data-action="overlay_reg_close"]').forEach(x => {
  x.addEventListener('click', (ev) => {
    regol.classList.add('hidden')
  })
})

if (menuFeatures.length) {
  createMenu(
    document.querySelector('#new_data_menu'),
    menuFeatures,
    0,
    'new_item_form',
    '%',
    (ev) => {
      var descriptions = ["Aggiungi veicolo", "Aggiungi autista"];
      document.querySelector('#formtitle').textContent = descriptions[ev]
      if (ev == 0) {
        validateVehicleForm()


      }
      if (ev == 1) {
        document.querySelector('.devicepreview').dataset.collapsed = "true"

      }
    }
  );
} else if (regol) {
  regol.classList.add('hidden');
}



function toggleBottom() {
  bottom.classList.toggle('scrolled')
  var visible = !bottom.classList.contains('scrolled')

  visible ? mainMapFrame.addEventListener('click', toggleBottom) : mainMapFrame.removeEventListener('click', toggleBottom)
  visible ? addButtonListener(document, 'Escape', toggleBottom) : removeButtonListener(document, toggleBottom)

}


function toggleRegol(tab) {
  if (!canManageVehicles) {
    notifyPermissionDenied();
    return;
  }
  regol.classList.toggle('hidden');
  var visible = !regol.classList.contains('hidden')

  var menuTarget = regol.querySelector('#new_data_menu').querySelector(`a[data-tab="tab_${tab}"]`);
  if (visible && menuTarget) {
    menuTarget.click();
  }
  visible ? addButtonListener(document, 'Escape', toggleRegol) : removeButtonListener(document, toggleRegol)

}


let nicknameInput, targaInput, marcaInput, modelloInput;
let simPrefixInput, simNumberInput, simICCIDInput;
let deviceModelInput, codecInput, imeiInput;
let tank1CapacityInput, tank1UnitSelect;
let secondTankToggle, tank2CapacityInput, tank2UnitSelect, secondTankElement, secondTankDetailsGroup;
let submitBtn;


submitBtn = regol.querySelector('.btn.success');
if (!canManageVehicles && submitBtn) {
  submitBtn.setAttribute('aria-disabled', 'true');
}

function syncSecondTankState() {
  if (!secondTankToggle) return;

  const enabled = secondTankToggle.checked;

  [tank2CapacityInput, tank2UnitSelect].forEach((el) => {
    if (!el) return;
    el.disabled = !enabled;
    if (!enabled) {
      el.value = '';
      el.classList.remove('invalid');
    }
  });

  if (!enabled && tank2UnitSelect) {
    tank2UnitSelect.classList.remove('invalid');
  }

  if (secondTankElement) {
    secondTankElement.style.opacity = enabled ? '1' : '0.5';
  }

  if (secondTankDetailsGroup) {
    secondTankDetailsGroup.style.opacity = enabled ? '1' : '0.5';
  }
}

function validateVehicleForm() {
  if (!submitBtn) return;
  if (!canManageVehicles) {
    submitBtn.setAttribute('aria-disabled', 'true');
    return;
  }

  const nicknameValid = nicknameInput.value.trim().length > 0;
  const targaValid = targaInput.value.trim().length > 3;
  const marcaValid = marcaInput.value.trim().length > 0;
  const modelloValid = modelloInput.value.trim().length > 0;
  const imeiValid = imeiRegex.test(imeiInput.value.trim());
  const deviceModelValid = deviceModelInput.value.trim().length > 0;
  const codecValid = codecInput.value.trim().length > 0;
  const simNumberValid = simNumberInput.value.trim().length > 5; // base check
  const simICCIDValid = simICCIDInput.value.trim().length > 8;
  const tank1CapacityValue = parseFloat(tank1CapacityInput.value);
  const tank1HasValue = tank1CapacityInput.value !== '';
  const tank1CapacityValid = !Number.isNaN(tank1CapacityValue) && tank1CapacityValue > 0;
  const tank1UnitValid = tank1UnitSelect.value.trim().length > 0;

  const secondTankEnabled = secondTankToggle.checked;
  const tank2CapacityValue = parseFloat(tank2CapacityInput.value);
  const tank2HasValue = tank2CapacityInput.value !== '';
  const tank2CapacityValid = !secondTankEnabled || (!Number.isNaN(tank2CapacityValue) && tank2CapacityValue > 0);
  const tank2UnitValid = !secondTankEnabled || tank2UnitSelect.value.trim().length > 0;


  if (imeiValid) {
    devicePreview.dataset.collapsed = "false";
    if (!ws || ws.readyState !== 1) {
      ensureMiniMap();
      connectWS(imeiInput.value.trim());
    }
  } else {
    devicePreview.dataset.collapsed = "true";
    destroyMiniMap();
  }

  const allValid = nicknameValid && targaValid && marcaValid && modelloValid &&
    simNumberValid && simICCIDValid &&
    imeiValid && deviceModelValid && codecValid &&
    tank1CapacityValid && tank1UnitValid && tank2CapacityValid && tank2UnitValid;

  submitBtn.setAttribute('aria-disabled', allValid ? 'false' : 'true');

  [
    [targaInput, targaValid],
    [marcaInput, marcaValid],
    [modelloInput, modelloValid],
    [simNumberInput, simNumberValid],
    [simICCIDInput, simICCIDValid],
    [imeiInput, imeiValid],
    [deviceModelInput, deviceModelValid],
    [codecInput, codecValid],
    [tank1CapacityInput, tank1CapacityValid || !tank1HasValue],
    [tank2CapacityInput, tank2CapacityValid || !secondTankEnabled || !tank2HasValue]
  ].forEach(([el, valid]) => {
    el.classList.toggle('invalid', !valid && el.value.trim().length > 0);
  });

  if (tank2UnitSelect) {
    if (secondTankEnabled) {
      tank2UnitSelect.classList.toggle('invalid', !tank2UnitValid);
    } else {
      tank2UnitSelect.classList.remove('invalid');
    }
  }
}


function setupVehicleFormValidation() {
  nicknameInput = regol.querySelector('#vehicleNicknameInput');
  targaInput = regol.querySelector('#vehiclePlateInput');
  marcaInput = regol.querySelector('#vehicleBrandInput');
  modelloInput = regol.querySelector('#vehicleModelInput');
  simPrefixInput = regol.querySelector('#vehicleSimPrefixSelect');
  simNumberInput = regol.querySelector('#vehicleSimNumberInput');
  simICCIDInput = regol.querySelector('#vehicleSimIccidInput');
  deviceModelInput = regol.querySelector('#vehicleDeviceModelInput');
  codecInput = regol.querySelector('#vehicleCodecInput');
  imeiInput = regol.querySelector('#vehicleImeiInput');
  tank1CapacityInput = regol.querySelector('#vehicleTank1CapacityInput');
  tank1UnitSelect = regol.querySelector('#vehicleTank1UnitSelect');
  secondTankToggle = regol.querySelector('#vehicleSecondTankToggle');
  tank2CapacityInput = regol.querySelector('#vehicleTank2CapacityInput');
  tank2UnitSelect = regol.querySelector('#vehicleTank2UnitSelect');
  secondTankElement = regol.querySelector('.tankelement[data-role="second-tank-toggle"]');
  secondTankDetailsGroup = tank2CapacityInput ? tank2CapacityInput.closest('.form-group') : null;

  submitBtn = regol.querySelector('.btn.success');

  const trackedElements = [
    nicknameInput, targaInput, marcaInput, modelloInput,
    simPrefixInput, simNumberInput, simICCIDInput,
    deviceModelInput, codecInput, imeiInput,
    tank1CapacityInput, tank1UnitSelect,
    tank2CapacityInput, tank2UnitSelect
  ].filter(Boolean);

  trackedElements.forEach((el) => {
    el.addEventListener('input', validateVehicleForm);
    el.addEventListener('change', validateVehicleForm);
  });

  if (secondTankToggle) {
    secondTankToggle.addEventListener('change', () => {
      syncSecondTankState();
      validateVehicleForm();
    });
  }

  syncSecondTankState();
  validateVehicleForm(); // init
}


// --- MiniMap con Leaflet ---
let miniMapInstance = null;
let miniMarker = null;

function ensureMiniMap() {
  const minimap = document.querySelector('.minimap');
  if (!minimap) return;

  if (!miniMapInstance) {
    miniMapInstance = new TrucklyMap({
      target: 'minimap',
      theme: "dark",
    });
  }
}
function destroyMiniMap() {
  if (miniMapInstance) {
    if (typeof miniMapInstance.destroy === 'function') {
      miniMapInstance.destroy();
    } else if (miniMapInstance.map?.remove) {
      miniMapInstance.map.remove(); // fallback MapLibre
    }
    miniMapInstance = null;
    ws.close()
    ws = null;
  }
}



// --- WebSocket per IMEI ---
let ws;
function connectWS(imei, trucklyMap) {
  if (ws) {
    ws.close();
    ws = null;
  }

  const endpoint = `${wsBaseUrl}/ws/devicepreview?imei=${imei}`;
  ws = new WebSocket(endpoint);

  ws.onopen = () => console.log("✅ WS connesso per IMEI", imei);

  ws.onmessage = (msg) => {
    try {
      setTimeout(() => {
        document.querySelector('.overlay[data-role="overlaywaitdevice"]').classList.add('hidden');

      }, 1500)
      const data = JSON.parse(msg.data);
      const { Latitude, Longitude } = data.gps;
      if (Latitude && Longitude && miniMapInstance) {
        miniMapInstance.addOrUpdateMarker({
          id: imei,
          lng: Longitude,
          lat: Latitude,
          tooltip: `IMEI ${imei}`
        });
        miniMapInstance.fitToMarkers();

      }

    } catch (e) {
      console.error("Errore parsing WS:", e);
    }
  };

  ws.onclose = () => {
    document.querySelector('.overlay[data-role="overlaywaitdevice"]').classList.remove('hidden');
    console.log("❌ WS chiuso");
  };
}

var submni

submitBtn.addEventListener('click', async () => {
  if (!canManageVehicles) {
    notifyPermissionDenied();
    return;
  }
  const activeTabEl = document.querySelector('#new_data_menu')?.querySelector('a.feature.active');
  if (!activeTabEl) return;
  const activeTab = activeTabEl.dataset.tab || '';


  if (submitBtn.getAttribute('aria-disabled') === 'true') return;
  if (activeTab.includes('vehicle')) {
    registerNewVehicle()
  }

});


async function registerNewVehicle() {

  const payload = {
    nickname: nicknameInput.value.trim(),
    plate: targaInput.value.trim(),
    brand: marcaInput.value.trim(),
    model: modelloInput.value.trim(),
    imei: imeiInput.value.trim(),
    deviceModel: deviceModelInput.value.trim(),
    codec: codecInput.value.trim(),
    tags: JSON.parse(document.getElementById("vehicleTagsHidden").value || "[]")
  };

  const primaryTankCapacity = parseFloat(tank1CapacityInput.value);
  const details = {
    tanks: {
      primary: {
        capacity: Number.isFinite(primaryTankCapacity) ? primaryTankCapacity : null,
        unit: tank1UnitSelect.value.trim()
      }
    }
  };

  if (secondTankToggle.checked) {
    const secondaryTankCapacity = parseFloat(tank2CapacityInput.value);
    if (Number.isFinite(secondaryTankCapacity)) {
      details.tanks.secondary = {
        capacity: secondaryTankCapacity,
        unit: tank2UnitSelect.value.trim()
      };
    }
  }

  details.sim = {
    prefix: simPrefixInput?.value?.trim() || null,
    number: simNumberInput?.value?.trim() || null,
    iccid: simICCIDInput?.value?.trim() || null,
  };

  payload.details = details;
  try {
    console.debug('[vehicles:create][frontend] outgoing payload', {
      imei: payload.imei,
      sim: { iccid: payload.details?.sim?.iccid, number: payload.details?.sim?.number, prefix: payload.details?.sim?.prefix }
    });
  } catch { }

  try {
    const res = await fetch("/dashboard/vehicles/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.status === 403) {
      const payload = await res.json().catch(() => ({}));
      notifyPermissionDenied(payload?.message || "Non hai i permessi per creare o aggiornare veicoli.");
      return;
    }

    if (!res.ok) throw new Error("Errore salvataggio veicolo");

    const data = await res.json();
    window.notify('good', "Veicolo registrato", `Ho aggiunto il veicolo ${payload.nickname} con targa ${payload.plate} al database!`)

    // chiudi overlay e resetta form
    regol.classList.add("hidden");
    nicknameInput.value = "";
    targaInput.value = "";
    marcaInput.value = "";
    modelloInput.value = "";
    imeiInput.value = "";
    simPrefixInput.value = "";
    simNumberInput.value = "";
    simICCIDInput.value = "";
    tank1CapacityInput.value = "";
    tank1UnitSelect.selectedIndex = 0;
    secondTankToggle.checked = false;
    tank2CapacityInput.value = "";
    tank2UnitSelect.selectedIndex = 0;
    syncSecondTankState();
    vehicleTagManager.setTags([]);

    validateVehicleForm();

  } catch (err) {
    console.error("❌ Errore registrazione:", err);
  }
}


setupVehicleFormValidation()


window.vechileTable = new Table('#vehicle_table', [
  { name: 'Nickname' },
  { name: 'Stato' },
  { name: 'Targa' },
  { name: 'Autista' },
  { name: 'Odometro' },
  { name: 'Consumo Medio' },
  { name: 'Prevenzione Rischi' },
  { name: 'Bolla' },
])


window.vechileTable = new Table('#driver_table', [
  { name: 'Nome' },
  { name: 'Cognome' },
  { name: 'Id' },
  { name: 'Ultimo Stato' },
  { name: 'Targa' },
  { name: 'H/Oggi' },
  { name: 'H/Sett.' },
  { name: 'H/Bisett.' },
])


var vehicleMenuFeatures = [
  { name: 'Autisti',      tab: 'tab_drivers', visible: true },
  { name: 'Veicoli',      tab: 'tab_vehicles', visible: true },
  { name: 'Scarico Dati', tab: 'tab_tachosync', visible: true },
  { name: 'Report',       tab: 'tab_reports', visible: true }
]

createMenu(
  document.querySelector('#vehicle_slider_menu'),
  vehicleMenuFeatures,
  1,
  'database_section_slider',
  '%',
  () => {
    console.log("NIGGA")
  }
);


function resizeFont() {
  const vw = window.innerWidth;
  // 1em = 16px di base su browser default
  // qui scaliamo tra 0.75em (12px) e 1em (16px) in base al viewport
  const emSize = Math.max(0.75, (vw / screen.width));
  document.documentElement.style.fontSize = emSize + "em";
}

resizeFont();
window.addEventListener("resize", resizeFont);






document.querySelectorAll('input[type="range"]').forEach(slider => {
  var parent = slider.parentNode
  var updateTimeout = null;
  const slid = slider;
  var numberSibling = parent.querySelector('input[type="number"]');
  if (numberSibling) {
    numberSibling.addEventListener('input', (ev) => {
      const value = ev.currentTarget.value;
      clearTimeout(updateTimeout)
      updateTimeout = setTimeout(() => {
        slid.value = Number(value)
        slid.dispatchEvent(new Event('input'))
      }, 250)
    })
  }
  const updateProgress = () => {
    const percent = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    if (numberSibling) {
      numberSibling.value = slider.value;
    }

    slider.style.setProperty('--progress', `${percent}%`);
  };
  slider.addEventListener('input', updateProgress);
  updateProgress(); // init
});
