import React from "react";
import { Button } from "../components/ui/button";
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
  { n: "01", title: "Installa il dispositivo", body: "GPS Teltonika plug-and-play su ogni mezzo. Nessun cablaggio, nessun tecnico." },
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

      {/* ══════════ HOW IT WORKS ══════════════════════════════ */}
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
      <section className="mx-auto w-full max-w-4xl px-6 pb-24">
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

/* ─── Hero visual component ─────────────────────────────────── */
function HeroVisual() {
  return (
    <div
      className="relative w-full max-w-[480px]"
      style={{ minHeight: 340, borderRadius: 28, background: "linear-gradient(160deg, rgba(20,17,14,0.96), rgba(8,8,10,0.98))", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 32px 80px rgba(0,0,0,0.55)" }}
    >
      {/* Glow */}
      <div
        className="pointer-events-none absolute"
        style={{ inset: "15% 10% auto 8%", height: 120, borderRadius: 999, background: "radial-gradient(circle, rgba(255,160,100,0.35), transparent 70%)", filter: "blur(6px)", opacity: 0.75 }}
      />
      {/* Orbit rings */}
      <div className="pointer-events-none absolute" style={{ width: 220, height: 220, top: 40, left: 40, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.1)" }} />
      <div className="pointer-events-none absolute" style={{ width: 300, height: 300, top: 80, right: -20, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.07)" }} />
      {/* Line separators */}
      <div className="pointer-events-none absolute" style={{ height: 1, left: "12%", right: "18%", top: "52%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)" }} />
      <div className="pointer-events-none absolute" style={{ height: 1, left: "20%", right: "12%", top: "72%", background: "linear-gradient(90deg, transparent, rgba(255,140,60,0.3), transparent)" }} />
      {/* Live badge */}
      <div
        className="absolute flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/60"
        style={{ right: 28, top: 24, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(10,10,10,0.7)", backdropFilter: "blur(8px)" }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: "rgba(255,140,60,0.85)", boxShadow: "0 0 8px rgba(255,140,60,0.7)", animation: "truckly-typing-blink 1.6s ease-in-out infinite" }}
        />
        Orbita live
      </div>
      {/* Mock vehicle cards */}
      <div className="absolute bottom-8 left-8 right-8 space-y-2">
        {[
          { plate: "AB 123 CD", status: "driving", color: "#22c55e", label: "In marcia" },
          { plate: "EF 456 GH", status: "resting", color: "#ef4444", label: "Fermo" },
        ].map((v) => (
          <div
            key={v.plate}
            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-xs"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center gap-2 text-white/80 font-medium">{v.plate}</div>
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: v.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color, boxShadow: `0 0 6px ${v.color}88` }} />
              {v.label}
            </span>
          </div>
        ))}
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
