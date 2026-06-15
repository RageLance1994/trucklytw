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
  trattore: (
    <>
      <path d="M3 9h6v6H3z" />
      <path d="M9 8v7" />
      <path d="M9 11.5h12" />
      <circle cx="6" cy="17" r="1.6" />
      <circle cx="18" cy="17" r="1.6" />
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
