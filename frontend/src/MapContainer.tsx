import { useEffect, useRef, useState, useCallback } from "react";
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

const getNavHeight = () => {
  if (typeof window === "undefined") return 64;
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    "--truckly-nav-height",
  );
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 64;
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
  const previewMarkersRef = useRef<Set<string>>(new Set());
  const [isMobileView, setIsMobileView] = useState(false);
  const isMobileViewRef = useRef(false);
  const [markerStyle, setMarkerStyle] = useState<
    "full" | "compact" | "plate" | "name" | "direction"
  >("full");
  const markerStyleRef = useRef(markerStyle);

  useEffect(() => {
    markerStyleRef.current = markerStyle;
  }, [markerStyle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const widthQuery = window.matchMedia("(max-width: 1023px)");
    const pointerQuery = window.matchMedia("(pointer: coarse)");
    const anyPointerQuery = window.matchMedia("(any-pointer: coarse)");

    const update = () => {
      const next = widthQuery.matches || pointerQuery.matches || anyPointerQuery.matches;
      setIsMobileView(next);
      isMobileViewRef.current = next;
    };

    update();
    const handleChange = () => update();
    if (typeof widthQuery.addEventListener === "function") {
      widthQuery.addEventListener("change", handleChange);
      pointerQuery.addEventListener("change", handleChange);
      anyPointerQuery.addEventListener("change", handleChange);
      return () => {
        widthQuery.removeEventListener("change", handleChange);
        pointerQuery.removeEventListener("change", handleChange);
        anyPointerQuery.removeEventListener("change", handleChange);
      };
    }

    widthQuery.addListener(handleChange);
    pointerQuery.addListener(handleChange);
    anyPointerQuery.addListener(handleChange);
    return () => {
      widthQuery.removeListener(handleChange);
      pointerQuery.removeListener(handleChange);
      anyPointerQuery.removeListener(handleChange);
    };
  }, []);

  const buildTooltipHtml = useCallback((vehicle: any, device: any) => {
    const data = device?.data || device || {};
    const gps = data?.gps || data?.data?.gps || data?.data || data || {};
    const io = data?.io || data?.data?.io || {};
    const calibratedCapacity = fuelCalibrationRef.current.get(vehicle?.imei) ?? null;
    const statusInfo = data ? deriveMovementStatus({ gps, io }) : deriveStatusInfo(vehicle?.status);
    const fuelSummary = computeFuelSummary(io, vehicle, calibratedCapacity);
    return renderVehicleTooltip({
      vehicle,
      device: data ? { data } : undefined,
      status: statusInfo,
      fuelSummary,
      driverEvents: data?.driverEvents,
      formatDate: formatTooltipDate,
    });
  }, []);

  const flyToMobileMarker = useCallback((marker: any) => {
    const map = mapInstanceRef.current?.map;
    const lngLat = marker?.getLngLat?.();
    if (!map || !lngLat) return;
    const navHeight = getNavHeight();
    const availableHeight = Math.max(0, window.innerHeight - navHeight);
    const panelHeight = availableHeight * 0.618;
    const offsetY = -(panelHeight / 2);
    const currentZoom = map.getZoom?.();
    map.flyTo({
      center: lngLat,
      zoom: Math.max(Number.isFinite(currentZoom) ? currentZoom : 12, 12.5),
      speed: 1.2,
      curve: 1.4,
      offset: [0, offsetY],
    });
  }, []);

  const handleMobileFocus = useCallback(
    (event: Event) => {
      if (!isMobileViewRef.current) return;
      const detail = (event as CustomEvent)?.detail || {};
      const imei = detail?.imei;
      if (!imei) return;
      const marker = mapInstanceRef.current?.markers.get(imei);
      if (!marker) return;
      flyToMobileMarker(marker);
      const vehicle = marker?.vehicle || vehiclesRef.current.find((v) => v.imei === imei);
      const device = avlCacheRef.current.get(imei)?.data || avlCacheRef.current.get(imei) || null;
      const tooltipHtml = buildTooltipHtml(vehicle, device);
      window.dispatchEvent(
        new CustomEvent("truckly:mobile-marker-open", {
          detail: { imei, vehicle, device, html: tooltipHtml },
        }),
      );
    },
    [buildTooltipHtml, flyToMobileMarker],
  );

  const buildMarkerHtml = (vehicle: any, status?: string, styleOverride?: typeof markerStyle) => {
    const variant = styleOverride || markerStyleRef.current;
    return renderVehicleMarker({ vehicle, status, variant });
  };

  const refreshMarkers = useCallback((styleOverride?: typeof markerStyle) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const resolvedStyle = styleOverride || markerStyleRef.current;
    const variantClass =
      resolvedStyle === "full"
        ? "truckly-marker--complete"
        : resolvedStyle === "compact"
        ? "truckly-marker--compact"
        : resolvedStyle === "plate"
        ? "truckly-marker--plateonly"
        : resolvedStyle === "name"
        ? "truckly-marker--nameonly"
        : "truckly-marker--direction";
    map.markers.forEach((marker, id) => {
      const vehicle = (marker as any).vehicle || null;
      const device = (marker as any).device || null;
      const statusClass = (marker as any).status || "";
      const lngLat = (marker as any).getLngLat?.();
      const lng = lngLat?.lng ?? (marker as any)._lng;
      const lat = lngLat?.lat ?? (marker as any)._lat;
      if (!vehicle || !isValidCoordinate(Number(lat), Number(lng))) return;

      const data = device?.data || device || null;
      const gps =
        data?.gps ||
        data?.data?.gps ||
        data?.data ||
        data ||
        {};
      const statusInfo = data ? deriveMovementStatus(data) : deriveStatusInfo(vehicle.status);
      const markerStatus =
        statusInfo.class === "success"
          ? "driving"
          : statusInfo.class === "warning"
          ? "working"
          : statusInfo.class === "danger"
          ? "resting"
          : "";
      const tooltipHtml = renderVehicleTooltip({
        vehicle,
        device: data ? { data } : undefined,
        status: statusInfo,
        fuelSummary: data?.fuelSummary,
        driverEvents: data?.driverEvents,
        formatDate: formatTooltipDate,
      });

      map.addOrUpdateMarker({
        id,
        lng: Number(lng),
        lat: Number(lat),
        vehicle,
        device: data,
        status: statusInfo.class || statusClass,
        angle: gps?.angle ?? gps?.Angle ?? vehicle?.angle,
        html: buildMarkerHtml(vehicle, markerStatus, styleOverride),
        tooltip: tooltipHtml,
        hasPopup: !isMobileViewRef.current,
      });

      const markerEl = (marker as any).getElement?.() ?? (marker as any)._element;
      if (!markerEl) return;
      const inner = markerEl.querySelector(".truckly-marker") as HTMLElement | null;
      if (inner) {
        inner.classList.remove(
          "truckly-marker--complete",
          "truckly-marker--compact",
          "truckly-marker--plateonly",
          "truckly-marker--nameonly",
          "truckly-marker--direction",
        );
        inner.classList.add(variantClass);
      } else {
        markerEl.innerHTML = buildMarkerHtml(vehicle, markerStatus, styleOverride);
      }
    });
  }, []);

  const handleMarkerStyle = useCallback((event: Event) => {
    const detail = (event as CustomEvent).detail || {};
    const style = detail?.style;
    if (style === "full" || style === "compact" || style === "plate" || style === "name" || style === "direction") {
      setMarkerStyle(style);
      try {
        window.localStorage.setItem("truckly:marker-style", style);
      } catch {}
    }
  }, []);

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

      const markerHtml = buildMarkerHtml(vehicle, statusKey);
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
        hasPopup: !isMobileViewRef.current,
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
              detail: { vehicle: marker.vehicle, device: marker.device },
            }),
          );
          if (isMobileViewRef.current) {
            flyToMobileMarker(marker);
            const tooltipHtml = buildTooltipHtml(marker.vehicle, marker.device);
            window.dispatchEvent(
              new CustomEvent("truckly:mobile-marker-open", {
                detail: {
                  imei: marker.vehicle?.imei,
                  vehicle: marker.vehicle,
                  device: marker.device,
                  html: tooltipHtml,
                },
              }),
            );
          }
        },
      });
      mapInstanceRef.current = instance;
      instance.map.on("click", (event: any) => {
        if (!isMobileViewRef.current) return;
        const target = event?.originalEvent?.target as HTMLElement | null;
        if (target?.closest?.(".custom-marker")) return;
        window.dispatchEvent(new CustomEvent("truckly:mobile-marker-close"));
      });
      window.addEventListener("truckly:mobile-marker-focus", handleMobileFocus as EventListener);

      (window as any).trucklyFlyToVehicle = (vehicle: any) => {
        if (!vehicle || !vehicle.imei || !mapInstanceRef.current) return false;
        const marker = mapInstanceRef.current.markers.get(vehicle.imei);
        if (!marker) return false;
        return mapInstanceRef.current.focusMarker(marker as any, {
          openPopup: !isMobileViewRef.current,
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

      (window as any).trucklySetMarkerStyle = (style: "full" | "compact" | "plate" | "name" | "direction") => {
        setMarkerStyle(style);
        try {
          window.localStorage.setItem("truckly:marker-style", style);
        } catch {}
        refreshMarkers(style);
      };
      (window as any).trucklyForceMarkerClass = (style: "full" | "compact" | "plate" | "name" | "direction") => {
        const variantClass =
          style === "full"
            ? "truckly-marker--complete"
            : style === "compact"
            ? "truckly-marker--compact"
            : style === "plate"
            ? "truckly-marker--plateonly"
            : style === "name"
            ? "truckly-marker--nameonly"
            : "truckly-marker--direction";
        document.querySelectorAll<HTMLElement>(".truckly-marker").forEach((el) => {
          el.classList.remove(
            "truckly-marker--complete",
            "truckly-marker--compact",
            "truckly-marker--plateonly",
            "truckly-marker--nameonly",
            "truckly-marker--direction",
          );
          el.classList.add(variantClass);
        });
      };
      (window as any).trucklyRefreshMarkers = (style?: "full" | "compact" | "plate" | "name" | "direction") => {
        refreshMarkers(style);
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
          angle: heading,
          html: buildMarkerHtml(vehicle, statusInfo.class),
          tooltip: tooltipHtml,
          hasPopup: !isMobileViewRef.current,
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

          const markerHtml = buildMarkerHtml(vehicle, markerStatus);
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
            hasPopup: !isMobileViewRef.current,
          });
        });
      };
      (window as any).trucklyGetAvl = (imei: string) => {
        if (!imei) return null;
        return avlCacheRef.current.get(imei) ?? null;
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
      (window as any).trucklyCreateGeofence = (
        imei: string,
        center: { lng: number; lat: number },
        radiusMeters: number,
        geofenceId?: string,
      ) => {
        return mapInstanceRef.current?.createGeofence(
          imei,
          center,
          radiusMeters,
          geofenceId,
        );
      };
      (window as any).trucklyShowOnlyMarkers = (imeis: string[]) => {
        mapInstanceRef.current?.showOnlyMarkers(imeis);
      };
      (window as any).trucklyFlyToLocation = (
        center: { lng: number; lat: number },
        zoom?: number,
      ) => {
        const map = mapInstanceRef.current?.map;
        if (!map || !center) return;
        const currentZoom = map.getZoom?.();
        const nextZoom = Number.isFinite(zoom)
          ? Number(zoom)
          : Math.max(Number.isFinite(currentZoom) ? currentZoom : 12, 12.5);
        map.flyTo({
          center,
          zoom: nextZoom,
          speed: 1.2,
          curve: 1.4,
        });
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

      try {
        const savedMarker = window.localStorage.getItem("truckly:marker-style") as
          | "full"
          | "compact"
          | "plate"
          | "name"
          | "direction"
          | null;
        if (savedMarker && ["full", "compact", "plate", "name", "direction"].includes(savedMarker)) {
          setMarkerStyle(savedMarker);
        }
      } catch {}

      window.addEventListener("truckly:marker-style", handleMarkerStyle as EventListener);

      if (vehiclesRef.current.length) {
        renderStaticMarkers(instance, vehiclesRef.current);
      }
    };

    init();

    return () => {
      cancelled = true;
      window.removeEventListener("truckly:marker-style", handleMarkerStyle as EventListener);
      window.removeEventListener("truckly:mobile-marker-focus", handleMobileFocus as EventListener);
      delete (window as any).trucklyRefreshMarkers;
      delete (window as any).trucklyForceMarkerClass;
      delete (window as any).trucklyCreateGeofence;
      delete (window as any).trucklyShowOnlyMarkers;
      delete (window as any).trucklyFlyToLocation;
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const getPreviewId = (imei: string) => `preview:${imei}`;

    const upsertPreviewMarker = (payload: any) => {
      const map = mapInstanceRef.current;
      if (!map) return;
      const imei = payload?.imei || payload?.deviceId || payload?.id;
      if (!imei) return;

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

      const vehicle =
        payload?.vehicle ||
        ({
          imei,
          nickname: payload?.nickname,
          plate: payload?.plate,
        } as any);

      const io = data?.io || data?.data?.io || {};
      const statusInfo = deriveMovementStatus({ gps, io });
      const markerStatus = statusInfo.class || "warning";

      const markerHtml = buildMarkerHtml(vehicle, markerStatus);
      const tooltipHtml = renderVehicleTooltip({
        vehicle,
        device: { data },
        status: statusInfo,
        formatDate: formatTooltipDate,
      });

      const previewId = getPreviewId(imei);
      const isNew = !previewMarkersRef.current.has(previewId);
      const marker = map.addOrUpdateMarker({
        id: previewId,
        lng: lon!,
        lat: lat!,
        vehicle,
        device: data,
        status: markerStatus,
        angle: gps?.angle ?? gps?.Angle,
        html: markerHtml,
        tooltip: tooltipHtml,
        hasPopup: !isMobileViewRef.current,
        classlist: "custom-marker preview-marker",
      });

      previewMarkersRef.current.add(previewId);
      if (isNew && marker) {
        map.focusMarker(marker as any, { openPopup: !isMobileViewRef.current, offset: true });
      }
    };

    const clearPreviewMarker = (imei?: string) => {
      const map = mapInstanceRef.current;
      if (!map) return;
      if (imei) {
        const id = getPreviewId(imei);
        if (previewMarkersRef.current.has(id)) {
          map.removeMarker(id);
          previewMarkersRef.current.delete(id);
        }
        return;
      }
      previewMarkersRef.current.forEach((id) => {
        map.removeMarker(id);
      });
      previewMarkersRef.current.clear();
    };

      (window as any).trucklyPreviewVehicle = upsertPreviewMarker;
      (window as any).trucklyClearPreviewVehicle = clearPreviewMarker;

      return () => {
        delete (window as any).trucklyPreviewVehicle;
        delete (window as any).trucklyClearPreviewVehicle;
        clearPreviewMarker();
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

          const markerHtml = buildMarkerHtml(vehicle, markerStatus);
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
            hasPopup: !isMobileViewRef.current,
          });
          if (isMobileViewRef.current) {
            window.dispatchEvent(
              new CustomEvent("truckly:mobile-marker-update", {
                detail: { imei, html: tooltipHtml, vehicle, device: data },
              }),
            );
          }
        },
      );
    } else {
      wsRef.current.updateSubscriptions(imeis);
    }
  }, [vehicles]);

  useEffect(() => {
    refreshMarkers();
  }, [markerStyle, vehicles, refreshMarkers]);

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
        const avlPayload = imei ? avlCacheRef.current.get(imei) : null;
        const device = avlPayload?.data || avlPayload || null;
        window.dispatchEvent(
          new CustomEvent("truckly:driver-open", {
            detail: { imei, device },
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
    <div className="w-full h-full" data-mobile-view={isMobileView ? "true" : "false"}>
      <div ref={mapRef} id="truckly-map" className="w-full h-full" />
    </div>
  );
}
