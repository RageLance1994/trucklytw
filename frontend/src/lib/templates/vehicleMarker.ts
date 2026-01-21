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
  variant?: "full" | "compact" | "plate" | "name" | "direction";
};

const buildTruckIcon = (strokeColor: string) => `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 17V5a2 2 0 0 1 2-2h8v14" />
    <path d="M14 7h4l3 4v6" />
    <circle cx="7.5" cy="17.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
`;

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
  const strokeColor = "white";
  const truckIcon = buildTruckIcon(strokeColor);
  const arrowIcon = `<svg data-role="marker-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>`;

  const normalizedVariant =
    variant === "plate"
      ? "plateonly"
      : variant === "direction"
      ? "direction"
      : variant === "compact"
      ? "compact"
      : variant === "name"
      ? "nameonly"
      : "complete";

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
    </div>
  `;
}
