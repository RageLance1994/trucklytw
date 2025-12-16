"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { TrucklyMap } from "@/lib/truckly-map";
import { WSClient } from "@/lib/ws-client";
import { renderVehicleTooltip } from "@/lib/templates/vehicleTooltip";
import { renderVehicleMarker } from "@/lib/templates/vehicleMarker";

type Vehicle = {
  imei: string;
  nickname: string;
  plate: string;
  lat?: number | null;
  lon?: number | null;
  status?: string;
  angle?: number;
};

interface MapContainerProps {
  vehicles: Vehicle[];
}

const formatTooltipDate = (date: Date) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);

const deriveStatusInfo = (raw?: any) => {
  const key = typeof raw === "string" ? raw.toLowerCase() : raw?.state || raw?.status;
  switch (key) {
    case "driving":
      return { status: "Alla guida", class: "success" };
    case "working":
      return { status: "A lavoro", class: "warning" };
    case "resting":
      return { status: "A riposo", class: "" };
    case "danger":
      return { status: "Allarme", class: "danger" };
    default:
      return { status: raw?.label || "Online", class: "" };
  }
};

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const isValidCoordinate = (lat: number | null, lon: number | null) => {
  if (lat === null || lon === null) return false;
  if (lat === 0 && lon === 0) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  return true;
};

export default function MapContainer({ vehicles }: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<TrucklyMap | null>(null);
  const wsRef = useRef<WSClient | null>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);

  const renderStaticMarkers = (map: TrucklyMap, list: Vehicle[]) => {
    map.clearMarkers();

    list.forEach((vehicle) => {
      const lat = toNumber(vehicle.lat);
      const lon = toNumber(vehicle.lon);
      if (!isValidCoordinate(lat, lon)) return;

      const statusInfo = deriveStatusInfo(vehicle.status);
      const markerHtml = renderVehicleMarker({
        vehicle,
        status: statusInfo.class,
      });
      const tooltipHtml = renderVehicleTooltip({
        vehicle,
        device: {
          data: {
            gps: { Latitude: lat, Longitude: lon, Speed: 0 },
            timestamp: new Date().toISOString(),
            io: {},
          },
        },
        status: statusInfo,
        formatDate: formatTooltipDate,
      });

      map.addOrUpdateMarker({
        id: vehicle.imei,
        lng: lon!,
        lat: lat!,
        vehicle,
        status: statusInfo.class,
        angle: vehicle.angle,
        html: markerHtml,
        tooltip: tooltipHtml,
        hasPopup: true,
      });
    });

    if (list.length) {
      map.fitToMarkers();
    }

    const imeis = list.map((v) => v.imei).filter(Boolean);
    if (imeis.length) {
      wsRef.current?.updateSubscriptions(imeis);
    }
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let cancelled = false;
    const init = async () => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      const instance = new TrucklyMap({
        container: mapRef.current,
        styleUrl: "/maps/style.json",
        center: [12.5, 42],
        zoom: 6,
        onMarkerSelect: (marker) => {
          window.dispatchEvent(
            new CustomEvent("vchange", { detail: { vehicle: marker.vehicle } })
          );
        },
      });
      mapInstanceRef.current = instance;
      if (vehiclesRef.current.length) {
        renderStaticMarkers(instance, vehiclesRef.current);
      }

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host || "localhost:3000";
      const wsUrl =
        process.env.NEXT_PUBLIC_WS_URL || `${proto}://${host}/api/stream`;
      console.log("[WS] connecting to", wsUrl);

      wsRef.current = new WSClient(
        wsUrl,
        [],
        () => console.log("[WS] connected"),
        (payload) => {
          const imei = payload?.imei || payload?.deviceId || payload?.id;
          if (!imei) return;
          const data = payload?.data || payload;
          const gps = data?.gps || data?.data?.gps;
          const lat = toNumber(gps?.latitude ?? gps?.Latitude);
          const lon = toNumber(gps?.longitude ?? gps?.Longitude);
          console.log(payload); 
          
          if (!isValidCoordinate(lat, lon)) return;

          const vehicle = vehiclesRef.current.find((v) => v.imei === imei);
          const statusInfo = deriveStatusInfo(data?.status);
          const markerHtml = renderVehicleMarker({
            vehicle,
            status: statusInfo.class,
          });
          const tooltipHtml = renderVehicleTooltip({
            vehicle,
            device: { data },
            status: statusInfo,
            fuelSummary: data?.fuelSummary,
            driverEvents: data?.driverEvents,
            formatDate: formatTooltipDate,
          });

          mapInstanceRef.current?.addOrUpdateMarker({
            id: imei,
            lng: lon!,
            lat: lat!,
            vehicle,
            device: data,
            status: statusInfo.class,
            angle: gps?.angle ?? gps?.Angle,
            html: markerHtml,
            tooltip: tooltipHtml,
            hasPopup: true,
          });
        }
      );
    };

    init();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    vehiclesRef.current = vehicles;
    const mapInstance = mapInstanceRef.current;
    if (!mapInstance) return;
    renderStaticMarkers(mapInstance, vehicles);
  }, [vehicles]);

  return (
    <div className="w-full h-full">
      <div ref={mapRef} id="truckly-map" className="w-full h-full" />
    </div>
  );
}
