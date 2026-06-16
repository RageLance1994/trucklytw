import * as React from "react";

/**
 * Icona del tipo veicolo (auto/furgone/camion/trattore), SVG inline single-color
 * (stroke=currentColor) così eredita il colore dello status. Fallback: camion.
 */
const PATHS: Record<string, React.ReactNode> = {
  auto: (
    <>
      <path d="M5 13l1.6-4.2A2 2 0 0 1 8.5 7.5h7a2 2 0 0 1 1.9 1.3L19 13" />
      <rect x="3" y="13" width="18" height="4" rx="1" />
      <circle cx="7.5" cy="17" r="1.6" />
      <circle cx="16.5" cy="17" r="1.6" />
    </>
  ),
  furgone: (
    <>
      <rect x="3" y="7" width="13" height="8" rx="1" />
      <path d="M16 9h3l2 2.5V15h-5z" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17.5" cy="17" r="1.6" />
    </>
  ),
  camion: (
    <>
      <rect x="3" y="8" width="10" height="7" rx="1" />
      <path d="M13 10h4l4 3v2h-8z" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17.5" cy="17" r="1.6" />
    </>
  ),
  // trattore stradale (motrice): cabina cabover + ralla corta, senza rimorchio
  trattore: (
    <>
      <path d="M19 15V8a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v7" />
      <path d="M12 15H5v-2h3v-1h4" />
      <circle cx="8" cy="17" r="1.7" />
      <circle cx="15.5" cy="17" r="1.7" />
    </>
  ),
};

export function VehicleTypeIcon({
  type,
  className,
}: {
  type?: string | null;
  className?: string;
}) {
  const inner = PATHS[String(type || "camion").toLowerCase()] || PATHS.camion;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {inner}
    </svg>
  );
}
