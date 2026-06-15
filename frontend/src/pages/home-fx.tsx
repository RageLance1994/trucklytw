import React from "react";

/* ════════════════════════════════════════════════════════════
   Truckly — Home: journey "vista aerea"
   Camion dall'alto che segue una rotta serpeggiante su scroll,
   tappe come pin sulla mappa, arrivo dentro la CTA.
   ════════════════════════════════════════════════════════════ */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function usePrefersReducedMotion() {
  // La home e' un'esperienza animata per scelta: ignoriamo prefers-reduced-motion
  // cosi' journey, camion e scroll sono sempre quelli approvati.
  return false;
}

const ROUTE = "M50 6 C78 44 78 86 50 122 C24 158 24 196 50 226 C76 256 50 266 50 282";

const STOPS: { t: string; b: string }[] = [
  { t: "Localizzazione live", b: "Ogni mezzo sulla mappa in tempo reale, update ogni 3 secondi, clustering intelligente." },
  { t: "Analisi consumi", b: "Rifornimenti, prelievi e anomalie di carburante rilevati in automatico." },
  { t: "Rewind del percorso", b: "Riavvolgi ogni viaggio evento per evento. Soste e deviazioni sotto controllo." },
  { t: "Tachigrafo digitale", b: "Scarico e archiviazione dei file in piattaforma. Conformità EU, zero carte." },
  { t: "Autisti & rotte", b: "Abbini conducenti ai mezzi, monitori i tempi di guida, ottimizzi le rotte." },
];

const ICONS: React.ReactNode[] = [
  <svg key="i0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>,
  <svg key="i1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3s6 6.2 6 10a6 6 0 1 1-12 0c0-3.8 6-10 6-10z" /></svg>,
  <svg key="i2" viewBox="0 0 24 24" fill="currentColor"><polygon points="11 18 3 12 11 6" /><polygon points="21 18 13 12 21 6" /></svg>,
  <svg key="i3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19a8 8 0 1 1 16 0" /><path d="M12 19l4.6-5" /></svg>,
  <svg key="i4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>,
];

function TopTruck() {
  return (
    <svg width="58" height="104" viewBox="0 0 58 104" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tkATr" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a7f89" /><stop offset=".5" stopColor="#33363d" /><stop offset="1" stopColor="#7a7f89" />
        </linearGradient>
        <linearGradient id="tkACab" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffc488" /><stop offset=".5" stopColor="#ff7a1a" /><stop offset="1" stopColor="#c2540f" />
        </linearGradient>
      </defs>
      <rect x="11" y="40" width="36" height="60" rx="7" fill="url(#tkATr)" stroke="rgba(0,0,0,.35)" strokeWidth="1" />
      <line x1="29" y1="44" x2="29" y2="96" stroke="rgba(255,255,255,.14)" strokeWidth="1" />
      <rect x="12" y="37" width="34" height="4" rx="1.5" fill="#0b0b0f" />
      <rect x="14" y="5" width="30" height="33" rx="7" fill="url(#tkACab)" stroke="rgba(0,0,0,.3)" strokeWidth="1" />
      <rect x="18" y="9" width="22" height="11" rx="3" fill="#0b1a24" opacity=".85" />
      <rect x="7" y="13" width="6" height="4" rx="1.5" fill="#1a1a20" /><rect x="45" y="13" width="6" height="4" rx="1.5" fill="#1a1a20" />
      <circle cx="20" cy="6.5" r="1.8" fill="#fff6dc" /><circle cx="38" cy="6.5" r="1.8" fill="#fff6dc" />
      <circle cx="17" cy="98" r="1.6" fill="#ff5a3c" /><circle cx="41" cy="98" r="1.6" fill="#ff5a3c" />
    </svg>
  );
}

export function AerialJourney() {
  const reduced = usePrefersReducedMotion();
  const secRef = React.useRef<HTMLElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const roadRef = React.useRef<SVGPathElement | null>(null);
  const traceRef = React.useRef<SVGPathElement | null>(null);
  const truckRef = React.useRef<HTMLDivElement | null>(null);
  const mapheadRef = React.useRef<HTMLDivElement | null>(null);
  const destRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (reduced) return;
    const sec = secRef.current, svg = svgRef.current, road = roadRef.current, trace = traceRef.current,
      truck = truckRef.current, maphead = mapheadRef.current, dest = destRef.current;
    if (!sec || !svg || !road || !trace || !truck || !maphead || !dest) return;

    const pins = Array.from(sec.querySelectorAll<HTMLElement>(".tk-pin"));
    const stops = Array.from(sec.querySelectorAll<HTMLElement>(".tk-stop"));
    const fr = [0.08, 0.3, 0.5, 0.7, 0.86];
    const L = road.getTotalLength();
    const TL = trace.getTotalLength();
    trace.style.strokeDasharray = String(TL);
    trace.style.strokeDashoffset = String(TL);

    const px = (pt: DOMPoint) => ({ x: (pt.x / 100) * svg.clientWidth, y: (pt.y / 300) * svg.clientHeight });
    const place = () => {
      fr.forEach((f, i) => {
        const p = px(road.getPointAtLength(f * L));
        if (pins[i]) { pins[i].style.left = p.x + "px"; pins[i].style.top = p.y + "px"; }
        if (stops[i]) stops[i].style.top = (p.y - 40) + "px";
      });
      const pe = px(road.getPointAtLength(L));
      dest.style.left = pe.x + "px";
      dest.style.top = pe.y + "px";
    };
    place();
    window.addEventListener("resize", place);

    let raf = 0;
    let running = false;
    const loop = () => {
      const r = sec.getBoundingClientRect();
      const vh = window.innerHeight;
      const den = sec.offsetHeight - vh || 1;
      const p = clamp(-r.top / den, 0, 1);

      const mo = clamp(1 - (p - 0.02) / 0.06, 0, 1);
      maphead.style.opacity = String(mo);
      maphead.style.transform = `translateY(${-(1 - mo) * 16}px)`;

      const len = p * L;
      const a = px(road.getPointAtLength(len));
      const t1 = px(road.getPointAtLength(Math.max(0, len - 2)));
      const t2 = px(road.getPointAtLength(Math.min(L, len + 2)));
      const ang = Math.atan2(t2.y - t1.y, t2.x - t1.x) * 180 / Math.PI + 90;
      truck.style.left = a.x + "px";
      truck.style.top = a.y + "px";
      truck.style.transform = `translate(-50%,-50%) rotate(${ang}deg)`;
      truck.style.opacity = p > 0.9 ? String(Math.max(0, 1 - (p - 0.9) / 0.06)) : "1";

      trace.style.strokeDashoffset = String(TL * (1 - p));

      fr.forEach((f, i) => {
        const on = Math.abs(p - f) < 0.11;
        pins[i]?.classList.toggle("on", on);
        stops[i]?.classList.toggle("on", on);
      });
      dest.classList.toggle("on", p > 0.9);

      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !running) { running = true; raf = requestAnimationFrame(loop); }
      else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
    }, { threshold: 0 });
    io.observe(sec);

    return () => { running = false; cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener("resize", place); };
  }, [reduced]);

  if (reduced) {
    return (
      <section id="piattaforma" className="tk-journey-list">
        <h2 className="tk-maphead" style={{ position: "static", fontSize: "clamp(1.8rem,5vw,3rem)", fontWeight: 700, marginBottom: 30 }}>
          La tua flotta, <span style={{ color: "var(--o)" }}>a portata di mano.</span>
        </h2>
        {STOPS.map((s, i) => (
          <div className="row" key={i}>
            <span className="tk-ic">{ICONS[i]}</span>
            <div>
              <h3 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(1.4rem,3vw,2rem)", fontWeight: 600, margin: "0 0 8px" }}>{s.t}</h3>
              <p style={{ fontFamily: "Manrope, sans-serif", color: "rgba(255,255,255,.6)", margin: 0, lineHeight: 1.55 }}>{s.b}</p>
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section id="piattaforma" className="tk-map" ref={secRef as React.RefObject<HTMLElement>}>
      <div className="tk-grid2" />
      <div className="tk-maphead" ref={mapheadRef}>
        <h2>La tua flotta, <span className="o">a portata di mano.</span></h2>
      </div>
      <svg className="tk-routeSvg" viewBox="0 0 100 300" preserveAspectRatio="none" ref={svgRef} aria-hidden="true">
        <path ref={roadRef} d={ROUTE} fill="none" stroke="#15151b" strokeWidth={10} strokeLinecap="round" />
        <path d={ROUTE} fill="none" stroke="#2c2c34" strokeWidth={0.5} strokeDasharray="1.6 2.6" />
        <path ref={traceRef} d={ROUTE} fill="none" stroke="#ef6f15" strokeWidth={3.2} strokeLinecap="round" />
      </svg>
      <div aria-hidden="true">{STOPS.map((_, i) => <span className="tk-pin" key={i} />)}</div>
      <div>
        {STOPS.map((s, i) => (
          <article className={"tk-stop " + (i % 2 ? "r" : "l")} key={i} style={i % 2 ? { right: "7%" } : { left: "7%" }}>
            <div className="tk-ic">{ICONS[i]}</div>
            <h3>{s.t}</h3>
            <p>{s.b}</p>
          </article>
        ))}
      </div>
      <div className="tk-truck" ref={truckRef}><TopTruck /></div>
      <div className="tk-dest" ref={destRef}>
        <a className="tk-btn p" href="/accesso">Richiedi accesso →</a>
      </div>
    </section>
  );
}
