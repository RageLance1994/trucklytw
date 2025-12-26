import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { TrucklyMap } from "./lib/truckly-map";
import { WSClient } from "./lib/ws-client";
import { renderVehicleTooltip } from "./lib/templates/vehicleTooltip";
import { renderVehicleMarker } from "./lib/templates/vehicleMarker";
import { WS_URL } from "./config";

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
  const key =
    typeof raw === "string" ? raw.toLowerCase() : raw?.state || raw?.status;
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

const deriveMovementStatus = (data?: any) => {
  const gps = data?.gps || data?.data?.gps || {};
  const io = data?.io || data?.data?.io || {};

  const speed =
    toNumber(
      gps?.Speed ??
        gps?.speed ??
        gps?.speedKmh ??
        gps?.speed_kmh ??
        gps?.speedKmhAvg,
    ) ?? 0;
  const ignition =
    toNumber(
      io?.ignition ??
        io?.Ignition ??
        io?.ign ??
        io?.Ign ??
        io?.ignitionStatus,
    ) ?? 0;

  if (speed > 5) {
    return { status: "In marcia", class: "success" };
  }

  if (speed <= 5 && ignition === 0) {
    return { status: "Fermo", class: "danger" };
  }

  if (speed <= 5 && ignition === 1) {
    return { status: "Quadro acceso", class: "warning" };
  }

  return { status: "Online", class: "" };
};

const computeFuelSummary = (
  io: any = {},
  vehicle: any = {},
  calibratedCapacity?: number | null,
) => {
  const liters = toNumber(
    io.current_fuel ??
      io.currentFuel ??
      io.fuel ??
      io.tank ??
      io.tankLiters,
  );

  const tank1Capacity =
    toNumber(vehicle?.details?.tanks?.primary?.capacity) ?? 0;
  const tank2Capacity =
    toNumber(vehicle?.details?.tanks?.secondary?.capacity) ?? 0;

  const baseCapacity = tank1Capacity + tank2Capacity;
  const effectiveCapacity =
    calibratedCapacity != null && calibratedCapacity > 0
      ? calibratedCapacity
      : baseCapacity;

  const percentFromLiters =
    liters !== null && effectiveCapacity > 0
      ? liters / effectiveCapacity
      : null;

  const rawPercent =
    toNumber(
      io.current_fuel_percent ??
        io.currentFuelPercent ??
        io.fuel_percent ??
        io.tankPerc,
    ) ?? null;

  const percent =
    rawPercent !== null
      ? rawPercent > 1
        ? rawPercent / 100
        : rawPercent
      : percentFromLiters;

  return {
    liters: liters ?? null,
    percent,
    capacity: effectiveCapacity || null,
    tank1Capacity: tank1Capacity || null,
    tank2Capacity: tank2Capacity || null,
    unit: vehicle?.details?.tanks?.unit || "litri",
  };
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

export function MapContainer({ vehicles }: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<TrucklyMap | null>(null);
  const wsRef = useRef<WSClient | null>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const fuelCalibrationRef = useRef<Map<string, number>>(new Map());
  const avlCacheRef = useRef<Map<string, any>>(new Map());

  const renderStaticMarkers = (map: TrucklyMap, list: Vehicle[]) => {
    map.clearMarkers();

    list.forEach((vehicle) => {
      const lat = toNumber(vehicle.lat);
      const lon = toNumber(vehicle.lon);
      if (!isValidCoordinate(lat, lon)) return;

      const statusInfo = deriveStatusInfo(vehicle.status);
      const statusKey =
        typeof vehicle.status === "string"
          ? vehicle.status.toLowerCase()
          : "";

      const markerHtml = renderVehicleMarker({
        vehicle,
        status: statusKey,
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

  // Initialize map once
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
            new CustomEvent("vchange", {
              detail: { vehicle: marker.vehicle },
            }),
          );
        },
      });
      mapInstanceRef.current = instance;

      (window as any).trucklyFlyToVehicle = (vehicle: any) => {
        if (!vehicle || !vehicle.imei || !mapInstanceRef.current) return false;
        const marker = mapInstanceRef.current.markers.get(vehicle.imei);
        if (!marker) return false;
        return mapInstanceRef.current.focusMarker(marker as any, {
          openPopup: true,
          offset: true,
        });
      };

      (window as any).trucklySearchVehicles = (rawQuery: string) => {
        const query = (rawQuery || "").trim();
        (window as any).vehicles = vehiclesRef.current;

        if (!query) {
          return;
        }

        const list = vehiclesRef.current || [];
        let regex: RegExp | null = null;

        try {
          regex = new RegExp(query, "i");
        } catch {
          try {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            regex = new RegExp(escaped, "i");
          } catch {
            regex = null;
          }
        }

        const test = (value: unknown) => {
          if (!regex || value == null) return false;
          regex.lastIndex = 0;
          return regex.test(String(value));
        };

        const target = list.find((v: any) => {
          const plate = v?.plate;
          const nickname = v?.nickname ?? v?.name;
          const company = v?.company ?? v?.customer;
          const tags = Array.isArray(v?.tags) ? v.tags : [];

          if (test(plate) || test(nickname) || test(company)) {
            return true;
          }

          return tags.some((t: any) => test(t));
        });

        if (target && (window as any).trucklyFlyToVehicle) {
          (window as any).trucklyFlyToVehicle(target);
        }
      };

      (window as any).trucklySetMapStyle = (mode: "base" | "light" | "dark" | "satellite") => {
        mapInstanceRef.current?.setBaseStyle(mode);
        try {
          window.localStorage.setItem("truckly:map-style", mode);
        } catch {}
      };

      (window as any).trucklyDrawRoute = (imei: string, history: any[]) => {
        mapInstanceRef.current?.drawRoute(imei, history);
      };
      (window as any).trucklyClearRoute = (imei?: string) => {
        mapInstanceRef.current?.clearRoute(imei);
      };
      (window as any).trucklySetRouteProgress = (imei: string, position: number) => {
        mapInstanceRef.current?.setRouteProgress(imei, position);
      };
      (window as any).trucklyUpdateRouteMarker = (
        imei: string,
        point: any,
        heading?: number,
        statusClass?: string,
      ) => {
        const gps = point?.gps || {};
        const io = point?.io || {};
        const timestamp = point?.timestamp;
        const vehicle = vehiclesRef.current.find((v) => v.imei === imei);
        const calibratedCapacity = fuelCalibrationRef.current.get(imei) ?? null;
        const fuelSummary = computeFuelSummary(io, vehicle, calibratedCapacity);
        const statusInfo = deriveMovementStatus({ gps, io });
        const tooltipHtml = renderVehicleTooltip({
          vehicle,
          device: {
            data: {
              gps: { ...gps, Angle: heading },
              io,
              timestamp,
            },
            gps: { ...gps, Angle: heading },
            io,
            timestamp,
          },
          status: statusInfo,
          fuelSummary,
          formatDate: formatTooltipDate,
        });
        mapInstanceRef.current?.addOrUpdateMarker({
          id: imei,
          lng: gps?.Longitude ?? gps?.longitude ?? gps?.lon,
          lat: gps?.Latitude ?? gps?.latitude ?? gps?.lat,
          vehicle,
          device: { gps, io, timestamp },
          status: statusInfo.class,
          html: null,
          tooltip: tooltipHtml,
          hasPopup: true,
        });
        mapInstanceRef.current?.updateRouteMarker(imei, point, heading, statusClass);
      };
      (window as any).trucklyHideOtherMarkers = (imei: string) => {
        mapInstanceRef.current?.hideOtherMarkers(imei);
      };
      (window as any).trucklyShowAllMarkers = () => {
        mapInstanceRef.current?.showAllMarkers();
      };
      (window as any).trucklyApplyAvlCache = (targetImei?: string) => {
        const entries = targetImei
          ? [[targetImei, avlCacheRef.current.get(targetImei)]]
          : Array.from(avlCacheRef.current.entries());
        entries.forEach(([imei, payload]) => {
          if (!payload || !mapInstanceRef.current) return;
          const data = payload?.data || payload;
          const gps =
            data?.gps ||
            data?.data?.gps ||
            data?.data ||
            data;
          const lat = toNumber(
            gps?.lat ??
              gps?.latitude ??
              gps?.Latitude ??
              gps?.position?.lat ??
              gps?.position?.Latitude,
          );
          const lon = toNumber(
            gps?.lon ??
              gps?.lng ??
              gps?.longitude ??
              gps?.Longitude ??
              gps?.position?.lon ??
              gps?.position?.lng ??
              gps?.position?.Longitude,
          );

          if (!isValidCoordinate(lat, lon)) return;

          const vehicle = vehiclesRef.current.find((v) => v.imei === imei);
          const io = data?.io || data?.data?.io || {};
          const statusInfo = deriveMovementStatus(data);
          const calibratedCapacity =
            fuelCalibrationRef.current.get(imei) ?? null;
          const computedFuel = computeFuelSummary(
            io,
            vehicle,
            calibratedCapacity,
          );
          const rawFuel = data?.fuelSummary || {};
          const fuelSummary = {
            liters:
              toNumber(rawFuel.liters) ??
              computedFuel.liters ??
              null,
            percent:
              toNumber(rawFuel.percent) ??
              computedFuel.percent ??
              null,
            capacity:
              toNumber(rawFuel.capacity) ??
              computedFuel.capacity ??
              null,
          };
          const markerStatus =
            statusInfo.class === "success"
              ? "driving"
              : statusInfo.class === "warning"
              ? "working"
              : statusInfo.class === "danger"
              ? "resting"
              : "";

          const markerHtml = renderVehicleMarker({
            vehicle,
            status: markerStatus,
          });
          const tooltipHtml = renderVehicleTooltip({
            vehicle,
            device: { data },
            status: statusInfo,
            fuelSummary,
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
        });
      };
      (window as any).trucklyStartGeofence = (imei: string) => {
        mapInstanceRef.current?.startGeofence(imei);
      };
      (window as any).trucklyUpdateGeofence = (
        geofenceId: string,
        center: { lng: number; lat: number },
        radiusMeters: number,
      ) => {
        mapInstanceRef.current?.updateGeofence(geofenceId, center, radiusMeters);
      };

      try {
        const saved = window.localStorage.getItem("truckly:map-style") as
          | "base"
          | "light"
          | "dark"
          | "satellite"
          | null;
        if (saved === "base" || saved === "light" || saved === "dark" || saved === "satellite") {
          mapInstanceRef.current?.setBaseStyle(saved);
        }
      } catch {}

      if (vehiclesRef.current.length) {
        renderStaticMarkers(instance, vehiclesRef.current);
      }
    };

    init();

    return () => {
      cancelled = true;
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
  }, []);

  // Manage WebSocket: connect only once we have vehicles, keep subscriptions in sync
  useEffect(() => {
    vehiclesRef.current = vehicles;

    const imeis = vehicles.map((v) => v.imei).filter(Boolean);

    const missingForCalibration = imeis.filter(
      (imei) => !fuelCalibrationRef.current.has(imei),
    );

    if (missingForCalibration.length) {
      (async () => {
        try {
          const dev = import.meta.env.DEV;
          const calibrationUrl = dev
            ? `${window.location.protocol}//${window.location.hostname}:8080/dashboard/calibrate/fuel`
            : "/dashboard/calibrate/fuel";

          const res = await fetch(calibrationUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ imeis: missingForCalibration }),
          });

          if (!res.ok) {
            console.warn(
              "[fuel-calibrate] request failed",
              res.status,
              res.statusText,
            );
            // Best-effort: do not break map if calibration fails
            return;
          }

          const data = await res.json();
          console.log("[fuel-calibrate] response", data);
          if (Array.isArray(data)) {
            data.forEach((entry: any) => {
              const imei = entry?.imei;
              const capacity = toNumber(entry?.capacity ?? entry?.max);
              if (imei && capacity && capacity > 0) {
                fuelCalibrationRef.current.set(imei, capacity);
              }
            });
          }
        } catch {
          // Silent failure: keep existing behaviour
        }
      })();
    }
    // if (!imeis.length) {
    //   // No vehicles → close any existing socket
    //   if (wsRef.current) {
    //     wsRef.current.close();
    //     wsRef.current = null;
    //   }
    //   return;
    // }

    if (!wsRef.current) {
      console.log("[WS] connecting to", WS_URL);
      const initialImeis = [...imeis];
      wsRef.current = new WSClient(
        WS_URL,
        initialImeis,
        () => {
          setTimeout(() => {
            if(wsRef.current){
              wsRef.current.send({action:'subscribe',deviceIds: initialImeis})
            }
          },1500)

        }
        ,
        (payload) => {
          
          const imei = payload?.imei || payload?.deviceId || payload?.id;


          if (!imei) return;
          avlCacheRef.current.set(imei, payload);
          if ((window as any).rewinding) return;
          

          const data = payload?.data || payload;
          console.log(data); 
          const gps =
            data?.gps ||
            data?.data?.gps ||
            data?.data ||
            data;

          const lat = toNumber(
            gps?.lat ??
              gps?.latitude ??
              gps?.Latitude ??
              gps?.position?.lat ??
              gps?.position?.Latitude,
          );
          const lon = toNumber(
            gps?.lon ??
              gps?.lng ??
              gps?.longitude ??
              gps?.Longitude ??
              gps?.position?.lon ??
              gps?.position?.lng ??
              gps?.position?.Longitude,
          );

          if (!isValidCoordinate(lat, lon)) return;

          const vehicle = vehiclesRef.current.find((v) => v.imei === imei);
          const io = data?.io || data?.data?.io || {};
          const statusInfo = deriveMovementStatus(data);

          const calibratedCapacity =
            fuelCalibrationRef.current.get(imei) ?? null;

          const computedFuel = computeFuelSummary(
            io,
            vehicle,
            calibratedCapacity,
          );
          const rawFuel = data?.fuelSummary || {};
          const fuelSummary = {
            liters:
              toNumber(rawFuel.liters) ??
              computedFuel.liters ??
              null,
            percent:
              toNumber(rawFuel.percent) ??
              computedFuel.percent ??
              null,
            capacity:
              toNumber(rawFuel.capacity) ??
              computedFuel.capacity ??
              null,
          };
          const markerStatus =
            statusInfo.class === "success"
              ? "driving"
              : statusInfo.class === "warning"
              ? "working"
              : statusInfo.class === "danger"
              ? "resting"
              : "";

          const markerHtml = renderVehicleMarker({
            vehicle,
            status: markerStatus,
          });
          const tooltipHtml = renderVehicleTooltip({
            vehicle,
            device: { data },
            status: statusInfo,
            fuelSummary,
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
        },
      );
    } else {
      wsRef.current.updateSubscriptions(imeis);
    }
  }, [vehicles]);

  // Close WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleTooltipAction = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const driverButton = target.closest("[data-action='driver']") as HTMLElement | null;
      const fuelButton = target.closest("[data-action='fuel']") as HTMLElement | null;
      const routesButton = target.closest("[data-action='routes']") as HTMLElement | null;
      const geofenceButton = target.closest("[data-action='geofence']") as HTMLElement | null;

      if (!driverButton && !fuelButton && !routesButton && !geofenceButton) return;

      const tooltip = (driverButton || fuelButton || routesButton || geofenceButton)?.closest(".truckly-tooltip") as HTMLElement | null;
      const imei = tooltip?.getAttribute("data-imei") || null;

      if (driverButton) {
        window.dispatchEvent(
          new CustomEvent("truckly:driver-open", {
            detail: { imei },
          }),
        );
        return;
      }

      if (fuelButton) {
        window.dispatchEvent(
          new CustomEvent("truckly:bottom-bar-toggle", {
            detail: { mode: "fuel", imei },
          }),
        );
        return;
      }

      if (routesButton) {
        window.dispatchEvent(
          new CustomEvent("truckly:routes-open", {
            detail: { imei },
          }),
        );
        return;
      }

      if (geofenceButton) {
        (window as any).trucklyStartGeofence?.(imei);
      }
    };

    document.addEventListener("click", handleTooltipAction, true);
    return () => {
      document.removeEventListener("click", handleTooltipAction, true);
    };
  }, []);

  useEffect(() => {
    const handleRoutesOpen = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const imei = detail?.imei || null;
      if (!imei) return;
      (window as any).rewinding = true;
      mapInstanceRef.current?.hideOtherMarkers(imei);
    };

    window.addEventListener("truckly:routes-open", handleRoutesOpen as EventListener);
    return () => {
      window.removeEventListener("truckly:routes-open", handleRoutesOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleMapStyle = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const mode =
        detail?.mode === "base" ||
        detail?.mode === "light" ||
        detail?.mode === "dark" ||
        detail?.mode === "satellite"
          ? detail.mode
          : null;
      if (mode) {
        mapInstanceRef.current?.setBaseStyle(mode);
        try {
          window.localStorage.setItem("truckly:map-style", mode);
        } catch {}
      }
    };

    window.addEventListener("truckly:map-style", handleMapStyle as EventListener);
    return () => {
      window.removeEventListener("truckly:map-style", handleMapStyle as EventListener);
    };
  }, []);

  useEffect(() => {
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
