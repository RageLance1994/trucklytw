import React from "react";
import { MapContainer } from "../MapContainer";
import { Navbar } from "../components/navbar";
import { QuickSidebar } from "../components/quick-sidebar";

/* ─── 35 veicoli demo distribuiti su tutta Italia ────────────── */
const DEMO_VEHICLES = [
  // ── Milano cluster ──
  { imei: "D001", nickname: "Iveco Milano",   plate: "FH 842 BZ", brand: "Iveco",  model: "S-Way 570",   lat: 45.4654, lon: 9.1859,  status: "driving", angle: 75 },
  { imei: "D002", nickname: "Volvo Milano",   plate: "ML 312 RT", brand: "Volvo",  model: "FH 460",      lat: 45.4812, lon: 9.2031,  status: "resting", angle: 0  },
  { imei: "D003", nickname: "Scania Milano",  plate: "GK 551 MN", brand: "Scania", model: "R450",        lat: 45.4523, lon: 9.1645,  status: "driving", angle: 120 },
  { imei: "D004", nickname: "MAN Milano",     plate: "MI 990 AB", brand: "MAN",    model: "TGX 18.560",  lat: 45.4900, lon: 9.2145,  status: "working", angle: 0  },
  { imei: "D005", nickname: "DAF Milano",     plate: "TO 213 XY", brand: "DAF",    model: "XF 480",      lat: 45.4401, lon: 9.1742,  status: "driving", angle: 200 },
  // ── Torino ──
  { imei: "D006", nickname: "Volvo Torino",   plate: "AB 317 CD", brand: "Volvo",  model: "FH16 750",    lat: 45.0703, lon: 7.6869,  status: "resting", angle: 0  },
  { imei: "D007", nickname: "Iveco Torino",   plate: "TN 789 PQ", brand: "Iveco",  model: "Stralis 480", lat: 45.0892, lon: 7.6712,  status: "driving", angle: 45 },
  // ── Bologna / Emilia ──
  { imei: "D008", nickname: "Scania Bologna", plate: "BO 123 AB", brand: "Scania", model: "S580",        lat: 44.4949, lon: 11.3426, status: "driving", angle: 180 },
  { imei: "D009", nickname: "DAF Bologna",    plate: "AR 234 EF", brand: "DAF",    model: "CF 530",      lat: 44.3012, lon: 11.5876, status: "driving", angle: 160 },
  { imei: "D010", nickname: "Iveco Modena",   plate: "MO 567 IJ", brand: "Iveco",  model: "S-Way 480",   lat: 44.6488, lon: 10.9255, status: "resting", angle: 0  },
  // ── Firenze / Toscana ──
  { imei: "D011", nickname: "Volvo Firenze",  plate: "FI 678 CD", brand: "Volvo",  model: "FM 460",      lat: 43.7696, lon: 11.2558, status: "resting", angle: 0  },
  { imei: "D012", nickname: "Scania Pistoia", plate: "PT 890 GH", brand: "Scania", model: "R450",        lat: 43.9012, lon: 11.0234, status: "driving", angle: 210 },
  // ── Roma cluster ──
  { imei: "D013", nickname: "DAF Roma",       plate: "LT 903 XY", brand: "DAF",    model: "XF 480",      lat: 41.9028, lon: 12.4964, status: "driving", angle: 200 },
  { imei: "D014", nickname: "Volvo Roma",     plate: "RM 456 IJ", brand: "Volvo",  model: "FH 500",      lat: 41.8912, lon: 12.5123, status: "working", angle: 0  },
  { imei: "D015", nickname: "Scania Roma",    plate: "VT 234 KL", brand: "Scania", model: "R500",        lat: 41.9234, lon: 12.4812, status: "driving", angle: 150 },
  { imei: "D016", nickname: "MAN Roma",       plate: "FR 678 MN", brand: "MAN",    model: "TGX 26.480",  lat: 41.8756, lon: 12.5345, status: "resting", angle: 0  },
  { imei: "D017", nickname: "Iveco Roma",     plate: "LT 012 OP", brand: "Iveco",  model: "Stralis 460", lat: 41.9456, lon: 12.4678, status: "driving", angle: 20 },
  // ── Napoli ──
  { imei: "D018", nickname: "Iveco Napoli",   plate: "WZ 067 QP", brand: "Iveco",  model: "Stralis 480", lat: 40.8518, lon: 14.2681, status: "resting", angle: 0  },
  { imei: "D019", nickname: "Volvo Napoli",   plate: "NA 345 RS", brand: "Volvo",  model: "FH 460",      lat: 40.8712, lon: 14.2456, status: "driving", angle: 310 },
  { imei: "D020", nickname: "DAF Napoli",     plate: "SA 789 TU", brand: "DAF",    model: "XF 480",      lat: 40.8345, lon: 14.2867, status: "working", angle: 0  },
  // ── Bari / Puglia ──
  { imei: "D021", nickname: "Scania Bari",    plate: "UV 190 EF", brand: "Scania", model: "S580",        lat: 41.1171, lon: 16.8719, status: "driving", angle: 310 },
  { imei: "D022", nickname: "MAN Bari",       plate: "BA 234 VW", brand: "MAN",    model: "TGS 18.460",  lat: 41.1345, lon: 16.8534, status: "driving", angle: 45 },
  // ── Venezia / NordEst ──
  { imei: "D023", nickname: "Volvo Venezia",  plate: "NK 445 GH", brand: "Volvo",  model: "FM 460",      lat: 45.4408, lon: 12.3155, status: "driving", angle: 45 },
  { imei: "D024", nickname: "Scania Venezia", plate: "VE 678 AB", brand: "Scania", model: "R450",        lat: 45.4612, lon: 12.3312, status: "working", angle: 0  },
  { imei: "D025", nickname: "DAF Padova",     plate: "PD 012 CD", brand: "DAF",    model: "CF 440",      lat: 45.4078, lon: 11.8765, status: "driving", angle: 180 },
  // ── Sicilia ──
  { imei: "D026", nickname: "MAN Palermo",    plate: "CJ 712 IJ", brand: "MAN",    model: "TGS 26.460",  lat: 38.1157, lon: 13.3615, status: "working", angle: 0  },
  { imei: "D027", nickname: "Iveco Palermo",  plate: "PA 345 EF", brand: "Iveco",  model: "Stralis 460", lat: 38.1345, lon: 13.3789, status: "resting", angle: 0  },
  { imei: "D028", nickname: "Volvo Catania",  plate: "CT 678 GH", brand: "Volvo",  model: "FH 500",      lat: 37.5023, lon: 15.0872, status: "driving", angle: 90 },
  // ── Sardegna ──
  { imei: "D029", nickname: "DAF Cagliari",   plate: "CA 234 KL", brand: "DAF",    model: "XF 480",      lat: 39.2238, lon: 9.1217,  status: "driving", angle: 135 },
  { imei: "D030", nickname: "Scania Sassari", plate: "SS 567 MN", brand: "Scania", model: "S580",        lat: 40.7259, lon: 8.5556,  status: "resting", angle: 0  },
  // ── Genova / Liguria ──
  { imei: "D031", nickname: "Iveco Genova",   plate: "GE 345 QR", brand: "Iveco",  model: "S-Way 570",   lat: 44.4065, lon: 8.9335,  status: "driving", angle: 90 },
  // ── Ancona ──
  { imei: "D032", nickname: "Volvo Ancona",   plate: "AN 678 ST", brand: "Volvo",  model: "FH 460",      lat: 43.6158, lon: 13.5189, status: "driving", angle: 150 },
  // ── Pescara ──
  { imei: "D033", nickname: "Scania Pescara", plate: "PE 901 UV", brand: "Scania", model: "S580",        lat: 42.3540, lon: 14.1689, status: "driving", angle: 200 },
  // ── Calabria ──
  { imei: "D034", nickname: "DAF Catanzaro",  plate: "RE 389 KL", brand: "DAF",    model: "CF 530",      lat: 38.9100, lon: 16.5872, status: "resting", angle: 0  },
  // ── A1 autostrada ──
  { imei: "D035", nickname: "MAN A1 Sud",     plate: "CB 234 WX", brand: "MAN",    model: "TGX 26.480",  lat: 41.5612, lon: 14.6654, status: "driving", angle: 195 },
] as const;

/* ─── Contact Gate Modal ────────────────────────────────────── */
type ContactGateProps = { isOpen: boolean; onClose: () => void; trigger?: string };

function ContactGate({ isOpen, onClose, trigger }: ContactGateProps) {
  const [name,      setName]      = React.useState("");
  const [email,     setEmail]     = React.useState("");
  const [company,   setCompany]   = React.useState("");
  const [fleet,     setFleet]     = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted,  setSubmitted]  = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 900));
    setSubmitting(false);
    setSubmitted(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center px-4 py-8">
      <button type="button" aria-label="Chiudi" onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c0d] p-8 shadow-[0_32px_80px_rgba(0,0,0,0.7)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,122,26,0.6),transparent)" }} />

        {submitted ? (
          <div className="flex flex-col items-center gap-6 py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10">
              <i className="fa fa-check text-xl text-orange-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Richiesta inviata!</h3>
              <p className="mt-2 text-sm text-white/60">Ti contatteremo a breve per attivare il tuo accesso completo a Truckly.</p>
            </div>
            <button type="button" onClick={onClose}
              className="h-10 rounded-full border border-white/20 px-6 text-xs uppercase tracking-[0.2em] text-white/70 transition hover:text-white">
              Chiudi
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className="mb-1 text-[10px] uppercase tracking-[0.26em] text-orange-400/80">{trigger || "Funzione avanzata"}</p>
              <h3 className="text-xl font-semibold text-white">Vuoi accedere a questa funzione?</h3>
              <p className="mt-2 text-sm text-white/60">La versione demo mostra solo la localizzazione. Lascia i tuoi dati per ricevere accesso completo.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { label: "Nome e Cognome *", type: "text",  value: name,    set: setName,    placeholder: "Mario Rossi",            required: true },
                { label: "Email *",          type: "email", value: email,   set: setEmail,   placeholder: "mario@azienda.it",       required: true },
                { label: "Azienda *",        type: "text",  value: company, set: setCompany, placeholder: "Trasporti Rossi S.r.l.", required: true },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-white/50">{f.label}</label>
                  <input required={f.required} type={f.type} value={f.value}
                    onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder}
                    className="w-full rounded-lg border border-white/10 bg-[#111113] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-orange-500/50" />
                </div>
              ))}
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-white/50">N° mezzi in flotta</label>
                <select value={fleet} onChange={(e) => setFleet(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#111113] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500/50">
                  <option value="">Seleziona</option>
                  <option value="1-5">1 – 5 mezzi</option>
                  <option value="6-20">6 – 20 mezzi</option>
                  <option value="21-50">21 – 50 mezzi</option>
                  <option value="50+">Oltre 50 mezzi</option>
                </select>
              </div>
              <button type="submit" disabled={submitting}
                className="h-11 w-full rounded-full text-xs font-semibold uppercase tracking-[0.2em] text-white transition disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#ff7a1a,#ff9a4a)", boxShadow: "0 0 28px rgba(255,122,26,0.35)" }}>
                {submitting ? "Invio in corso…" : "Richiedi accesso completo"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── DemoPage ──────────────────────────────────────────────── */
export function DemoPage() {
  const [quickSidebarOpen, setQuickSidebarOpen] = React.useState(false);
  const [gate, setGate] = React.useState({ open: false, trigger: "" });

  const openGate = React.useCallback((trigger: string) => {
    setGate({ open: true, trigger });
  }, []);

  /* Intercept all non-map platform events → contact gate */
  React.useEffect(() => {
    const gated: [string, string][] = [
      ["truckly:driver-open",       "Percorsi e rewind"],
      ["truckly:bottom-bar-toggle", "Analisi consumi & carburante"],
      ["truckly:rewind-start",      "Rewind percorso"],
      ["truckly:alert-open",        "Alert intelligenti"],
      ["truckly:report-open",       "Report & tachigrafo"],
      ["truckly:tacho-open",        "Tachigrafo digitale"],
    ];

    const handlers = gated.map(([event, trigger]) => {
      const fn = (e: Event) => { e.stopImmediatePropagation(); openGate(trigger); };
      window.addEventListener(event, fn, true); // capture → fires before platform listeners
      return { event, fn };
    });

    /* Quick sidebar toggle (this one is allowed) */
    const onQuickToggle = () => setQuickSidebarOpen((p) => !p);
    window.addEventListener("truckly:quick-sidebar", onQuickToggle);

    return () => {
      handlers.forEach(({ event, fn }) => window.removeEventListener(event, fn, true));
      window.removeEventListener("truckly:quick-sidebar", onQuickToggle);
    };
  }, [openGate]);

  /* Expose gate trigger for any inline popup buttons */
  React.useEffect(() => {
    (window as any).__trucklyDemoGate = openGate;
    return () => { delete (window as any).__trucklyDemoGate; };
  }, [openGate]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#080809]">

      {/* ── Demo banner ─────────────────────────────────────── */}
      <div
        className="relative z-[1500] flex shrink-0 items-center justify-between gap-4 px-4 py-1.5"
        style={{ background: "rgba(8,6,3,0.95)", borderBottom: "1px solid rgba(255,122,26,0.28)", backdropFilter: "blur(8px)" }}
      >
        <div className="flex items-center gap-2 text-[11px] text-orange-300/80">
          <span className="h-1.5 w-1.5 rounded-full"
            style={{ background: "#ff7a1a", boxShadow: "0 0 6px rgba(255,122,26,0.9)", animation: "truckly-typing-blink 1.4s ease-in-out infinite" }} />
          <span className="uppercase tracking-[0.2em]">Demo live</span>
          <span className="hidden text-white/30 sm:inline">·</span>
          <span className="hidden text-white/40 sm:inline">Veicoli fittizi · Solo localizzazione attiva</span>
        </div>
        <button type="button" onClick={() => openGate("Accesso completo")}
          className="h-7 shrink-0 rounded-full px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white"
          style={{ background: "linear-gradient(135deg,#ff7a1a,#ff9a4a)" }}>
          Richiedi accesso
        </button>
      </div>

      {/* ── Real platform ────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden pb-[52px]">
        <Navbar />
        <MapContainer vehicles={DEMO_VEHICLES as any} />
        <QuickSidebar
          isOpen={quickSidebarOpen}
          onClose={() => setQuickSidebarOpen(false)}
          vehicles={DEMO_VEHICLES as any}
        />
      </div>

      {/* ── Locked feature bar ──────────────────────────────── */}
      <div
        className="relative z-[1200] flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-2.5 backdrop-blur"
        style={{ background: "rgba(11,11,12,0.94)" }}
      >
        {[
          { icon: "fa-tint",        label: "Analisi consumi",      trigger: "Analisi consumi" },
          { icon: "fa-road",        label: "Percorsi e rewind",    trigger: "Percorsi e rewind" },
          { icon: "fa-bell",        label: "Alert in tempo reale", trigger: "Alert intelligenti" },
          { icon: "fa-id-card",     label: "Gestione autisti",     trigger: "Gestione autisti" },
          { icon: "fa-file-text-o", label: "Report & tachigrafo",  trigger: "Report & tachigrafo" },
        ].map((feat) => (
          <button key={feat.label} type="button" onClick={() => openGate(feat.trigger)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/50 transition hover:border-white/20 hover:text-white/80">
            <i className={`fa ${feat.icon} text-[11px] text-white/30`} aria-hidden="true" />
            <span className="hidden sm:inline">{feat.label}</span>
            <i className="fa fa-lock text-[9px] text-orange-500/60" aria-hidden="true" />
          </button>
        ))}
        <button type="button" onClick={() => openGate("Accesso completo")}
          className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-[11px] text-orange-300/80 transition hover:bg-orange-500/15">
          <i className="fa fa-unlock-alt text-[11px]" aria-hidden="true" />
          Sblocca tutto
        </button>
      </div>

      {/* ── Contact gate modal ──────────────────────────────── */}
      <ContactGate
        isOpen={gate.open}
        onClose={() => setGate((g) => ({ ...g, open: false }))}
        trigger={gate.trigger}
      />
    </div>
  );
}
