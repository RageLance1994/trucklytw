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
};

const STATUS_CLASS_MAP: Record<string, string> = {
  driving: "marker-driving",
  resting: "marker-resting",
  working: "marker-working",
  danger: "marker-danger",
};

const TRUCK_ICON = `
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 17V5a2 2 0 0 1 2-2h8v14" />
    <path d="M14 7h4l3 4v6" />
    <circle cx="7.5" cy="17.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
`;

export function renderVehicleMarker({ vehicle, status }: MarkerContext) {
  const nickname = vehicle?.nickname || vehicle?.name || "";
  const plate =
    typeof vehicle?.plate === "string"
      ? vehicle?.plate
      : vehicle?.plate?.v || vehicle?.plate || "";
  const label = [nickname, plate].filter(Boolean).join(" · ") || "Veicolo";
  const statusClass = status ? STATUS_CLASS_MAP[status] || "" : "";

  return `
    <div class="truckly-marker ${statusClass}">
      <div class="truckly-marker__icon">
        ${TRUCK_ICON}
      </div>
      <div class="truckly-marker__label">${escapeHtml(label)}</div>
    </div>
  `;
}
