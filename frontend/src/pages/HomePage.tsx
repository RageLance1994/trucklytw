import React from "react";
import Lenis from "lenis";
import { HomeNavbar } from "../components/home-navbar";
import "./home-cinematic.css";
import { usePrefersReducedMotion, AerialJourney } from "./home-fx";

/* ════════════════════════════════════════════════════════════
   Truckly — Home "vista aerea"
   Hero editoriale (titolo cinetico + spotlight) · journey aereo
   (camion che serpeggia sulla rotta) · smooth-scroll Lenis.
   FX pesanti in ./home-fx.
   ════════════════════════════════════════════════════════════ */

function ScrollProgress() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const d = document.documentElement;
      const m = d.scrollHeight - d.clientHeight;
      el.style.transform = `scaleX(${m > 0 ? d.scrollTop / m : 0})`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <div className="tk-progress" ref={ref} aria-hidden="true" />;
}

export function HomePage() {
  const reduced = usePrefersReducedMotion();
  const heroRef = React.useRef<HTMLElement | null>(null);
  const spotRef = React.useRef<HTMLDivElement | null>(null);

  // smooth-scroll Lenis
  React.useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, [reduced]);

  // spotlight che segue il cursore sul titolo
  React.useEffect(() => {
    if (reduced) return;
    const hero = heroRef.current, spot = spotRef.current;
    if (!hero || !spot) return;
    const box = () => hero.getBoundingClientRect();
    const cur = { x: window.innerWidth * 0.3, y: window.innerHeight * 0.42 };
    const tgt = { x: cur.x, y: cur.y };
    const t0 = performance.now();
    let last = 0;
    const onMove = (e: PointerEvent) => { const b = box(); tgt.x = e.clientX - b.left; tgt.y = e.clientY - b.top; last = performance.now(); };
    window.addEventListener("pointermove", onMove, { passive: true });
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const it = Math.min((now - t0) / 1600, 1);
      const b = box();
      if (it < 1) { tgt.x = b.width * (0.12 + 0.34 * (1 - Math.pow(1 - it, 3))); tgt.y = b.height * 0.42; }
      else if (now - last > 1100) { tgt.x = b.width * (0.4 + Math.sin(now * 4e-4) * 0.22); tgt.y = b.height * (0.42 + Math.cos(now * 5e-4) * 0.12); }
      cur.x += (tgt.x - cur.x) * 0.07; cur.y += (tgt.y - cur.y) * 0.07;
      spot.style.setProperty("--mx", cur.x + "px");
      spot.style.setProperty("--my", cur.y + "px");
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("pointermove", onMove); };
  }, [reduced]);

  return (
    <div className="tk-home">
      <ScrollProgress />

      <section className="tk-hero" ref={heroRef as React.RefObject<HTMLElement>}>
        <div className="tk-ghost" aria-hidden="true">Senza compromessi — Flotta — Senza compromessi — Flotta — Senza compromessi — Flotta — </div>
        <div className="tk-ghost b" aria-hidden="true">Realtime — In rotta — Realtime — In rotta — Realtime — In rotta — Realtime — In rotta — </div>
        <div className="tk-spot" ref={spotRef} aria-hidden="true" />

        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}>
          <HomeNavbar />
        </div>

        <div className="tk-herowrap">
          <h1 className="tk-title">
            <span className="tk-ln"><span>Gestisci</span></span>
            <span className="tk-ln"><span>la tua flotta,</span></span>
            <span className="tk-ln"><span className="tk-acc">senza compromessi.</span></span>
          </h1>
          <p className="tk-sub">
            Localizzazione live, consumi, autisti e tachigrafo digitale. Una piattaforma per chi vive sulla strada.
          </p>
          <div className="tk-cta">
            <a className="tk-btn p" href="/accesso">Richiedi accesso →</a>
            <a className="tk-btn g" href="/login">Accedi ↗</a>
          </div>
        </div>
      </section>

      <AerialJourney />

      <footer className="tk-ft">
        <div className="tk-ftin">
          <div className="tk-ftbrand">
            <img src="/assets/images/logo_white.png" alt="Truckly" loading="lazy" />
            <p>Gestione flotta e tracciamento in tempo reale. Costruito per chi vive sulla strada.</p>
          </div>
          <div className="tk-ftco">
            <div className="tk-ftco-name">TLT S.R.L.S.</div>
            <p>Corso Umberto I 187 — 84013 Cava de' Tirreni (SA)</p>
            <p>P. IVA / C.F. 06419150658 · REA SA-521773</p>
            <p>PEC: <a href="mailto:tltsrls@arubapec.it">tltsrls@arubapec.it</a></p>
          </div>
        </div>
        <div className="tk-ftbar">
          <span>© 2026 Truckly — TLT S.R.L.S. · Tutti i diritti riservati</span>
          <span className="tk-ftlinks">
            <a href="/privacy">Privacy</a>
            <a href="/cookie-policy">Cookie</a>
            <a href="/login">Accedi</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
