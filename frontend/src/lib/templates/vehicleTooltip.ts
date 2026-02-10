type FuelSummary = {
  liters?: number;
  percent?: number;
  capacity?: number;
};

type StatusInfo = {
  status?: string;
  class?: string;
};

type DriverEvent = {
  to_state_name?: keyof typeof DRIVER_STATUSES;
};

export type TooltipContext = {
  vehicle?: Record<string, any>;
  device?: Record<string, any>;
  status?: StatusInfo;
  fuelSummary?: FuelSummary;
  driverEvents?: DriverEvent[];
  formatDate?: (date: Date) => string;
};

const DRIVER_STATUSES = {
  driving: { translate: "Alla guida", class: "success" },
  working: { translate: "A lavoro", class: "warning" },
  resting: { translate: "A riposo", class: "" },
  unlogged: { translate: "Sloggato", class: "" },
} as const;

const defaultFormatDate = (date: Date) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const SECTION_STYLES = `
<style>
  .truckly-tooltip {
    font-family: "Inter", "Segoe UI", system-ui, sans-serif;
    font-size: 12px;
    background: #0a0a0a;
    color: #f8fafc;
    border-radius: 18px;
    padding: 12px;
    min-width: min(380px, 75vw);
    max-width: min(380px, 75vw);
    box-shadow: 0 25px 60px rgba(0,0,0,0.35);
    border: none;
  }
  .truckly-tooltip__header {
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid rgba(248,250,252,0.08);
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
  .truckly-tooltip__header h1 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    flex: 1;
  }
  .truckly-pill {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    background: transparent;
    border: 1px solid rgba(148,163,184,0.4);
    color: rgba(248,250,252,0.9);
  }
  .truckly-pill.success {
    background: var(--tv-green, #22c55e);
    border-color: transparent;
    color: #ffffff;
  }
  .truckly-pill.warning {
    background: var(--tv-yellow, #eab308);
    border-color: transparent;
    color: #0b1120;
  }
  .truckly-pill.danger {
    background: var(--tv-red, #ef4444);
    border-color: transparent;
    color: #ffffff;
  }
  .truckly-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid rgba(248,250,252,0.08);
    padding-bottom: 12px;
    margin-bottom: 12px;
  }
  .truckly-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: rgba(248,250,252,0.8);
  }
  .truckly-row svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .truckly-card {
    background: rgba(248,250,252,0.03);
    border: 1px solid rgba(248,250,252,0.08);
    border-radius: 12px;
    padding: 10px 12px;
  }
  .truckly-card--tight {
    display: grid;
    gap: 4px;
  }
  .truckly-card h2 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148,163,184,0.9);
    margin: 0 0 6px 0;
  }
  .truckly-card strong {
    font-size: 14px;
  }
  .truckly-actions {
    display: grid;
    grid-template-columns: repeat(5, minmax(0,1fr));
    gap: 6px;
  }
  .truckly-action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0 9px;
    border-radius: 12px;
    background: rgba(248,250,252,0.04);
    border: 1px solid rgba(248,250,252,0.06);
    color: rgba(248,250,252,0.9);
    font-size: 9px;
    line-height: 1.15;
    text-align: center;
    cursor: pointer;
    outline: none;
    width: 100%;
  }
  .truckly-action-icon {
    width: 18px;
    height: 18px;
  }
  .truckly-action-btn span:last-child {
    max-width: 56px;
    white-space: normal;
    word-break: break-word;
  }
</style>
`;

const icons = {
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  gps: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="10" r="3"/><path d="M12 2v2m0 16v2m8-10h2M2 10H4"/><circle cx="12" cy="10" r="9"/></svg>`,
  location: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-6.58-7-11.5A7 7 0 0 1 12 2a7 7 0 0 1 7 7.5C19 14.42 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
  speed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 16l8-8"/><path d="M9 2h6"/><path d="M4 8h4"/><path d="M16 8h4"/><path d="M5 12h2"/><path d="M17 12h2"/><path d="M6 16h12"/><path d="M9 22h6"/></svg>`,
  route: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16"/><path d="M4 12h8"/><path d="M4 20h16"/><circle cx="16" cy="12" r="3"/></svg>`,
  fuel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 2h6v20H6z"/><path d="M18 7v13a2 2 0 0 1-2 2h-4"/><path d="M20 7l-4-4"/></svg>`,
  driver: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z"/></svg>`,
  geofence: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>`,
};

export function renderVehicleTooltip({
  vehicle = {},
  device = {},
  status = {},
  fuelSummary,
  driverEvents = [],
  formatDate = defaultFormatDate,
}: TooltipContext): string {
  const gps = device?.data?.gps || device?.gps || {};
  const timestamp = device?.data?.timestamp || device?.timestamp;
  const lastUpdate = timestamp ? formatDate(new Date(timestamp)) : "N/D";
  const hasDriver = Boolean(device?.data?.io?.tachoDriverIds);
  const driverStatusKey = driverEvents.at(-1)?.to_state_name;
  const driverStatus = driverStatusKey
    ? DRIVER_STATUSES[driverStatusKey] || DRIVER_STATUSES.unlogged
    : DRIVER_STATUSES.unlogged;

  const summary = fuelSummary || {};
  const litersNum = Number(summary.liters);
  const percentNum = Number(summary.percent);
  const capacityNum = Number(summary.capacity);

  const fuelLiters = Number.isFinite(litersNum)
    ? litersNum.toFixed(1)
    : "-";
  const fuelPercent = Number.isFinite(percentNum)
    ? `${(percentNum * 100).toFixed(1)}%`
    : "-";
  const capacity = Number.isFinite(capacityNum)
    ? `${capacityNum.toFixed(1)} L`
    : "";

  const plate =
    typeof vehicle.plate === "string"
      ? vehicle.plate
      : vehicle.plate?.v || vehicle.plate?.value || "-";

  const lat = gps.latitude ?? gps.Latitude ?? "N/D";
  const lon = gps.longitude ?? gps.Longitude ?? "N/D";
  const address = gps?.Location?.Address;
  const city = gps?.Location?.City;
  const zip = gps?.Location?.Zip;
  const province = gps?.Location?.Provence;
  const speed = gps?.Speed ?? gps?.speed ?? 0;

  const actions = [
    { label: "Percorsi", icon: icons.route, action: "routes" },
    { label: "Carburante", icon: icons.fuel, action: "fuel" },
    { label: "Autista", icon: icons.driver, action: "driver" },
    { label: "Alert", icon: icons.alert, action: "alert" },
    { label: "GeoFence", icon: icons.geofence, action: "geofence" },
  ];

  const driverBlock = hasDriver
    ? `<div class="truckly-card">
        <h2>Autista</h2>
        <div class="truckly-row" style="justify-content:space-between;">
          <strong>${escapeHtml(device?.data?.io?.driver1Id || "-")}</strong>
          <span class="truckly-pill ${driverStatus.class}">
            ${driverStatus.translate}
          </span>
        </div>
      </div>`
    : "";

  return `
    ${SECTION_STYLES}
    <div class="truckly-tooltip" data-imei="${escapeHtml(vehicle.imei || "")}">
      <div class="truckly-tooltip__header">
        <h1>${escapeHtml(vehicle.nickname || vehicle.name || "-")}${plate ? ` · ${escapeHtml(plate)}` : ""}</h1>
        <span class="truckly-pill ${status.class || ""}">
          ${escapeHtml(status.status || "N/D")}
        </span>
      </div>

      <div class="truckly-grid">
        <div class="truckly-row">${icons.clock} Ultimo aggiornamento: <strong>${escapeHtml(
          lastUpdate
        )}</strong></div>
        <div class="truckly-row">${icons.gps} Lat: ${escapeHtml(
          lat
        )} · Lon: ${escapeHtml(lon)}</div>
        <div class="truckly-row">
          ${icons.location}
          ${
            address
              ? `${escapeHtml(address)} · (${escapeHtml(zip)} - ${escapeHtml(
                  province
                )}) ${escapeHtml(city)}`
              : "Indirizzo non disponibile"
          }
        </div>
        <div class="truckly-row">${icons.speed} Velocità: ${escapeHtml(
          String(speed)
        )} km/h</div>
      </div>

      <div class="truckly-grid" style="border-bottom:none;margin-bottom:0;padding-bottom:0">
        <div class="truckly-card">
          <h2>Targa</h2>
          <strong>${escapeHtml(plate)}</strong>
        </div>
        <div class="truckly-card truckly-card--tight">
          <h2>Serbatoio</h2>
          <div class="truckly-row" style="justify-content:space-between;">
            <strong>${escapeHtml(String(fuelLiters))}</strong>
            <span>${escapeHtml(capacity)}</span>
          </div>
          <div style="font-size:12px;color:rgba(248,250,252,0.7);">${escapeHtml(
            fuelPercent
          )}</div>
        </div>
        ${driverBlock}
      </div>

      <div class="truckly-actions" style="margin-top:14px;">
        ${actions
          .map(
            (action) => `
              <button type="button" class="truckly-action-btn" data-action="${action.action}">
                <span class="truckly-action-icon">${action.icon}</span>
                <span>${action.label}</span>
              </button>`
          )
          .join("")}
      </div>
    </div>
  `;
}
