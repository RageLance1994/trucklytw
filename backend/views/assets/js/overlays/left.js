const listContainer = document.querySelector('[data-role="vehicle-list"]');
const templateEl = document.querySelector('#vehicle-row-template');
const templateHtml = templateEl ? templateEl.innerHTML.trim() : '';
const vehicleMap = new Map();
const frameElement = document.querySelector('iframe#mainmapframe');
let frameWindow = null;
let hasBootstrapFromFrame = false;
import { createMenu } from "/assets/js/menus.js"
const statusClasses = ['success', 'warning', 'danger', 'info', 'muted'];

const formatPlate = (vehicle, io) => {
    if (vehicle?.plate?.v) return vehicle.plate.v;
    return io?.plate || io?.Plate || io?.registration || '--';
};

const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const resolveFuelInfo = (vehicle = {}, io = {}) => {
    const details = vehicle?.details?.tanks || {};
    let tank1Cap = toNumber(details?.primary?.capacity) ?? toNumber(io.tank1Capacity) ?? toNumber(io.tankCapacityPrimary);
    let tank2Cap = toNumber(details?.secondary?.capacity) ?? toNumber(io.tank2Capacity) ?? toNumber(io.tankCapacitySecondary);
    const totalCapacityRaw = toNumber(details?.totalCapacity);
    const hasExplicitTanks = Number.isFinite(tank1Cap) || Number.isFinite(tank2Cap);
    const totalCapacity = hasExplicitTanks
        ? (Number.isFinite(tank1Cap) ? tank1Cap : 0) + (Number.isFinite(tank2Cap) ? tank2Cap : 0)
        : (totalCapacityRaw ?? null);
    if (!Number.isFinite(tank1Cap) && Number.isFinite(totalCapacity)) {
        tank1Cap = totalCapacity;
    }
    const tank1LevelRaw = toNumber(io.tank1 ?? io.tankPrimary ?? io.primaryTankLevel);
    const tank2LevelRaw = toNumber(io.tank2 ?? io.tankSecondary ?? io.secondaryTankLevel);
    const aggregate = toNumber(io.current_fuel ?? io.currentFuel ?? io.fuel ?? io.tank);

    const tank1Level = Number.isFinite(tank1LevelRaw) ? tank1LevelRaw : (Number.isFinite(aggregate) && Number.isFinite(tank1Cap)
        ? Math.min(aggregate, tank1Cap)
        : aggregate ?? null);
    const remaining = Number.isFinite(aggregate) && Number.isFinite(tank1Level)
        ? Math.max(0, aggregate - tank1Level)
        : null;
    const tank2Level = Number.isFinite(tank2LevelRaw) ? tank2LevelRaw : (Number.isFinite(remaining) ? remaining : null);

    return {
        tanks: [
            { capacity: Number.isFinite(tank1Cap) ? tank1Cap : null, level: Number.isFinite(tank1Level) ? tank1Level : null },
            { capacity: Number.isFinite(tank2Cap) ? tank2Cap : null, level: Number.isFinite(tank2Level) ? tank2Level : null }
        ],
        totalCapacity,
        totalLevel: Number.isFinite(aggregate) ? aggregate : null
    };
};

const resolveLocation = (gps = {}) => {
    if (gps?.Location?.Address) return gps.Location.Address;
    if (gps?.Location?.City) return gps.Location.City;
    if (gps?.Location?.Provence) return `${gps.Location.Provence}`;
    return gps?.Address || '--';
};

const resolveDriver = (io = {}) => {
    const card = io?.tachoDriverIds?.driver1 || io?.driver1Id;
    if (card) return card;
    return io?.driverName || '--';
};

const deriveVehicleStatus = (deviceData = {}) => {
    const speed = Number(deviceData?.gps?.Speed ?? deviceData?.gps?.speed);
    const ignition = Number(deviceData?.io?.ignition ?? deviceData?.io?.Ignition);
    if (Number.isFinite(speed) && speed > 5) {
        return { className: 'success', label: 'In marcia' };
    }
    if ((speed == null || speed <= 5) && ignition === 0) {
        return { className: 'danger', label: 'Fermo' };
    }
    if ((speed == null || speed <= 5) && ignition === 1) {
        return { className: 'warning', label: 'Fermo (quadro acceso)' };
    }
    return { className: 'info', label: 'Sconosciuto' };
};

const setFuelTank = (tankEl, levelEl, capacity, level) => {
    if (!tankEl) return;
    const bar = tankEl.querySelector('.prog');
    if (levelEl) {
        levelEl.textContent = Number.isFinite(level) ? `${Math.round(level)}L` : '--';
    }
    if (!bar) return;
    if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(level)) {
        bar.style.width = '0%';
        bar.title = '0L';
        return;
    }
    const normalized = Math.max(0, Math.min(level, capacity));
    const percent = Math.max(0, Math.min(1, normalized / capacity)) * 100;
    bar.style.width = `${percent.toFixed(1)}%`;
    bar.title = `${Math.round(normalized)}L / ${Math.round(capacity)}L`;
};

const buildRow = (payload) => {
    if (!templateHtml || !listContainer) return null;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = templateHtml;
    const row = wrapper.firstElementChild;
    if (!row) return null;
    listContainer.appendChild(row);
    return row;
};

const applyPayloadToRow = (row, payload) => {
    if (!row || !payload) return;
    const { vehicle, device, status = {} } = payload;
    const io = device?.data?.io || {};
    const gps = device?.data?.gps || {};
    const indicator = row.querySelector('[data-role="vehicle-status-indicator"]');
    const nameEl = row.querySelector('[data-role="vehicle-name"]');
    const plateEl = row.querySelector('[data-role="vehicle-plate"]');
    const imeiEl = row.querySelector('[data-role="vehicle-imei"]');
    const locationEl = row.querySelector('[data-role="vehicle-location"]');
    const driverEl = row.querySelector('[data-role="vehicle-driver"]');
    const tank1El = row.querySelector('[data-role="tank-1"]');
    const tank2El = row.querySelector('[data-role="tank-2"]');
    const tank1LevelEl = row.querySelector('[data-role="tank-1-level"]');
    const tank2LevelEl = row.querySelector('[data-role="tank-2-level"]');

    row.dataset.imei = vehicle?.imei || device?.imei || '';

    if (nameEl) nameEl.textContent = vehicle?.nickname || vehicle?.name || `Veicolo ${row.dataset.imei || ''}`;

    if (indicator) {
        statusClasses.forEach(cls => indicator.classList.remove(cls));
        const applied = status?.className && statusClasses.includes(status.className) ? status.className : 'muted';
        indicator.classList.add(applied);
        indicator.title = status?.label || '';
    }
    if (plateEl) plateEl.textContent = formatPlate(vehicle, io);
    if (imeiEl) imeiEl.textContent = vehicle?.imei || device?.imei || '--';
    if (locationEl) locationEl.textContent = resolveLocation(gps);
    if (driverEl) driverEl.textContent = resolveDriver(io);

    const fuelInfo = resolveFuelInfo(vehicle, io);
    const [tank1, tank2] = fuelInfo.tanks;
    setFuelTank(tank1El, tank1LevelEl, tank1.capacity, tank1.level ?? fuelInfo.totalLevel);
    setFuelTank(tank2El, tank2LevelEl, tank2.capacity, tank2.level);
};

const upsertVehicle = (payload) => {
    const imei = payload?.vehicle?.imei || payload?.device?.imei;
    if (!imei || !listContainer) return;
    const normalized = {
        vehicle: payload.vehicle,
        device: payload.device,
        status: payload.status || deriveVehicleStatus(payload.device?.data || {})
    };
    let entry = vehicleMap.get(imei);
    if (!entry) {
        const row = buildRow(normalized);
        entry = { row, payload: null };
        vehicleMap.set(imei, entry);
        if (row) bindRowInteractions(row, imei);
    }
    entry.payload = normalized;
    if (entry.row) {
        applyPayloadToRow(entry.row, normalized);
    }
};

const handleVehicleClick = (imei) => {
    if (!imei) return;
    const target = frameWindow || window;
    const event = new CustomEvent('flyto', { detail: { imei } });
    var timeout = 0; 
    var rightSection = document.querySelector('#right_section')
    if (!rightSection.classList.contains('scrolled')) {
        timeout = 200
        rightSection.classList.add('scrolled')
    }
    setTimeout(() => {
        target.dispatchEvent(event);
    }, timeout)

};

const bindRowInteractions = (row, imei) => {
    if (!row) return;
    const toggle = row.querySelector('[data-action="toggle-menu"]');
    if (toggle) {
        toggle.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const nav = toggle.closest('.navexpand');
            if (!nav) return;
            const current = nav.dataset.shrunk === 'true';
            nav.dataset.shrunk = current ? 'false' : 'true';
        });
    }
    row.addEventListener('click', (ev) => {
        const isNav = ev.target.closest('.navexpand');
        if (isNav) {
            return;
        }
        handleVehicleClick(imei);
    });
};

const handleVrec = (ev) => {
    const vehicles = ev?.detail?.vehicles || [];
    vehicles.forEach((vehicle) => {
        const payload = {
            vehicle,
            device: { imei: vehicle?.imei, data: { io: {}, gps: {} } },
            status: vehicle?.status || null
        };
        upsertVehicle(payload);
    });
    if (vehicles.length) {
        window.vehicles = vehicles;
    }
};

const handleDeviceEvent = (ev) => {
    const device = ev?.detail?.device?.data || ev?.detail?.device;
    const imei = ev?.detail?.device?.imei || device?.imei;
    if (!imei) return;
    const cached = vehicleMap.get(imei);
    const base = cached?.payload || {};
    const vehiclesList = window.vehicles || [];
    const vehicleMeta = base.vehicle || vehiclesList.find((v) => v.imei === imei) || { imei };
    const payload = {
        vehicle: vehicleMeta,
        device: { imei, data: device },
        status: base.status || null
    };
    upsertVehicle(payload);
};

const bindFrameEvents = (targetWindow) => {
    if (!targetWindow) return;
    if (frameWindow) {
        frameWindow.removeEventListener('vrec', handleVrec);
        frameWindow.removeEventListener('deviceEvent', handleDeviceEvent);
    }
    frameWindow = targetWindow;
    frameWindow.addEventListener('vrec', handleVrec);
    frameWindow.addEventListener('deviceEvent', handleDeviceEvent);
    bootstrapFromFrame();
};

const bootstrapFromFrame = () => {
    if (hasBootstrapFromFrame || !frameWindow) return;
    if (!Array.isArray(frameWindow.vehicles) || !frameWindow.vehicles.length) {
        if (!frameWindow.__vrecBroadcasted) return;
    }
    const vehicles = frameWindow.vehicles || [];
    if (vehicles.length) {
        handleVrec({ detail: { vehicles } });
        hasBootstrapFromFrame = true;
    }
};

const initFrameBridge = () => {
    if (!frameElement) return;
    const attempt = () => {
        const targetWindow = frameElement.contentWindow;
        if (!targetWindow) return;
        bindFrameEvents(targetWindow);
    };
    frameElement.addEventListener('load', () => {
        hasBootstrapFromFrame = false;
        attempt();
    });
    attempt();
};

initFrameBridge();

window.addEventListener('vrec', handleVrec);
window.addEventListener('deviceEvent', handleDeviceEvent);
window.addEventListener('deviceUpdate', handleDeviceEvent);



var _smf = [
    { name: 'Veicoli', tab: 'tab_sidevehicles', visible: true },
    { name: 'Autisti', tab: 'tab_sidedrivers', visible: true },
]


createMenu(
    document.querySelector('#left-sidetab-menu'),
    _smf,
    0,
    'lsm_scroller',
    '%',
    (ev) => {
    }
);



document.querySelectorAll('a[data-action="left-close"').forEach((x) => {
    x.addEventListener('click', (ev) => {
        document.querySelector('#left_section').classList.toggle('scrolled')
    })
})