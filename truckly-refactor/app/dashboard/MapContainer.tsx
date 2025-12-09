"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { TrucklyMap } from "@/lib/truckly-map";
import { WSClient } from "@/lib/ws-client";

type Vehicle = {
  imei: string;
  nickname: string;
  plate: string;
  lat?: number;
  lon?: number;
  status?: string;
  angle?: number;
};

interface MapContainerProps {
  vehicles: Vehicle[];
}

export default function MapContainer({ vehicles }: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<TrucklyMap | null>(null);
  const wsRef = useRef<WSClient | null>(null);
  const tokenRef = useRef<string | undefined>(undefined);
  const vehiclesRef = useRef<Vehicle[]>([]);

  // Initialize map and WS once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const instance = new TrucklyMap({
      container: mapRef.current,
      styleUrl: "/maps/style.json",
      center: [12.5, 42.0],
      zoom: 6,
      onMarkerSelect: (marker) => {
        window.dispatchEvent(new CustomEvent("vchange", { detail: { vehicle: marker.vehicle } }));
      },
    });
    mapInstanceRef.current = instance;

    tokenRef.current = document.cookie
      .split("; ")
      .find((row) => row.startsWith("accessToken="))
      ?.split("=")[1];

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host =
      process.env.NEXT_PUBLIC_WS_HOST ||
      window.location.hostname ||
      "localhost";
    const port =
      process.env.NEXT_PUBLIC_WS_PORT ||
      window.location.port ||
      "5050";
    const baseUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      `${proto}://${host}:${port}/stream`;

    console.log(baseUrl)
    const wsUrl = tokenRef.current
      ? `${baseUrl}?token=${encodeURIComponent(tokenRef.current)}`
      : baseUrl;

    console.log("[WS] connecting to", wsUrl, "token present:", !!tokenRef.current);

    wsRef.current = new WSClient(
      wsUrl,
      [],
      () => console.log("[WS] connected"),
      (payload) => {
        const imei = payload?.imei || payload?.deviceId || payload?.id;
        if (!imei) return;
        const data = payload?.data || payload;
        const gps = data?.gps || data?.data?.gps;

        const vehicle = vehiclesRef.current.find((v) => v.imei === imei);

        mapInstanceRef.current?.addOrUpdateMarker({
          id: imei,
          lng: gps?.longitude ?? gps?.Longitude ?? 0,
          lat: gps?.latitude ?? gps?.Latitude ?? 0,
          vehicle,
          device: data,
          status: data?.status,
          angle: gps?.angle ?? gps?.Angle,
          hasPopup: true,
          tooltip: `<div class="p-3 bg-zinc-900 text-white rounded-md border border-zinc-700">
            <div class="font-semibold text-sm mb-1">${data?.vehicleName || imei}</div>
            <div class="text-xs opacity-80">Targa: ${data?.vehicle?.plate || "N/D"}</div>
            <div class="text-xs opacity-80">Velocità: ${gps?.speed ?? gps?.Speed ?? 0} km/h</div>
          </div>`,
        } as any);
      }
    );

    return () => {
      wsRef.current?.close();
      instance.destroy();
      mapInstanceRef.current = null;
    };
  }, []);

  // Respond to vehicle list changes: redraw and update subscriptions
  useEffect(() => {
    const mapInstance = mapInstanceRef.current;
    if (!mapInstance) return;

    vehiclesRef.current = vehicles;

    mapInstance.clearMarkers();
    vehicles.forEach((v) => {
      mapInstance.addOrUpdateMarker({
        id: v.imei,
        lng: v.lon ?? 0,
        lat: v.lat ?? 0,
        vehicle: v,
        status: v.status as any,
        angle: v.angle,
        hasPopup: true,
        tooltip: `<div class="p-3 bg-zinc-900 text-white rounded-md border border-zinc-700">
          <div class="font-semibold text-sm mb-1">${v.nickname || "Veicolo"}</div>
          <div class="text-xs opacity-80">Targa: ${v.plate || "N/D"}</div>
        </div>`,
      });
    });
    mapInstance.fitToMarkers();

    const imeis = vehicles.map((v) => v.imei).filter(Boolean);
    console.log("[WS] updating subscriptions", imeis);
    if (wsRef.current) {
      wsRef.current.updateSubscriptions(imeis);
    }
  }, [vehicles]);

  return (
    <div className="w-full h-full">
      <div ref={mapRef} id="truckly-map" className="w-full h-full" />
    </div>
  );
}
