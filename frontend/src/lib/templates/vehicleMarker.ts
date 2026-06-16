const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type MarkerContext = {
  vehicle?: Record<string, any>;
  status?: string;
  variant?: "pin" | "full" | "compact" | "plate" | "name" | "direction";
};

const svgWrap = (strokeColor: string, inner: string) => `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${inner}
  </svg>
`;

// auto = car silhouette
const buildCarIcon = (strokeColor: string) =>
  svgWrap(
    strokeColor,
    `
    <path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13" />
    <path d="M3 13h18v4a1 1 0 0 1-1 1h-1" />
    <path d="M6 18H5a1 1 0 0 1-1-1v-4" />
    <circle cx="7.5" cy="17.5" r="2" />
    <circle cx="16.5" cy="17.5" r="2" />
  `
  );

// furgone = van
const buildVanIcon = (strokeColor: string) =>
  svgWrap(
    strokeColor,
    `
    <path d="M3 16V6a1 1 0 0 1 1-1h10v11" />
    <path d="M14 8h3.5l2.5 3.5V16" />
    <path d="M4 16h2" />
    <path d="M18 16h2" />
    <circle cx="7.5" cy="17.5" r="2" />
    <circle cx="16.5" cy="17.5" r="2" />
  `
  );

// camion = box truck
const buildTruckIcon = (strokeColor: string) =>
  svgWrap(
    strokeColor,
    `
    <path d="M3 17V5a2 2 0 0 1 2-2h8v14" />
    <path d="M14 7h4l3 4v6" />
    <circle cx="7.5" cy="17.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  `
  );

// trattore = motrice (road tractor): cabina cabover corta + ralla, senza rimorchio
const buildTractorIcon = (strokeColor: string) =>
  svgWrap(
    strokeColor,
    `
    <path d="M19 15V8a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v7" />
    <path d="M12 15H5v-2h3v-1h4" />
    <circle cx="8" cy="17" r="1.9" />
    <circle cx="15.5" cy="17" r="1.9" />
  `
  );

const VEHICLE_ICON_BUILDERS: Record<string, (strokeColor: string) => string> = {
  auto: buildCarIcon,
  furgone: buildVanIcon,
  camion: buildTruckIcon,
  trattore: buildTractorIcon,
};

const buildVehicleIcon = (vehicleType: unknown, strokeColor: string) => {
  const key = typeof vehicleType === "string" ? vehicleType.toLowerCase() : "";
  const builder = VEHICLE_ICON_BUILDERS[key] || buildTruckIcon;
  return builder(strokeColor);
};

export function renderVehicleMarker({ vehicle, status, variant = "full" }: MarkerContext) {
  const nickname = vehicle?.nickname || vehicle?.name || "";
  const plate =
    typeof vehicle?.plate === "string"
      ? vehicle?.plate
      : vehicle?.plate?.v || vehicle?.plate || "";
  const label = [nickname, plate].filter(Boolean).join(" - ") || "Veicolo";

  const normalized = (status || "").toString().toLowerCase();

  let tvColor = "";
  if (
    normalized === "driving" ||
    normalized === "moving" ||
    normalized === "success"
  ) {
    tvColor = "var(--tv-green, #22c55e)";
  } else if (
    normalized === "working" ||
    normalized === "idle_on" ||
    normalized === "warning"
  ) {
    tvColor = "var(--tv-yellow, #eab308)";
  } else if (
    normalized === "resting" ||
    normalized === "idle_off" ||
    normalized === "danger" ||
    normalized === "fermo"
  ) {
    tvColor = "var(--tv-red, #ef4444)";
  }

  const iconStyle = tvColor ? `style="background:${tvColor};"` : "";
  const pinColor = tvColor || "#64748b";
  const strokeColor = "white";
  const truckIcon = buildVehicleIcon(vehicle?.vehicleType, strokeColor);
  const arrowIcon = `<svg data-role="marker-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>`;

  const normalizedVariant =
    variant === "pin"
      ? "pin"
      : variant === "plate"
      ? "plateonly"
      : variant === "direction"
      ? "direction"
      : variant === "compact"
      ? "compact"
      : variant === "name"
      ? "nameonly"
      : "complete";

  if (normalizedVariant === "pin") {
    return `
      <div class="truckly-marker truckly-marker--pin" style="--pin-color:${pinColor};">
        <div class="truckly-marker__icon" ${iconStyle}>
          ${truckIcon}
        </div>
        <span class="truckly-marker__hover-plate">${escapeHtml(plate || "-")}</span>
        <span class="truckly-marker__orbit" data-role="marker-arrow">
          <i class="fa fa-caret-up truckly-marker__arrow-caret" aria-hidden="true"></i>
        </span>
        <span class="truckly-marker__tail" aria-hidden="true"></span>
      </div>
    `;
  }

  return `
    <div class="truckly-marker truckly-marker--${normalizedVariant}">
      <div class="truckly-marker__icon" ${iconStyle}>
        ${truckIcon}
      </div>
      <div class="truckly-marker__text">
        <span class="truckly-marker__nickname">${escapeHtml(nickname || "-")}</span>
        <span class="truckly-marker__plate">${escapeHtml(plate || "-")}</span>
      </div>
      <span class="truckly-marker__arrow">${arrowIcon}</span>
      <span class="truckly-marker__tail" aria-hidden="true"></span>
    </div>
  `;
}
