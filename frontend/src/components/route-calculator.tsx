import React from "react";
import { API_BASE_URL } from "../config";

type LngLat = { lng: number; lat: number };

type GeocodeCandidate = {
  label: string;
  lat: number;
  lng: number;
};

type VehicleCandidate = {
  imei?: string;
  nickname?: string;
  name?: string;
  plate?: string | { v?: string; value?: string } | null;
  lat?: number | null;
  lon?: number | null;
  lng?: number | null;
};

type RouteResponse = {
  provider?: string;
  hasTraffic?: boolean;
  distanceKm?: number | null;
  durationMin?: number | null;
  durationTrafficMin?: number | null;
  geometry?: any;
};

type RouteCalculatorProps = {
  selectedVehicleImei?: string | null;
  compact?: boolean;
};

const LOCATION_CACHE_KEY = "truckly:route-location-cache:v1";
const LOCATION_CACHE_LIMIT = 60;
const AUTOCOMPLETE_DEBOUNCE_MS = 2200;

const toFiniteNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeQueryKey = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const parseCoordInput = (value: string): LngLat | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const lat = toFiniteNumber(parts[0]);
  const lng = toFiniteNumber(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const decodePolyline = (encoded: string): [number, number][] => {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }
  return coordinates;
};

const normalizeRouteGeometry = (geometry: any) => {
  if (!geometry) return null;
  if (geometry?.type === "LineString" && Array.isArray(geometry?.coordinates)) {
    return geometry;
  }
  if (geometry?.type === "EncodedPolyline" && typeof geometry?.polyline === "string") {
    const coordinates = decodePolyline(geometry.polyline);
    if (coordinates.length < 2) return null;
    return { type: "LineString", coordinates };
  }
  return null;
};

const getVehicleOrigin = (imei?: string | null): LngLat | null => {
  if (!imei || typeof window === "undefined") return null;
  const raw = (window as any).trucklyGetAvl?.(imei);
  const data = raw?.data || raw || {};
  const gps = data?.gps || data?.data?.gps || {};
  const lat = toFiniteNumber(gps?.Latitude ?? gps?.latitude ?? gps?.lat);
  const lng = toFiniteNumber(gps?.Longitude ?? gps?.longitude ?? gps?.lon ?? gps?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const extractPlate = (plate: VehicleCandidate["plate"]) => {
  if (!plate) return "";
  if (typeof plate === "string") return plate;
  return String(plate?.v || plate?.value || "");
};

const getVehiclesFromWindow = (): VehicleCandidate[] => {
  if (typeof window === "undefined") return [];
  const fromMain = Array.isArray((window as any).trucklyVehicles) ? (window as any).trucklyVehicles : [];
  return fromMain;
};

const getVehicleCandidates = (): GeocodeCandidate[] => {
  const vehicles = getVehiclesFromWindow();
  const list = vehicles
    .map((vehicle) => {
      const imei = String(vehicle?.imei || "").trim();
      if (!imei) return null;
      const live = (window as any).trucklyGetAvl?.(imei);
      const data = live?.data || live || {};
      const gps = data?.gps || data?.data?.gps || {};
      const lat = toFiniteNumber(gps?.Latitude ?? gps?.latitude ?? vehicle?.lat);
      const lng = toFiniteNumber(gps?.Longitude ?? gps?.longitude ?? gps?.lng ?? vehicle?.lon ?? vehicle?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const name = String(vehicle?.nickname || vehicle?.name || "Veicolo").trim();
      const plate = extractPlate(vehicle?.plate).trim();
      const label = plate ? `${name} | ${plate}` : name;
      return { label, lat, lng };
    })
    .filter(Boolean) as GeocodeCandidate[];

  const dedup = new Map<string, GeocodeCandidate>();
  list.forEach((entry) => {
    const key = `${entry.lat}:${entry.lng}:${entry.label}`;
    dedup.set(key, entry);
  });
  return Array.from(dedup.values()).slice(0, 20);
};

export function RouteCalculator({
  selectedVehicleImei,
  compact = false,
}: RouteCalculatorProps) {
  const locationCacheRef = React.useRef<Record<string, GeocodeCandidate>>({});
  const queryCacheRef = React.useRef<Record<string, GeocodeCandidate[]>>({});
  const suppressOriginAutocompleteRef = React.useRef(false);
  const suppressDestinationAutocompleteRef = React.useRef(false);
  const [originText, setOriginText] = React.useState("");
  const [destinationText, setDestinationText] = React.useState("");
  const [originPoint, setOriginPoint] = React.useState<LngLat | null>(null);
  const [destinationPoint, setDestinationPoint] = React.useState<LngLat | null>(null);
  const [originCandidates, setOriginCandidates] = React.useState<GeocodeCandidate[]>([]);
  const [destinationCandidates, setDestinationCandidates] = React.useState<GeocodeCandidate[]>([]);
  const [loadingOrigin, setLoadingOrigin] = React.useState(false);
  const [loadingDestination, setLoadingDestination] = React.useState(false);
  const [routing, setRouting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RouteResponse | null>(null);

  const provider = "google";

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCATION_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      const next: Record<string, GeocodeCandidate> = {};
      Object.entries(parsed).forEach(([key, item]) => {
        const label = String((item as any)?.label || "").trim();
        const lat = Number((item as any)?.lat);
        const lng = Number((item as any)?.lng);
        if (!key || !label || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        next[key] = { label, lat, lng };
      });
      locationCacheRef.current = next;
    } catch {
      // ignore invalid cache
    }
  }, []);

  const persistLocationCache = React.useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const entries = Object.entries(locationCacheRef.current || {});
      const trimmedEntries = entries.slice(-LOCATION_CACHE_LIMIT);
      const payload = Object.fromEntries(trimmedEntries);
      window.localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }, []);

  const rememberLocation = React.useCallback((query: string, candidate: GeocodeCandidate) => {
    const key = normalizeQueryKey(query);
    if (!key) return;
    locationCacheRef.current[key] = candidate;
    persistLocationCache();
  }, [persistLocationCache]);

  const geocode = async (
    query: string,
    setter: (items: GeocodeCandidate[]) => void,
    setLoading: (value: boolean) => void,
  ) => {
    const key = normalizeQueryKey(query);
    if (!key) {
      setter([]);
      return;
    }

    const cachedQuery = queryCacheRef.current[key];
    if (Array.isArray(cachedQuery) && cachedQuery.length) {
      setter(cachedQuery);
      return;
    }

    const cachedLocation = locationCacheRef.current[key];
    if (cachedLocation) {
      const immediate = [cachedLocation];
      queryCacheRef.current[key] = immediate;
      setter(immediate);
      return;
    }

    const direct = parseCoordInput(query);
    if (direct) {
      setter([{ label: `${direct.lat}, ${direct.lng}`, ...direct }]);
      return;
    }
    if (!query || query.trim().length < 3) {
      setter([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/nav/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: query.trim(), provider }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || `Errore geocoding (${res.status})`);
      }
      const list = Array.isArray(payload?.candidates) ? payload.candidates : [];
      const normalized = list
        .map((item: any) => ({
          label: String(item?.label || ""),
          lat: Number(item?.lat),
          lng: Number(item?.lng),
        }))
        .filter((item: GeocodeCandidate) => item.label && Number.isFinite(item.lat) && Number.isFinite(item.lng));
      queryCacheRef.current[key] = normalized;
      setter(normalized);
    } catch (err: any) {
      setError(err?.message || "Errore geocoding");
      setter([]);
    } finally {
      setLoading(false);
    }
  };

  const applyCandidate = (
    candidate: GeocodeCandidate,
    currentQuery: string,
    setText: (value: string) => void,
    setPoint: (value: LngLat) => void,
    setCandidates: (items: GeocodeCandidate[]) => void,
  ) => {
    rememberLocation(currentQuery, candidate);
    setText(candidate.label);
    setPoint({ lat: candidate.lat, lng: candidate.lng });
    setCandidates([]);
  };

  const resolveOrigin = () => {
    if (originPoint) return originPoint;
    const parsed = parseCoordInput(originText);
    if (parsed) return parsed;
    return getVehicleOrigin(selectedVehicleImei);
  };

  const resolveDestination = () => {
    if (destinationPoint) return destinationPoint;
    const parsed = parseCoordInput(destinationText);
    if (parsed) return parsed;
    return null;
  };

  const calculateRoute = async () => {
    const from = resolveOrigin();
    const to = resolveDestination();
    if (!from || !to) {
      setError("Seleziona partenza e destinazione valide.");
      return;
    }

    setRouting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/nav/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider,
          from,
          to,
          departureTime: Date.now(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || `Errore calcolo rotta (${res.status})`);
      }
      setResult(payload);
      if (originText.trim()) {
        rememberLocation(originText, { label: originText.trim(), lat: from.lat, lng: from.lng });
      }
      if (destinationText.trim()) {
        rememberLocation(destinationText, { label: destinationText.trim(), lat: to.lat, lng: to.lng });
      }
      const geometry = normalizeRouteGeometry(payload?.geometry);
      if (geometry) {
        (window as any).trucklyDrawNavigationRoute?.(geometry);
      }
    } catch (err: any) {
      setError(err?.message || "Errore calcolo rotta");
    } finally {
      setRouting(false);
    }
  };

  const clearRoute = () => {
    setResult(null);
    setError(null);
    (window as any).trucklyClearNavigationRoute?.();
  };

  const showVehicleCandidates = (setter: (items: GeocodeCandidate[]) => void) => {
    const vehicles = getVehicleCandidates();
    if (vehicles.length) {
      setter(vehicles);
    }
  };

  const applyCurrentVehiclePosition = (
    setText: (value: string) => void,
    setPoint: (value: LngLat) => void,
    setCandidates: (items: GeocodeCandidate[]) => void,
  ) => {
    const current = getVehicleOrigin(selectedVehicleImei);
    if (!current) {
      setError("Posizione attuale del veicolo non disponibile.");
      return;
    }
    const label = `Posizione attuale (${current.lat.toFixed(5)}, ${current.lng.toFixed(5)})`;
    setText(label);
    setPoint(current);
    setCandidates([]);
    setError(null);
  };

  React.useEffect(() => {
    if (suppressOriginAutocompleteRef.current) {
      suppressOriginAutocompleteRef.current = false;
      return;
    }
    const query = originText.trim();
    if (!query || query.length < 3) {
      setOriginCandidates([]);
      return;
    }
    const timer = setTimeout(() => {
      void geocode(query, setOriginCandidates, setLoadingOrigin);
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [originText]);

  React.useEffect(() => {
    if (suppressDestinationAutocompleteRef.current) {
      suppressDestinationAutocompleteRef.current = false;
      return;
    }
    const query = destinationText.trim();
    if (!query || query.length < 3) {
      setDestinationCandidates([]);
      return;
    }
    const timer = setTimeout(() => {
      void geocode(query, setDestinationCandidates, setLoadingDestination);
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [destinationText]);

  const cardClass = compact
    ? "rounded-xl border border-white/10 bg-[#111214] p-3 space-y-3"
    : "rounded-2xl border border-white/10 bg-[#121212] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]";

  return (
    <div className={cardClass}>
      <div className="space-y-1">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">Calcolo rotta A-B</p>
        <p className="text-sm text-white/60">
          Calcola distanza e tempo stimato. Con Google API key verra mostrato anche il traffico.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Partenza</label>
        <div className="relative">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => applyCurrentVehiclePosition(setOriginText, setOriginPoint, setOriginCandidates)}
              className="shrink-0 h-9 w-9 rounded-lg border border-white/20 bg-white/10 text-[11px] text-white/80 hover:bg-white/15 inline-flex items-center justify-center"
              title="Usa posizione attuale"
              aria-label="Usa posizione attuale"
            >
              <i className="fa fa-crosshairs" aria-hidden="true" />
            </button>
            <input
              type="text"
              value={originText}
              onChange={(e) => {
                setOriginText(e.target.value);
                setOriginPoint(null);
              }}
              onFocus={() => showVehicleCandidates(setOriginCandidates)}
              placeholder="Posizione di partenza"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
            <button
              type="button"
              onClick={() => geocode(originText, setOriginCandidates, setLoadingOrigin)}
              disabled={loadingOrigin}
              className="shrink-0 h-9 rounded-lg border border-white/20 bg-white/10 px-3 text-[10px] uppercase tracking-[0.16em] text-white/80 disabled:opacity-50"
            >
              {loadingOrigin ? "..." : "Cerca"}
            </button>
          </div>
          {!!originCandidates.length && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-[#0b0b0c] shadow-[0_18px_28px_rgba(0,0,0,0.45)]">
              {originCandidates.map((candidate, idx) => (
                <button
                  key={`${candidate.lat}-${candidate.lng}-${idx}`}
                  type="button"
                  onClick={() => {
                    suppressOriginAutocompleteRef.current = true;
                    applyCandidate(candidate, originText, setOriginText, setOriginPoint, setOriginCandidates);
                  }}
                  className="w-full border-b border-white/5 px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10"
                >
                  {candidate.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Destinazione</label>
        <div className="relative">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => applyCurrentVehiclePosition(setDestinationText, setDestinationPoint, setDestinationCandidates)}
              className="shrink-0 h-9 w-9 rounded-lg border border-white/20 bg-white/10 text-[11px] text-white/80 hover:bg-white/15 inline-flex items-center justify-center"
              title="Usa posizione attuale"
              aria-label="Usa posizione attuale"
            >
              <i className="fa fa-crosshairs" aria-hidden="true" />
            </button>
            <input
              type="text"
              value={destinationText}
              onChange={(e) => {
                setDestinationText(e.target.value);
                setDestinationPoint(null);
              }}
              onFocus={() => showVehicleCandidates(setDestinationCandidates)}
              placeholder="Posizione di arrivo"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
            <button
              type="button"
              onClick={() => geocode(destinationText, setDestinationCandidates, setLoadingDestination)}
              disabled={loadingDestination}
              className="shrink-0 h-9 rounded-lg border border-white/20 bg-white/10 px-3 text-[10px] uppercase tracking-[0.16em] text-white/80 disabled:opacity-50"
            >
              {loadingDestination ? "..." : "Cerca"}
            </button>
          </div>
          {!!destinationCandidates.length && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-[#0b0b0c] shadow-[0_18px_28px_rgba(0,0,0,0.45)]">
              {destinationCandidates.map((candidate, idx) => (
                <button
                  key={`${candidate.lat}-${candidate.lng}-${idx}`}
                  type="button"
                  onClick={() => {
                    suppressDestinationAutocompleteRef.current = true;
                    applyCandidate(candidate, destinationText, setDestinationText, setDestinationPoint, setDestinationCandidates);
                  }}
                  className="w-full border-b border-white/5 px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10"
                >
                  {candidate.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={calculateRoute}
          disabled={routing}
          className="h-9 flex-1 rounded-lg bg-white/10 border border-white/20 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:bg-white/15 transition disabled:opacity-50"
        >
          {routing ? "Calcolo..." : "Calcola"}
        </button>
        <button
          type="button"
          onClick={clearRoute}
          className="h-9 rounded-lg border border-white/20 bg-transparent px-3 text-xs uppercase tracking-[0.18em] text-white/70 hover:text-white hover:border-white/40"
        >
          Pulisci
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-3 text-xs text-white/80 space-y-1">
          <p>Distanza: <strong>{Number.isFinite(result.distanceKm as number) ? `${result.distanceKm} km` : "N/D"}</strong></p>
          <p>Tempo: <strong>{Number.isFinite(result.durationMin as number) ? `${result.durationMin} min` : "N/D"}</strong></p>
          <p>
            Traffico: <strong>{Number.isFinite(result.durationTrafficMin as number) ? `${result.durationTrafficMin} min` : "non disponibile"}</strong>
          </p>
          <p className="text-white/50">Provider: {String(result.provider || "n/d").toUpperCase()}</p>
        </div>
      )}
    </div>
  );
}
