import React from "react";

type DriverSidebarProps = {
  isOpen: boolean;
  onClose?: () => void;
  selectedDriverImei?: string | null;
  selectedRouteImei?: string | null;
  mode?: "driver" | "routes" | "geofence";
  geofenceDraft?: {
    geofenceId: string;
    imei: string;
    center: { lng: number; lat: number };
    radiusMeters: number;
  } | null;
};

type SectionProps = {
  title: string;
  body: React.ReactNode;
};

type CounterBarProps = {
  title: string;
  totalLabel: string;
  remainingLabel: string;
  remainingPct: number;
  accentClass: string;
};

type RoutePoint = {
  timestamp: number;
  gps: {
    Latitude: number;
    Longitude: number;
    Speed: number;
  };
  io: {
    ignition: number;
  };
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const toLocalInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getDefaultRouteRange = () => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const hoursSinceMidnight = (now.getTime() - midnight.getTime()) / 3_600_000;
  const from = new Date(midnight.getTime() - (hoursSinceMidnight > 4 ? 0 : 86_400_000));
  return { from, to: now };
};

const toTimestamp = (value: unknown) => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const normalizeRouteHistory = (raw: any[] = []): RoutePoint[] => {
  const normalized = raw
    .map((entry) => {
      const gps = entry?.gps || entry?.data?.gps || entry?.data || {};
      const io = entry?.io || entry?.data?.io || {};
      const ts = toTimestamp(entry?.timestamp ?? entry?.ts ?? gps?.timestamp ?? io?.timestamp);
      const lat = Number(gps?.Latitude ?? gps?.latitude ?? gps?.lat);
      const lon = Number(gps?.Longitude ?? gps?.longitude ?? gps?.lon);
      if (!Number.isFinite(ts) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const speed = Number(gps?.Speed ?? gps?.speed ?? io?.speed ?? 0);
      const ignition = Number(
        io?.ignition ?? io?.ignitionStatus ?? io?.Ignition ?? io?.ign ?? 0,
      );
      return {
        timestamp: ts as number,
        gps: {
          Latitude: lat,
          Longitude: lon,
          Speed: Number.isFinite(speed) ? speed : 0,
        },
        io: { ignition: Number.isFinite(ignition) ? ignition : 0 },
      };
    })
    .filter(Boolean) as RoutePoint[];

  normalized.sort((a, b) => a.timestamp - b.timestamp);
  return normalized;
};

const downsampleRoute = (history: RoutePoint[], maxPoints = 2000) => {
  if (history.length <= maxPoints) return history;
  const step = Math.ceil(history.length / maxPoints);
  const sampled = history.filter((_, idx) => idx % step === 0);
  const last = history[history.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
};

const getVehicleStateClass = (speed = 0, ignition = 0) => {
  const v = Number(speed) || 0;
  const ig = Number(ignition) || 0;
  if (v > 5) return "success";
  if (v <= 5 && ig === 0) return "danger";
  if (v <= 5 && ig === 1) return "warning";
  return "";
};

const normalizeFuelEvent = (raw: any = {}) => {
  const toNumber = (value: unknown) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const eventId = raw.eventId || raw._id;
  const start = toNumber(raw.startMs ?? raw.start ?? raw.eventStart);
  const end = toNumber(raw.endMs ?? raw.end ?? raw.eventEnd ?? start);
  if (!eventId || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  const normalizedTypeRaw = String(raw.normalizedType || raw.type || "refuel")
    .toLowerCase()
    .trim();
  const normalizedType = normalizedTypeRaw === "rifornimento" ? "refuel" : normalizedTypeRaw;
  return {
    eventId: String(eventId),
    normalizedType,
    start: start as number,
    end: Number.isFinite(end) ? (end as number) : (start as number),
    liters: toNumber(raw.liters ?? raw.delta),
    delta: toNumber(raw.delta),
  };
};

const formatEventLabel = (evt: { normalizedType?: string }) => {
  if (evt.normalizedType === "refuel") return "Rifornimento";
  if (
    evt.normalizedType === "withdrawal" ||
    evt.normalizedType === "fuel_withdrawal" ||
    evt.normalizedType === "fuel-theft" ||
    evt.normalizedType === "theft"
  ) {
    return "Prelievo";
  }
  return "Evento";
};

const formatShortDateTime = (value?: number) => {
  if (!Number.isFinite(value)) return "N/D";
  return new Date(value as number).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const resolveHeading = (history: RoutePoint[], index: number) => {
  if (!history.length) return 0;
  const prev = history[Math.max(0, index - 1)];
  const next = history[Math.min(history.length - 1, index + 1)];
  const dx = (next?.gps?.Longitude ?? 0) - (prev?.gps?.Longitude ?? 0);
  const dy = (next?.gps?.Latitude ?? 0) - (prev?.gps?.Latitude ?? 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return 0;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

function RoutesSidebar({
  isOpen,
  selectedVehicleImei,
}: {
  isOpen: boolean;
  selectedVehicleImei?: string | null;
}) {
  const defaultRange = React.useMemo(() => getDefaultRouteRange(), []);
  const [startDate, setStartDate] = React.useState(
    toLocalInputValue(defaultRange.from),
  );
  const [endDate, setEndDate] = React.useState(toLocalInputValue(defaultRange.to));
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [historyRaw, setHistoryRaw] = React.useState<any[]>([]);
  const [events, setEvents] = React.useState<any[]>([]);
  const [scrubValue, setScrubValue] = React.useState(1);
  const prevImeiRef = React.useRef<string | null>(null);

  const routesBaseUrl = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }, []);

  const normalizedHistory = React.useMemo(
    () => downsampleRoute(normalizeRouteHistory(historyRaw)),
    [historyRaw],
  );

  const fetchRoutes = React.useCallback(async () => {
    if (!selectedVehicleImei) {
      setError("Seleziona un veicolo per vedere i percorsi.");
      setHistoryRaw([]);
      setEvents([]);
      return;
    }

    const fromMs = Date.parse(startDate);
    const toMs = Date.parse(endDate);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      setError("Intervallo non valido.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [historyRes, eventsRes] = await Promise.all([
        fetch(`${routesBaseUrl}/dashboard/history/get`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            imei: selectedVehicleImei,
            from: fromMs,
            to: toMs,
          }),
        }),
        fetch(`${routesBaseUrl}/dashboard/fuelevents/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            imei: selectedVehicleImei,
            from: fromMs,
            to: toMs,
          }),
        }),
      ]);

      if (!historyRes.ok) {
        const txt = await historyRes.text();
        throw new Error(txt || `HTTP ${historyRes.status}`);
      }

      const data = await historyRes.json();
      const raw = Array.isArray(data?.raw) ? data.raw : [];
      setHistoryRaw(raw);
      setScrubValue(1);

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        const normalizedEvents = Array.isArray(eventsData)
          ? eventsData.map(normalizeFuelEvent).filter(Boolean)
          : Array.isArray(eventsData?.fuelEvents)
            ? eventsData.fuelEvents.map(normalizeFuelEvent).filter(Boolean)
            : [];
        setEvents(normalizedEvents);
      } else {
        setEvents([]);
      }
    } catch (err: any) {
      setError(err?.message || "Errore nel recupero percorsi");
      setHistoryRaw([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [routesBaseUrl, selectedVehicleImei, startDate, endDate]);

  React.useEffect(() => {
    if (prevImeiRef.current && prevImeiRef.current !== selectedVehicleImei) {
      (window as any).trucklyClearRoute?.(prevImeiRef.current);
      (window as any).trucklyShowAllMarkers?.();
      (window as any).rewinding = false;
      (window as any).trucklyApplyAvlCache?.();
    }
    prevImeiRef.current = selectedVehicleImei || null;
    setHistoryRaw([]);
    setEvents([]);
    setError(null);
    setScrubValue(1);
  }, [selectedVehicleImei]);

  React.useEffect(() => {
    if (!selectedVehicleImei) return;
    const range = getDefaultRouteRange();
    setStartDate(toLocalInputValue(range.from));
    setEndDate(toLocalInputValue(range.to));
  }, [selectedVehicleImei]);

  React.useEffect(() => {
    if (!isOpen) return;
    void fetchRoutes();
  }, [isOpen, fetchRoutes]);

  React.useEffect(() => {
    if (!isOpen || !selectedVehicleImei) return;
    (window as any).rewinding = true;
    (window as any).trucklyHideOtherMarkers?.(selectedVehicleImei);
  }, [isOpen, selectedVehicleImei]);

  React.useEffect(() => {
    if (!isOpen || !selectedVehicleImei) return;
    if (!normalizedHistory.length) {
      (window as any).trucklyClearRoute?.(selectedVehicleImei);
      return;
    }
    (window as any).trucklyDrawRoute?.(selectedVehicleImei, normalizedHistory);
  }, [isOpen, selectedVehicleImei, normalizedHistory]);

  React.useEffect(() => {
    if (isOpen) return;
    (window as any).trucklyClearRoute?.(selectedVehicleImei);
    (window as any).trucklyShowAllMarkers?.();
    (window as any).rewinding = false;
    (window as any).trucklyApplyAvlCache?.();
  }, [isOpen, selectedVehicleImei]);

  React.useEffect(() => {
    if (!isOpen || !selectedVehicleImei || !normalizedHistory.length) return;
    const clamped = Math.min(Math.max(scrubValue, 0), 1);
    const total = normalizedHistory.length;
    const position = Math.min(total - 1, Math.max(0, Math.floor(clamped * (total - 1))));
    const point = normalizedHistory[position];
    if (!point) return;
    const heading = resolveHeading(normalizedHistory, position);
    const statusClass = getVehicleStateClass(point.gps.Speed, point.io?.ignition);
    (window as any).trucklySetRouteProgress?.(selectedVehicleImei, position);
    (window as any).trucklyUpdateRouteMarker?.(
      selectedVehicleImei,
      point,
      heading,
      statusClass,
    );
  }, [scrubValue, normalizedHistory, selectedVehicleImei]);

  const currentPoint = normalizedHistory.length
    ? normalizedHistory[
        Math.min(
          normalizedHistory.length - 1,
          Math.max(0, Math.floor(scrubValue * (normalizedHistory.length - 1))),
        )
      ]
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="space-y-1">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
            Intervallo percorsi
          </p>
          <p className="text-sm text-white/60">
            Seleziona una finestra e aggiorna il tracciato.
          </p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Da</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">A</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <button
            onClick={fetchRoutes}
            disabled={loading}
            className="h-9 w-full rounded-lg bg-white/10 border border-white/20 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 hover:bg-white/15 transition disabled:opacity-50"
          >
            {loading ? "Carico" : "Aggiorna"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>Rewind</span>
          <span>{currentPoint ? new Date(currentPoint.timestamp).toLocaleString("it-IT") : "N/D"}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={scrubValue}
          onChange={(e) => setScrubValue(Number(e.target.value))}
          className="w-full"
        />
        <div className="text-xs text-white/60">
          {normalizedHistory.length
            ? `Punti caricati: ${normalizedHistory.length}`
            : loading
              ? "Caricamento percorsi..."
              : "Nessun percorso disponibile per l'intervallo selezionato."}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>Eventi</span>
          <span>{events.length}</span>
        </div>
        <div className="space-y-2 max-h-[220px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-xs text-white/50">
              Nessun evento disponibile per questo intervallo.
            </div>
          ) : (
            events.map((evt: any) => (
              <div
                key={evt.eventId}
                className="rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/80"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{formatEventLabel(evt)}</span>
                  <span className="text-white/50">{formatShortDateTime(evt.start)}</span>
                </div>
                <div className="mt-1 text-white/60">
                  {evt.liters != null ? `${evt.liters.toFixed(1)} L` : "Delta non disponibile"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function DriverSidebar({
  isOpen,
  onClose,
  selectedDriverImei,
  selectedRouteImei,
  mode = "driver",
  geofenceDraft,
}: DriverSidebarProps) {
  const counterBars: CounterBarProps[] = [
    {
      title: "Guida residua",
      totalLabel: "Totale 9h",
      remainingLabel: "Residua 2h",
      remainingPct: 22,
      accentClass: "bg-orange-500",
    },
    {
      title: "Impegno residuo",
      totalLabel: "Totale 13h",
      remainingLabel: "Residua 4h",
      remainingPct: 31,
      accentClass: "bg-sky-700",
    },
    {
      title: "Riposo residuo",
      totalLabel: "Totale 11h",
      remainingLabel: "Residua 7h",
      remainingPct: 64,
      accentClass: "bg-emerald-500",
    },
  ];

  const isRoutesMode = mode === "routes";
  const isGeofenceMode = mode === "geofence";

  return (
    <aside
      className={`fixed top-0 bottom-0 right-0 z-40 w-[520px] max-w-lg border-l border-white/10 bg-[#0e0f14] text-[#f8fafc] flex flex-col pt-16 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur truckly-sidebar transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isOpen ? "translate-x-0" : "hidden-right"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-start justify-between px-5 py-5 border-b border-white/10">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Pannello</p>
          <h2 className="text-xl font-semibold leading-tight text-white">
            {isGeofenceMode ? "GeoFence" : isRoutesMode ? "Percorsi" : "Autista"}
          </h2>
          <p className="text-sm text-white/70">
            {isGeofenceMode
              ? "Configura la geofence appena creata."
              : isRoutesMode
              ? "Gestisci l'intervallo e scorri il percorso selezionato."
              : "Seleziona un autista dal tooltip del mezzo per vedere i dettagli qui."}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs h-8 rounded-full border border-white/20 px-3 text-white/75 hover:text-white hover:border-white/50 transition"
          >
            Chiudi
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden px-4 py-5 space-y-4 bg-[#0e0f14]">
        {isGeofenceMode ? (
          <GeofenceSidebar geofenceDraft={geofenceDraft} />
        ) : isRoutesMode ? (
          <RoutesSidebar isOpen={isOpen} selectedVehicleImei={selectedRouteImei} />
        ) : (
          <>
            <Section
              title="Stato selezione"
              body={
                selectedDriverImei
                  ? `Autista selezionato: ${selectedDriverImei}`
                  : "Nessun autista selezionato."
              }
            />
            <div className="rounded-2xl border border-white/10 bg-[#10121a] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">Stato guida</p>
              </div>
              <div className="px-4 pb-4 space-y-4">
                {counterBars.map((bar) => (
                  <CounterBar key={bar.title} {...bar} />
                ))}
              </div>
            </div>
            <Section title="Informazioni generali" body="Nome, patente, e anagrafica verranno mostrati qui." />
            <Section title="Contatti" body="Email, telefono e note mostreranno qui." />
            <Section
              title="Stato & disponibilita"
              body="Turni, disponibilita e eventi recenti compariranno qui."
            />
            <Section
              title="Report attivita"
              body={
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("truckly:bottom-bar-toggle", {
                        detail: { mode: "driver" },
                      }),
                    )
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition"
                >
                  Report Attivita
                </button>
              }
            />
          </>
        )}
      </div>
    </aside>
  );
}

function GeofenceSidebar({
  geofenceDraft,
}: {
  geofenceDraft?: {
    geofenceId: string;
    imei: string;
    center: { lng: number; lat: number };
    radiusMeters: number;
  } | null;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [radiusKm, setRadiusKm] = React.useState<number>(1);
  const [centerLat, setCenterLat] = React.useState<number | "">("");
  const [centerLng, setCenterLng] = React.useState<number | "">("");
  const [triggers, setTriggers] = React.useState({
    arrive: true,
    leave: true,
    nearby: false,
  });

  React.useEffect(() => {
    if (!geofenceDraft) return;
    setRadiusKm(Number((geofenceDraft.radiusMeters / 1000).toFixed(2)) || 1);
    setCenterLat(Number(geofenceDraft.center.lat.toFixed(6)));
    setCenterLng(Number(geofenceDraft.center.lng.toFixed(6)));
    setName("");
    setDescription("");
  }, [geofenceDraft]);

  React.useEffect(() => {
    if (!geofenceDraft) return;
    if (centerLat === "" || centerLng === "" || !Number.isFinite(radiusKm)) return;
    const radiusMeters = Math.max(50, Number(radiusKm) * 1000);
    (window as any).trucklyUpdateGeofence?.(
      geofenceDraft.geofenceId,
      { lat: Number(centerLat), lng: Number(centerLng) },
      radiusMeters,
    );
  }, [geofenceDraft, centerLat, centerLng, radiusKm]);

  const canSave = Boolean(name.trim() && description.trim() && geofenceDraft);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="space-y-1">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
            Dettagli geofence
          </p>
          <p className="text-sm text-white/60">
            Nome e descrizione sono obbligatori.
          </p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Descrizione</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
              required
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">
          Posizione e raggio
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Lat</label>
            <input
              value={centerLat}
              onChange={(e) => setCenterLat(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">Lng</label>
            <input
              value={centerLng}
              onChange={(e) => setCenterLng(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Raggio (km)
          </label>
          <input
            type="number"
            min={0.05}
            step={0.05}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-full rounded-lg border border-white/10 bg-[#0c0f16] px-3 py-2 text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 space-y-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">Trigger</p>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={triggers.arrive}
            onChange={(e) => setTriggers((prev) => ({ ...prev, arrive: e.target.checked }))}
          />
          Arrivo nel perimetro
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={triggers.leave}
            onChange={(e) => setTriggers((prev) => ({ ...prev, leave: e.target.checked }))}
          />
          Uscita dal perimetro
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={triggers.nearby}
            onChange={(e) => setTriggers((prev) => ({ ...prev, nearby: e.target.checked }))}
          />
          Veicolo vicino
        </label>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#10121a] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between text-xs text-white/50 mb-3">
          <span>Target</span>
          <span>{geofenceDraft?.imei || "-"}</span>
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            if (!geofenceDraft) return;
            window.dispatchEvent(
              new CustomEvent("truckly:geofence-save", {
                detail: {
                  geofenceId: geofenceDraft.geofenceId,
                  imei: geofenceDraft.imei,
                  center: { lat: Number(centerLat), lng: Number(centerLng) },
                  radiusKm,
                  name: name.trim(),
                  description: description.trim(),
                  triggers,
                },
              }),
            );
          }}
          className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/15 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Salva GeoFence
        </button>
      </div>
    </div>
  );
}

function Section({ title, body }: SectionProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#10121a] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[12px] uppercase tracking-[0.12em] text-white/65">{title}</p>
      </div>
      <div className="px-4 pb-4">
        <div className="rounded-xl border border-white/8 bg-[#0c0f16] px-3.5 py-3 text-sm text-white/85 shadow-inner shadow-black/40">
          {body}
        </div>
      </div>
    </div>
  );
}

function CounterBar({
  title,
  totalLabel,
  remainingLabel,
  remainingPct,
  accentClass,
}: CounterBarProps) {
  const safeRemaining = Math.min(100, Math.max(0, remainingPct));
  const usedPct = 100 - safeRemaining;

  return (
    <div className="space-y-2">
      <div className="text-base font-medium text-white">{title}</div>
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>{totalLabel}</span>
        <span>{remainingLabel}</span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-md bg-white/10">
        <div className="flex h-full w-full">
          <div className="h-full bg-white/10" style={{ width: `${usedPct}%` }} />
          <div className={`h-full ${accentClass}`} style={{ width: `${safeRemaining}%` }} />
        </div>
      </div>
    </div>
  );
}
