"use client";

import { useEffect, useRef } from "react";

type Vehicle = {
  imei: string;
  nickname: string;
  plate: string;
};

interface MapContainerProps {
  vehicles: Vehicle[];
}

declare global {
  interface Window {
    maplibregl?: any;
    initMap?: (el: HTMLElement, vehicles: Vehicle[]) => void;
  }
}

export default function MapContainer({ vehicles }: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;
    let mapsScript: HTMLScriptElement | null = null;

    const ensureMaplibre = () =>
      new Promise<void>((resolve, reject) => {
        if (window.maplibregl) return resolve();

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.css";
        document.head.appendChild(link);

        const script = document.createElement("script");
        script.src = "https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load maplibre-gl"));
        document.body.appendChild(script);
      });

    const ensureMapsBundle = () =>
      new Promise<void>((resolve, reject) => {
        if (window.initMap) return resolve();

        mapsScript = document.createElement("script");
        mapsScript.src = "/maps/maps.js";
        mapsScript.async = true;
        mapsScript.onload = () => resolve();
        mapsScript.onerror = () => reject(new Error("Failed to load maps.js"));
        document.body.appendChild(mapsScript);
      });

    const loadMap = async () => {
      try {
        await ensureMaplibre();
        await ensureMapsBundle();

        if (!cancelled && window.initMap && mapRef.current) {
          window.initMap(mapRef.current, vehicles);
        }
      } catch (err) {
        console.error(err);
      }
    };

    loadMap();

    return () => {
      cancelled = true;
      if (mapsScript) {
        mapsScript.remove();
      }
    };
  }, [vehicles]);

  return (
    <div className="w-full h-full">
      <div ref={mapRef} id="map" className="w-full h-full" />
    </div>
  );
}
