import React from "react";
import { HomeNavbar } from "../components/home-navbar";

/* ─── Static counter data ───────────────────────────────────── */
const STATS = [
  { value: 500, suffix: "+", label: "Flotte gestite" },
  { value: 99.9, suffix: "%", label: "Uptime garantito" },
  { value: 24, suffix: "/7", label: "Supporto attivo" },
  { value: 3, suffix: "s", label: "Aggiornamento live" },
];

/* ─── Feature cards ─────────────────────────────────────────── */
const FEATURES = [
  {
    icon: "fa-map-marker",
    title: "Localizzazione live",
    body: "Ogni mezzo è visibile sulla mappa in tempo reale, con aggiornamento continuo e clustering intelligente.",
    accent: false,
  },
  {
    icon: "fa-tint",
    title: "Analisi consumi",
    body: "Rileva rifornimenti, prelievi e anomalie di carburante automaticamente, con grafici dettagliati per ogni mezzo.",
    accent: false,
  },
  {
    icon: "fa-road",
    title: "Rewind percorso",
    body: "Scorri la timeline di ogni viaggio, evento per evento. Ottimizza le rotte e analizza le soste.",
    accent: true,
  },
  {
    icon: "fa-bell",
    title: "Alert intelligenti",
    body: "Notifiche personalizzabili potenziate da AI. Sappi subito cosa conta, senza rumore di fondo.",
    accent: false,
  },
  {
    icon: "fa-id-card-o",
    title: "Gestione autisti",
    body: "Abbina conducenti ai mezzi, monitora i tempi di guida e mantieni la conformità alle normative EU.",
    accent: false,
  },
  {
    icon: "fa-download",
    title: "Tachigrafo digitale",
    body: "Scarica e archivia i file tachigrafo direttamente dalla piattaforma. Zero carte volanti.",
    accent: false,
  },
];

/* ─── Steps ─────────────────────────────────────────────────── */
const HOW_STEPS = [
  { n: "01", title: "Installa il dispositivo", body: "Dispositivo GPS plug-and-play su ogni mezzo. Nessun cablaggio, nessun tecnico." },
  { n: "02", title: "Connetti la piattaforma", body: "Il mezzo appare subito sulla mappa. Dati in tempo reale dal primo accensione." },
  { n: "03", title: "Analizza e ottimizza", body: "Dashboard, alert e report ti mostrano dove agire. Meno sprechi, più controllo." },
];

/* ─── Animated counter hook ─────────────────────────────────── */
function useCountUp(target: number, duration = 1600, start = false) {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    if (!start) return;
    let raf: number;
    const startTime = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return val;
}

/* ─── Intersection observer helper ─────────────────────────── */
function useInView(threshold = 0.35) {
  const ref = React.useRef<HTMLElement>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ─── Stat counter item ─────────────────────────────────────── */
function StatItem({ value, suffix, label, animate }: { value: number; suffix: string; label: string; animate: boolean }) {
  const count = useCountUp(value, 1800, animate);
  const display = value % 1 !== 0 ? count.toFixed(1) : Math.floor(count).toString();
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span
        className="text-4xl md:text-5xl font-bold tabular-nums"
        style={{ background: "linear-gradient(135deg, #ffffff, #ff9a4a)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
      >
        {display}{suffix}
      </span>
      <span className="text-xs uppercase tracking-[0.24em] text-white/50">{label}</span>
    </div>
  );
}

/* ─── HomePage ──────────────────────────────────────────────── */
export function HomePage() {
  const statsSection = useInView(0.4);

  return (
    <div className="truckly-home min-h-screen bg-[#080809] text-white overflow-x-hidden">

      {/* ══════════ HERO ══════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">
        {/* Layered background */}
        <div className="pointer-events-none absolute inset-0">
          {/* Grid */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "80px 80px",
              maskImage: "radial-gradient(ellipse 80% 60% at 20% 30%, black 30%, transparent 80%)",
            }}
          />
          {/* Glow radials */}
          <div
            className="absolute opacity-80"
            style={{
              inset: "-20% -10% auto -10%",
              height: "100%",
              background: "radial-gradient(ellipse 60% 50% at 15% 25%, rgba(255,122,26,0.22) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 75% 15%, rgba(255,160,80,0.1) 0%, transparent 55%)",
            }}
          />
          {/* Bottom fade */}
          <div
            className="absolute bottom-0 inset-x-0 h-40"
            style={{ background: "linear-gradient(to bottom, transparent, #080809)" }}
          />
        </div>

        <HomeNavbar />

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-6 pb-16 pt-4 md:grid md:grid-cols-[1fr_0.85fr] md:gap-16 md:pt-0">
          {/* Copy column */}
          <div className="flex flex-col justify-center gap-8">
            {/* Badge */}
            <div>
              <span
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.24em]"
                style={{
                  background: "rgba(255,122,26,0.1)",
                  border: "1px solid rgba(255,122,26,0.3)",
                  color: "rgba(255,190,140,0.9)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#ff7a1a", boxShadow: "0 0 6px rgba(255,122,26,0.9)", animation: "truckly-typing-blink 1.4s ease-in-out infinite" }}
                />
                Piattaforma TMS italiana
              </span>
            </div>

            <div className="space-y-4">
              <h1
                className="truckly-fade-up"
                style={{
                  fontSize: "clamp(2.6rem, 5.5vw, 4.2rem)",
                  fontWeight: 700,
                  lineHeight: 1.05,
                  letterSpacing: "-0.03em",
                }}
              >
                Gestisci la tua flotta.
                <br />
                <span style={{ background: "linear-gradient(135deg, #ff7a1a, #ffb347)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Senza compromessi.
                </span>
              </h1>
              <p className="truckly-fade-up max-w-[480px] text-base text-white/60 leading-relaxed" style={{ animationDelay: "0.1s" }}>
                Localizzazione live, analisi consumi, gestione autisti e tachigrafo digitale — tutto in un'unica piattaforma costruita per chi lavora sul campo.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 truckly-fade-up" style={{ animationDelay: "0.2s" }}>
              <a
                href="/accesso"
                className="inline-flex h-12 items-center rounded-full px-7 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #ff7a1a, #ff9a4a)", boxShadow: "0 0 32px rgba(255,122,26,0.35)" }}
              >
                Richiedi accesso
              </a>
              <a
                href="/demo"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 px-7 text-sm uppercase tracking-[0.2em] text-white/70 transition hover:border-white/30 hover:text-white"
              >
                <i className="fa fa-play-circle text-orange-400/80 text-sm" aria-hidden="true" />
                Guarda la demo
              </a>
              <a
                href="/login"
                className="inline-flex h-12 items-center rounded-full border border-white/10 px-6 text-sm uppercase tracking-[0.2em] text-white/55 transition hover:text-white"
              >
                Accedi
              </a>
            </div>
          </div>

          {/* Visual column */}
          <div className="relative flex items-center justify-center">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* ══════════ STATS ═════════════════════════════════════ */}
      <section
        ref={statsSection.ref as React.RefObject<HTMLElement>}
        className="mx-auto w-full max-w-5xl px-6 py-20"
      >
        <div
          className="rounded-3xl px-8 py-12 md:px-16"
          style={{
            background: "linear-gradient(135deg, rgba(255,122,26,0.08) 0%, rgba(20,18,16,0.95) 60%)",
            border: "1px solid rgba(255,122,26,0.18)",
            boxShadow: "0 0 80px rgba(255,122,26,0.06)",
          }}
        >
          <div className="grid grid-cols-2 gap-y-10 gap-x-8 md:grid-cols-4">
            {STATS.map((s) => (
              <StatItem key={s.label} value={s.value} suffix={s.suffix} label={s.label} animate={statsSection.inView} />
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FEATURES ══════════════════════════════════ */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-20" id="funzioni">
        <div className="mb-12 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-400/70 mb-3">Funzioni chiave</p>
          <h2
            style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", fontWeight: 700, letterSpacing: "-0.02em" }}
          >
            Tutto quello che serve,{" "}
            <span style={{ background: "linear-gradient(90deg, #ff7a1a, #ffb347)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              a portata di tap.
            </span>
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feat, i) => (
            <FeatureCard key={feat.title} {...feat} delay={i * 0.06} />
          ))}
        </div>
      </section>

      {/* ══════════ HOW IT WORKS + CTA wrapped in scroll truck ═ */}
      <div className="relative">
      <ScrollTruck />

      <section className="mx-auto w-full max-w-5xl px-6 pb-20" id="piattaforma">
        <div className="mb-12 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-400/70 mb-3">Processo</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Operativo in tre passi.
          </h2>
        </div>

        <div className="relative grid gap-6 md:grid-cols-3">
          {/* Connector line desktop */}
          <div
            className="pointer-events-none absolute top-9 hidden h-px md:block"
            style={{
              left: "calc(33.3% + 2rem)",
              right: "calc(33.3% + 2rem)",
              background: "linear-gradient(90deg, rgba(255,122,26,0.4), rgba(255,122,26,0.1), rgba(255,122,26,0.4))",
            }}
          />
          {HOW_STEPS.map((step, i) => (
            <HowStep key={step.n} {...step} delay={i * 0.1} />
          ))}
        </div>
      </section>

      {/* ══════════ AGENT NATE ════════════════════════════════ */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-20" id="integrazioni">
        <div
          className="overflow-hidden rounded-3xl"
          style={{
            background: "linear-gradient(145deg, rgba(18,16,14,0.98), rgba(10,10,12,0.98))",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
          }}
        >
          <div className="grid md:grid-cols-2">
            {/* Left text */}
            <div
              className="flex flex-col justify-center gap-4 p-10 md:p-12"
              style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span
                className="w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em]"
                style={{ background: "rgba(255,122,26,0.1)", border: "1px solid rgba(255,122,26,0.3)", color: "rgba(255,190,140,0.9)" }}
              >
                AI Agent
              </span>
              <h3 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                Piacere,{" "}
                <span style={{ background: "linear-gradient(135deg, #ff7a1a, #ffb347)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Nate.
                </span>
              </h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Nate risponde alle tue domande sulla flotta, genera report su richiesta e ti avvisa proattivamente. Basta chiedere in linguaggio naturale.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {["Report istantanei", "Anomalie AI", "Audit automatico"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/50"
                    style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Right chat preview */}
            <div className="flex flex-col justify-center gap-3 p-10 md:p-12">
              <NateChatPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ SECURITY / OPS ════════════════════════════ */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-20" id="sicurezza">
        <div className="grid gap-5 md:grid-cols-2">
          <GlassCard accent={false}>
            <p className="text-xs uppercase tracking-[0.28em] text-white/40 mb-2">Sicurezza</p>
            <h3 className="text-xl font-semibold mb-3">Accessi semplici, tutto al sicuro.</h3>
            <p className="text-sm text-white/55 leading-relaxed mb-5">
              Ruoli, permessi granulari e audit trail completo. Decidi chi può vedere cosa con un click.
            </p>
            <div className="flex flex-wrap gap-2">
              {["Ruoli & permessi", "Audit trail", "Cronologia accessi"].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/45"
                  style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
                >
                  {chip}
                </span>
              ))}
            </div>
          </GlassCard>

          <GlassCard accent>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-[0.28em] text-white/50">Operatività 24/7</p>
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "#ff7a1a", boxShadow: "0 0 10px rgba(255,122,26,0.7)", animation: "truckly-typing-blink 1.6s ease-in-out infinite" }}
              />
            </div>
            <h3 className="text-xl font-semibold mb-3">Veloce, stabile, sempre pronto.</h3>
            <p className="text-sm text-white/60 leading-relaxed mb-5">
              Meno clic, più tempo alla flotta. Ogni dato risponde in tempo reale, su desktop e mobile.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Risposta mappa", val: "< 1s" },
                { label: "Aggiorn. GPS", val: "Live" },
                { label: "Visibilità mezzi", val: "Sempre" },
                { label: "Alert critici", val: "Istantanei" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl px-3 py-3 text-sm"
                  style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
                >
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-1">{row.label}</div>
                  <div className="font-semibold text-white">{row.val}</div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ══════════ CTA ═══════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-4xl px-6 pb-24" id="cta-section">
        <div
          className="relative overflow-hidden rounded-3xl px-8 py-14 text-center md:px-16"
          style={{
            background: "linear-gradient(135deg, rgba(255,122,26,0.12) 0%, rgba(14,12,10,0.98) 55%)",
            border: "1px solid rgba(255,122,26,0.2)",
            boxShadow: "0 0 100px rgba(255,122,26,0.08)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,122,26,0.6), transparent)" }}
          />
          <p className="text-xs uppercase tracking-[0.3em] text-orange-400/70 mb-4">Inizia oggi</p>
          <h2 style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "1rem" }}>
            Pronto a prendere il controllo della tua flotta?
          </h2>
          <p className="mx-auto max-w-lg text-base text-white/55 leading-relaxed mb-8">
            Setup in meno di 24 ore. Nessun contratto a lungo termine. Solo risultati.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="/accesso"
              className="inline-flex h-12 items-center rounded-full px-8 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #ff7a1a, #ff9a4a)", boxShadow: "0 0 36px rgba(255,122,26,0.4)" }}
            >
              Richiedi accesso gratuito
            </a>
            <a
              href="/demo"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 px-7 text-sm uppercase tracking-[0.2em] text-white/65 transition hover:border-orange-500/30 hover:text-white"
            >
              <i className="fa fa-play-circle text-orange-400/70" aria-hidden="true" />
              Demo live
            </a>
          </div>
        </div>
      </section>

      </div>{/* end scroll-truck wrapper */}

      {/* ══════════ FOOTER ════════════════════════════════════ */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-8 text-xs text-white/40">
          <div className="flex items-center gap-3">
            <img src="/assets/images/logo_white.png" alt="Truckly" className="h-5 w-auto opacity-60" loading="lazy" />
            <span>Truckly © 2026 · Made in Italy</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="/demo" className="hover:text-white transition">Demo</a>
            <a href="/login" className="hover:text-white transition">Accesso</a>
            <a href="#" className="hover:text-white transition">Privacy</a>
            <a href="#" className="hover:text-white transition">Contatti</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Seeded RNG ─────────────────────────────────────────────── */
function seededRng(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/* ─── Spinning globe (canvas-based, orthographic projection) ── */
function HeroVisual() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SIZE = 420;
    const cx = SIZE / 2, cy = SIZE / 2;
    const R  = SIZE * 0.415;
    const TILT = 0.28; // axial tilt radians (~16°)

    /* Orthographic projection with Y-axis spin + X-axis tilt */
    const project = (latDeg: number, lonDeg: number, rot: number) => {
      const phi   = latDeg * Math.PI / 180;
      const theta = lonDeg * Math.PI / 180;
      // 3-D on unit sphere
      const x3 = Math.cos(phi) * Math.sin(theta);
      const y3 = Math.sin(phi);
      const z3 = Math.cos(phi) * Math.cos(theta);
      // Y-axis rotation (spin)
      const xR = x3 * Math.cos(rot) + z3 * Math.sin(rot);
      const yR = y3;
      const zR = -x3 * Math.sin(rot) + z3 * Math.cos(rot);
      // X-axis tilt
      const xT = xR;
      const yT = yR * Math.cos(TILT) - zR * Math.sin(TILT);
      const zT = yR * Math.sin(TILT) + zR * Math.cos(TILT);
      return { x: cx + R * xT, y: cy - R * yT, visible: zT > 0, depth: zT };
    };

    /* Generate world background dots (city lights effect) */
    const rng1 = seededRng(42);
    const WORLD_REGIONS = [
      { lat: [35, 72], lon: [-10, 40],   n: 140, bright: 0.55 }, // Europe
      { lat: [25, 50], lon: [-85, -65],  n:  80, bright: 0.45 }, // Eastern USA
      { lat: [30, 50], lon: [-125,-100], n:  40, bright: 0.38 }, // Western USA
      { lat: [20, 50], lon: [100, 145],  n: 110, bright: 0.48 }, // East Asia
      { lat: [8,  35], lon: [67,   88],  n:  60, bright: 0.38 }, // India
      { lat: [-10,22], lon: [95,  125],  n:  50, bright: 0.35 }, // SE Asia
      { lat: [-40,10], lon: [-75, -35],  n:  60, bright: 0.32 }, // S. America
      { lat: [20, 40], lon: [35,   65],  n:  40, bright: 0.32 }, // Middle East
      { lat: [-40,-15],lon: [140, 155],  n:  28, bright: 0.32 }, // Australia E
      { lat: [50, 65], lon: [30,   80],  n:  35, bright: 0.22 }, // Russia
      { lat: [-5, 15], lon: [-20,  20],  n:  28, bright: 0.26 }, // W Africa
    ];
    const worldDots: { lat: number; lon: number; r: number; a: number }[] = [];
    WORLD_REGIONS.forEach(({ lat, lon, n, bright }) => {
      for (let i = 0; i < n; i++) {
        worldDots.push({
          lat: lat[0] + rng1() * (lat[1] - lat[0]),
          lon: lon[0] + rng1() * (lon[1] - lon[0]),
          r: 0.7 + rng1() * 1.1,
          a: bright * (0.45 + rng1() * 0.55),
        });
      }
    });

    /* Dense Italy/Europe fleet dots (~900 representing fleet) */
    const rng2 = seededRng(123);
    const fleetDots: { lat: number; lon: number }[] = [];
    for (let i = 0; i < 900; i++) {
      fleetDots.push({
        lat: 37 + rng2() * 10,
        lon: 7  + rng2() * 11,
      });
    }

    /* Initial rotation: Italy (≈12°E) faces viewer */
    let rotation = -(12 * Math.PI / 180);
    let animating = true;
    let raf: number;

    const render = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);

      /* — Sphere fill — */
      const bgGrd = ctx.createRadialGradient(cx - R * 0.22, cy - R * 0.22, 0, cx, cy, R);
      bgGrd.addColorStop(0,   "#2d1600");
      bgGrd.addColorStop(0.5, "#130900");
      bgGrd.addColorStop(1,   "#050200");
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = bgGrd; ctx.fill();

      /* — Lat/lon grid lines — */
      ctx.strokeStyle = "rgba(255,110,30,0.07)";
      ctx.lineWidth   = 0.6;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let gap = true;
        for (let lon = -180; lon <= 180; lon += 3) {
          const p = project(lat, lon, rotation);
          if (p.visible) { gap ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); gap = false; }
          else gap = true;
        }
        ctx.stroke();
      }
      for (let lon = -180; lon < 180; lon += 30) {
        ctx.beginPath();
        let gap = true;
        for (let lat = -80; lat <= 80; lat += 2) {
          const p = project(lat, lon, rotation);
          if (p.visible) { gap ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); gap = false; }
          else gap = true;
        }
        ctx.stroke();
      }

      /* — World background dots — */
      worldDots.forEach((d) => {
        const p = project(d.lat, d.lon, rotation);
        if (!p.visible) return;
        const alpha = d.a * (0.35 + 0.65 * p.depth);
        ctx.beginPath(); ctx.arc(p.x, p.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,160,60,${alpha.toFixed(3)})`; ctx.fill();
      });

      /* — Fleet dots (Italy / Europe, brighter + glow) — */
      fleetDots.forEach((d) => {
        const p = project(d.lat, d.lon, rotation);
        if (!p.visible) return;
        const alpha = 0.6 + 0.4 * p.depth;
        // glow halo
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 4.5);
        grd.addColorStop(0, `rgba(255,122,26,${(alpha * 0.55).toFixed(3)})`);
        grd.addColorStop(1, "rgba(255,122,26,0)");
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        // core
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,190,110,${alpha.toFixed(3)})`; ctx.fill();
      });

      ctx.restore();

      /* — Atmosphere rim glow — */
      const rimGrd = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.22);
      rimGrd.addColorStop(0,   "rgba(255,90,20,0)");
      rimGrd.addColorStop(0.4, "rgba(255,90,20,0.09)");
      rimGrd.addColorStop(1,   "rgba(255,90,20,0)");
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = rimGrd; ctx.fill();

      /* — Edge stroke — */
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,110,30,0.25)"; ctx.lineWidth = 1.5; ctx.stroke();

      rotation += 0.0022;
    };

    const animate = () => {
      if (!animating) return;
      render();
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => { animating = false; cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer glow */}
      <div className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,100,20,0.12) 0%, transparent 70%)", filter: "blur(20px)" }} />
      <canvas
        ref={canvasRef}
        width={420} height={420}
        style={{ borderRadius: "50%", boxShadow: "0 0 60px rgba(255,90,20,0.18), 0 0 120px rgba(255,90,20,0.08)" }}
      />
      {/* Floating label */}
      <div className="absolute bottom-8 right-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/50 backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full"
          style={{ background: "#ff7a1a", boxShadow: "0 0 6px rgba(255,122,26,0.9)", animation: "truckly-typing-blink 1.6s ease-in-out infinite" }} />
        Flotta live
      </div>
    </div>
  );
}

/* ─── Feature card ──────────────────────────────────────────── */
function FeatureCard({ icon, title, body, accent, delay }: { icon: string; title: string; body: string; accent: boolean; delay: number }) {
  return (
    <div
      className="truckly-fade-up group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1"
      style={{
        animationDelay: `${delay}s`,
        background: accent
          ? "linear-gradient(160deg, rgba(25,18,12,0.97), rgba(12,10,8,0.97))"
          : "linear-gradient(160deg, rgba(16,16,18,0.96), rgba(10,10,12,0.97))",
        border: accent ? "1px solid rgba(255,140,60,0.2)" : "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
      }}
    >
      <div
        className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm"
        style={{
          background: accent ? "rgba(255,122,26,0.15)" : "rgba(255,255,255,0.05)",
          border: accent ? "1px solid rgba(255,122,26,0.3)" : "1px solid rgba(255,255,255,0.1)",
          color: accent ? "#ff9a4a" : "rgba(255,255,255,0.6)",
        }}
      >
        <i className={`fa ${icon}`} aria-hidden="true" />
      </div>
      <h3 className="mb-2 text-base font-semibold text-white">{title}</h3>
      <p className="text-sm text-white/55 leading-relaxed">{body}</p>
    </div>
  );
}

/* ─── How step ──────────────────────────────────────────────── */
function HowStep({ n, title, body, delay }: { n: string; title: string; body: string; delay: number }) {
  return (
    <div
      className="truckly-fade-up flex flex-col gap-4 rounded-2xl p-7"
      style={{
        animationDelay: `${delay}s`,
        background: "linear-gradient(160deg, rgba(16,16,18,0.96), rgba(10,10,12,0.97))",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
      }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold tabular-nums"
        style={{ background: "rgba(255,122,26,0.12)", border: "1px solid rgba(255,122,26,0.3)", color: "#ff9a4a" }}
      >
        {n}
      </div>
      <div>
        <h4 className="font-semibold text-white mb-1.5">{title}</h4>
        <p className="text-sm text-white/55 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

/* ─── Glass card wrapper ────────────────────────────────────── */
function GlassCard({ children, accent }: { children: React.ReactNode; accent: boolean }) {
  return (
    <div
      className="rounded-2xl p-8"
      style={{
        background: accent
          ? "linear-gradient(160deg, rgba(25,18,12,0.97), rgba(10,10,12,0.97))"
          : "linear-gradient(160deg, rgba(15,15,17,0.96), rgba(10,10,12,0.97))",
        border: accent ? "1px solid rgba(255,140,60,0.2)" : "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </div>
  );
}

/* ─── Scroll truck ──────────────────────────────────────────── */
function ScrollTruck() {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    const onScroll = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const { top, height } = el.getBoundingClientRect();
      const wrapTop = top + window.scrollY;
      const midY = window.scrollY + window.innerHeight * 0.55;
      const p = Math.max(0, Math.min(1, (midY - wrapTop) / (height * 0.88)));
      setProgress(p);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      {/* Road strip — right side, pointer-events-none */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 top-0 hidden md:block"
        style={{ right: "clamp(16px, 3vw, 48px)", width: 32, zIndex: 0 }}
      >
        {/* Asphalt */}
        <div className="absolute inset-x-0 top-0 bottom-0 rounded-full"
          style={{ background: "linear-gradient(180deg, transparent, rgba(20,12,4,0.6) 8%, rgba(18,10,3,0.85) 20%, rgba(18,10,3,0.85) 80%, rgba(20,12,4,0.6) 92%, transparent)" }} />
        {/* Center dashes */}
        <div className="absolute top-0 bottom-0"
          style={{ left: "50%", width: 2, transform: "translateX(-50%)",
            backgroundImage: "repeating-linear-gradient(180deg, rgba(255,255,255,0.22) 0, rgba(255,255,255,0.22) 14px, transparent 14px, transparent 28px)" }} />
        {/* Truck SVG */}
        <div
          style={{ position: "absolute", left: "50%", top: `${progress * 92}%`,
            transform: "translate(-50%, -50%) rotate(180deg)",
            transition: "top 80ms linear", filter: "drop-shadow(0 0 6px rgba(255,122,26,0.5))" }}
        >
          <svg width="24" height="48" viewBox="0 0 24 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Trailer */}
            <rect x="3" y="2" width="18" height="24" rx="2" fill="#cc5500" />
            <rect x="5" y="4" width="14" height="20" rx="1" fill="rgba(255,255,255,0.06)" />
            {/* Connector */}
            <rect x="9" y="25" width="6" height="4" rx="1" fill="#aa4400" />
            {/* Cab */}
            <rect x="3" y="29" width="18" height="14" rx="2" fill="#ff7a1a" />
            {/* Windscreen */}
            <rect x="6" y="31" width="12" height="8" rx="1" fill="rgba(0,0,0,0.45)" />
            {/* Headlights */}
            <rect x="4" y="41" width="4" height="2" rx="1" fill="#fff8e0" />
            <rect x="16" y="41" width="4" height="2" rx="1" fill="#fff8e0" />
            {/* Wheels */}
            <rect x="1"  y="30" width="4" height="7" rx="2" fill="#1a1a1a" />
            <rect x="19" y="30" width="4" height="7" rx="2" fill="#1a1a1a" />
            <rect x="1"  y="7"  width="4" height="7" rx="2" fill="#1a1a1a" />
            <rect x="19" y="7"  width="4" height="7" rx="2" fill="#1a1a1a" />
          </svg>
        </div>
      </div>

      {/* Page sections as children */}
      {/* This component is used as a layout wrapper — children rendered by parent */}
    </div>
  );
}

/* ─── Nate chat preview ─────────────────────────────────────── */
function NateChatPreview() {
  const bubbles = [
    { from: "user", text: "Fammi il report della settimana" },
    { from: "nate", text: "Fatto. Ho preparato il riepilogo: 12 mezzi attivi, 3 anomalie carburante, 0 infrazioni tachigrafo." },
    { from: "user", text: "Quanti km ha percorso il mezzo AB 123 CD ieri?" },
    { from: "nate", text: "AB 123 CD ha percorso 487 km ieri, con 2 soste e un rifornimento di 82 L." },
  ];

  return (
    <div className="space-y-3">
      {bubbles.map((b, i) => (
        <div
          key={i}
          className={`flex gap-2 text-sm ${b.from === "user" ? "flex-row-reverse" : ""}`}
        >
          <div
            className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
            style={
              b.from === "nate"
                ? { background: "rgba(255,122,26,0.2)", border: "1px solid rgba(255,122,26,0.35)", color: "#ff9a4a" }
                : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" }
            }
          >
            {b.from === "nate" ? "N" : "T"}
          </div>
          <div
            className="max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed"
            style={
              b.from === "nate"
                ? { background: "rgba(255,122,26,0.1)", border: "1px solid rgba(255,122,26,0.2)", color: "rgba(255,200,160,0.9)" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }
            }
          >
            {b.text}
          </div>
        </div>
      ))}
    </div>
  );
}
