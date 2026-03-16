import React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/* ─── Fictional demo vehicles across Italy ─────────────────── */
type DemoVehicle = {
  imei: string;
  nickname: string;
  plate: string;
  brand: string;
  model: string;
  lat: number;
  lon: number;
  status: "driving" | "resting" | "working";
  angle: number;
  speed: number;
};

const DEMO_VEHICLES: DemoVehicle[] = [
  { imei: "D001", nickname: "Iveco Milano", plate: "FH 842 BZ", brand: "Iveco", model: "S-Way 570", lat: 45.4654, lon: 9.1859, status: "driving", angle: 75, speed: 88 },
  { imei: "D002", nickname: "Volvo Torino", plate: "AB 317 CD", brand: "Volvo", model: "FH16 750", lat: 45.0703, lon: 7.6869, status: "resting", angle: 0, speed: 0 },
  { imei: "D003", nickname: "Scania Bologna", plate: "GK 551 MN", brand: "Scania", model: "R450", lat: 44.4949, lon: 11.3426, status: "driving", angle: 120, speed: 94 },
  { imei: "D004", nickname: "MAN Firenze", plate: "PQ 228 RS", brand: "MAN", model: "TGX 18.560", lat: 43.7696, lon: 11.2558, status: "working", angle: 0, speed: 4 },
  { imei: "D005", nickname: "Daf Roma", plate: "LT 903 XY", brand: "DAF", model: "XF 480", lat: 41.9028, lon: 12.4964, status: "driving", angle: 200, speed: 112 },
  { imei: "D006", nickname: "Iveco Napoli", plate: "WZ 067 QP", brand: "Iveco", model: "Stralis 480", lat: 40.8518, lon: 14.2681, status: "resting", angle: 0, speed: 0 },
  { imei: "D007", nickname: "Scania Bari", plate: "UV 190 EF", brand: "Scania", model: "S580", lat: 41.1171, lon: 16.8719, status: "driving", angle: 310, speed: 105 },
  { imei: "D008", nickname: "Volvo Venezia", plate: "NK 445 GH", brand: "Volvo", model: "FM 460", lat: 45.4408, lon: 12.3155, status: "driving", angle: 45, speed: 76 },
  { imei: "D009", nickname: "MAN Palermo", plate: "CJ 712 IJ", brand: "MAN", model: "TGS 26.460", lat: 38.1157, lon: 13.3615, status: "working", angle: 0, speed: 2 },
  { imei: "D010", nickname: "Daf Catanzaro", plate: "RE 389 KL", brand: "DAF", model: "CF 530", lat: 38.9100, lon: 16.5872, status: "resting", angle: 0, speed: 0 },
];

const STATUS_COLORS: Record<DemoVehicle["status"], string> = {
  driving: "#22c55e",
  resting: "#ef4444",
  working: "#eab308",
};

const STATUS_LABELS: Record<DemoVehicle["status"], string> = {
  driving: "In marcia",
  resting: "Fermo",
  working: "Quadro acceso",
};

/* ─── Contact Gate Modal ────────────────────────────────────── */
type ContactGateProps = {
  isOpen: boolean;
  onClose: () => void;
  trigger?: string;
};

function ContactGate({ isOpen, onClose, trigger }: ContactGateProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [fleet, setFleet] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Simulate async submit — in production connect to /api/lead or similar
    await new Promise((r) => setTimeout(r, 900));
    setSubmitting(false);
    setSubmitted(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c0d] p-8 shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
        {/* Glow accent */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,122,26,0.6), transparent)" }}
        />

        {submitted ? (
          <div className="flex flex-col items-center gap-6 text-center py-4">
            <div className="h-14 w-14 rounded-full border border-[rgba(255,122,26,0.4)] bg-[rgba(255,122,26,0.1)] flex items-center justify-center">
              <i className="fa fa-check text-xl text-orange-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Richiesta inviata!</h3>
              <p className="mt-2 text-sm text-white/60">
                Ti contatteremo a breve per attivare il tuo accesso completo a Truckly.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-full border border-white/20 px-6 text-xs uppercase tracking-[0.2em] text-white/70 hover:text-white transition"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className="text-[10px] uppercase tracking-[0.26em] text-orange-400/80 mb-1">
                {trigger || "Funzione avanzata"}
              </p>
              <h3 className="text-xl font-semibold text-white">
                Vuoi accedere a questa funzione?
              </h3>
              <p className="mt-2 text-sm text-white/60">
                La versione demo mostra solo la localizzazione. Lascia i tuoi dati per ricevere accesso completo.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-white/50 mb-1.5">
                  Nome e Cognome *
                </label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mario Rossi"
                  className="w-full rounded-lg border border-white/10 bg-[#111113] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-white/50 mb-1.5">
                  Email *
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mario@azienda.it"
                  className="w-full rounded-lg border border-white/10 bg-[#111113] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-white/50 mb-1.5">
                  Azienda *
                </label>
                <input
                  required
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Trasporti Rossi S.r.l."
                  className="w-full rounded-lg border border-white/10 bg-[#111113] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-white/50 mb-1.5">
                  N° mezzi in flotta
                </label>
                <select
                  value={fleet}
                  onChange={(e) => setFleet(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#111113] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                >
                  <option value="">Seleziona</option>
                  <option value="1-5">1 – 5 mezzi</option>
                  <option value="6-20">6 – 20 mezzi</option>
                  <option value="21-50">21 – 50 mezzi</option>
                  <option value="50+">Oltre 50 mezzi</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-full text-xs font-semibold uppercase tracking-[0.2em] text-white transition disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #ff7a1a, #ff9a4a)", boxShadow: "0 0 28px rgba(255,122,26,0.35)" }}
              >
                {submitting ? "Invio in corso..." : "Richiedi accesso completo"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Demo vehicle tooltip ──────────────────────────────────── */
function buildMarkerHtml(v: DemoVehicle): string {
  const color = STATUS_COLORS[v.status];
  return `
    <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:rgba(10,10,14,0.92);color:#fff;font-size:11px;font-weight:600;border:1px solid rgba(255,255,255,0.15);box-shadow:0 8px 18px rgba(0,0,0,0.5);white-space:nowrap;cursor:pointer;">
      <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 8px ${color}88;"></span>
      ${v.plate}
    </div>`;
}

/* ─── Main DemoPage ─────────────────────────────────────────── */
export function DemoPage() {
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const markersRef = React.useRef<maplibregl.Marker[]>([]);
  const vehiclesRef = React.useRef<DemoVehicle[]>(JSON.parse(JSON.stringify(DEMO_VEHICLES)));

  const [contactGate, setContactGate] = React.useState<{ open: boolean; trigger?: string }>({ open: false });
  const [activeVehicle, setActiveVehicle] = React.useState<DemoVehicle | null>(null);
  const popupRef = React.useRef<maplibregl.Popup | null>(null);

  /* init map */
  React.useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "/maps/style.json",
      center: [12.5, 42.5],
      zoom: 5.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      placeDemoMarkers(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const placeDemoMarkers = (map: maplibregl.Map) => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    vehiclesRef.current.forEach((v) => {
      const el = document.createElement("div");
      el.innerHTML = buildMarkerHtml(v);
      el.addEventListener("click", () => {
        setActiveVehicle(v);
        showVehiclePopup(map, v);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([v.lon, v.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  };

  const showVehiclePopup = (map: maplibregl.Map, v: DemoVehicle) => {
    popupRef.current?.remove();
    const color = STATUS_COLORS[v.status];
    const content = `
      <div style="background:#111;border-radius:14px;border:1px solid rgba(255,255,255,0.1);padding:14px 16px;min-width:200px;font-family:system-ui,sans-serif;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color}88;flex-shrink:0;"></span>
          <span style="font-size:13px;font-weight:700;color:#fff;">${v.nickname}</span>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.6);line-height:1.8;">
          <div><b style="color:rgba(255,255,255,0.4);">Targa</b> ${v.plate}</div>
          <div><b style="color:rgba(255,255,255,0.4);">Mezzo</b> ${v.brand} ${v.model}</div>
          <div><b style="color:rgba(255,255,255,0.4);">Stato</b> <span style="color:${color}">${STATUS_LABELS[v.status]}</span></div>
          ${v.speed > 0 ? `<div><b style="color:rgba(255,255,255,0.4);">Velocità</b> ${v.speed} km/h</div>` : ""}
        </div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">
          <button
            onclick="window.__trucklyDemoGate('Analisi percorso')"
            style="width:100%;padding:7px;border-radius:8px;background:rgba(255,122,26,0.15);border:1px solid rgba(255,122,26,0.3);color:rgba(255,180,120,0.9);font-size:11px;cursor:pointer;font-weight:600;letter-spacing:0.08em;"
          >
            Vedi percorso & analisi →
          </button>
        </div>
      </div>`;

    popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 10, maxWidth: "none" })
      .setLngLat([v.lon, v.lat])
      .setHTML(content)
      .addTo(map);
  };

  /* Expose gate trigger to popup HTML */
  React.useEffect(() => {
    (window as any).__trucklyDemoGate = (trigger: string) => {
      setContactGate({ open: true, trigger });
    };
    return () => {
      delete (window as any).__trucklyDemoGate;
    };
  }, []);

  /* Animate driving vehicles slightly */
  React.useEffect(() => {
    const interval = setInterval(() => {
      vehiclesRef.current = vehiclesRef.current.map((v) => {
        if (v.status !== "driving") return v;
        const rad = (v.angle * Math.PI) / 180;
        const delta = 0.0003;
        return {
          ...v,
          lat: v.lat + Math.cos(rad) * delta,
          lon: v.lon + Math.sin(rad) * delta,
        };
      });

      if (mapRef.current) {
        markersRef.current.forEach((marker, idx) => {
          const v = vehiclesRef.current[idx];
          if (v?.status === "driving") {
            marker.setLngLat([v.lon, v.lat]);
          }
        });
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#0a0a0a]">
      {/* ─── Top bar ──────────────────────────────────── */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#0b0b0c]/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <a href="/">
            <img src="/assets/images/logo_white.png" alt="Truckly" className="h-6 w-auto" loading="lazy" />
          </a>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ background: "rgba(255,122,26,0.12)", border: "1px solid rgba(255,122,26,0.35)", color: "rgba(255,200,160,0.9)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "#ff7a1a", boxShadow: "0 0 6px rgba(255,122,26,0.8)", animation: "truckly-typing-blink 1.4s ease-in-out infinite" }}
            />
            Demo live
          </span>
        </div>

        <p className="hidden text-xs text-white/45 sm:block">
          Veicoli fittizi · Solo localizzazione attiva
        </p>

        <button
          type="button"
          onClick={() => setContactGate({ open: true, trigger: "Accesso completo" })}
          className="shrink-0 h-9 rounded-full px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition"
          style={{ background: "linear-gradient(135deg, #ff7a1a, #ff9a4a)", boxShadow: "0 0 22px rgba(255,122,26,0.3)" }}
        >
          Richiedi accesso
        </button>
      </header>

      {/* ─── Map ──────────────────────────────────────── */}
      <div ref={mapContainerRef} className="flex-1" />

      {/* ─── Locked feature bar (bottom) ─────────────── */}
      <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-[#0b0b0c]/90 px-4 py-3 backdrop-blur">
        {[
          { icon: "fa-line-chart", label: "Analisi consumi" },
          { icon: "fa-road", label: "Percorsi e rewind" },
          { icon: "fa-bell", label: "Alert in tempo reale" },
          { icon: "fa-id-card", label: "Gestione autisti" },
          { icon: "fa-file-text-o", label: "Report & tachigrafo" },
        ].map((feat) => (
          <button
            key={feat.label}
            type="button"
            onClick={() => setContactGate({ open: true, trigger: feat.label })}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-[11px] text-white/50 transition hover:border-white/20 hover:text-white/80"
          >
            <i className={`fa ${feat.icon} text-[11px] text-white/30`} aria-hidden="true" />
            <span className="hidden sm:inline">{feat.label}</span>
            <i className="fa fa-lock text-[9px] text-orange-500/60" aria-hidden="true" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setContactGate({ open: true, trigger: "Accesso completo" })}
          className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-[11px] text-orange-300/80 transition hover:bg-orange-500/15"
        >
          <i className="fa fa-unlock-alt text-[11px]" aria-hidden="true" />
          Sblocca tutto
        </button>
      </div>

      {/* ─── Contact gate ─────────────────────────────── */}
      <ContactGate
        isOpen={contactGate.open}
        onClose={() => setContactGate({ open: false })}
        trigger={contactGate.trigger}
      />
    </div>
  );
}
