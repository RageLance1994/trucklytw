import * as React from "react";

/**
 * Brand mark Truckly (piramide wireframe su quadrato arancio), SVG inline.
 * Sostituisce il PNG raster: nitido a qualsiasi dimensione, peso trascurabile.
 */
export function BrandMark({
  className,
  title = "Truckly",
}: {
  className?: string;
  title?: string;
}) {
  const gid = React.useId();
  return (
    <svg
      viewBox="0 0 512 512"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff7a3a" />
          <stop offset="1" stopColor="#ff4910" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="496" height="496" rx="104" fill={`url(#${gid})`} />
      <g
        fill="none"
        stroke="#ffffff"
        strokeWidth="20"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* triangolo esterno */}
        <path d="M256 132 L388 360 L124 360 Z" />
        {/* spigoli interni verso il centro (effetto piramide) */}
        <path d="M256 132 L256 300" />
        <path d="M124 360 L256 300" />
        <path d="M388 360 L256 300" />
      </g>
    </svg>
  );
}
