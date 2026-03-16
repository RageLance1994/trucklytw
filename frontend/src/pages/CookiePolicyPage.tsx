import React from "react";
import { HomeNavbar } from "../components/home-navbar";

/* ─── Shared helpers ─────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2
        className="mb-4 text-lg font-semibold text-white"
        style={{ letterSpacing: "-0.01em" }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-white/65">
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

type CookieRow = {
  name: string;
  provider: string;
  purpose: string;
  duration: string;
  type: "essenziale" | "funzionale" | "analitico";
};

function CookieTable({ rows }: { rows: CookieRow[] }) {
  const typeColors: Record<CookieRow["type"], string> = {
    essenziale: "text-emerald-400/80 bg-emerald-500/10 border-emerald-500/20",
    funzionale: "text-amber-400/80 bg-amber-500/10 border-amber-500/20",
    analitico:  "text-blue-400/80 bg-blue-500/10 border-blue-500/20",
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8 bg-white/[0.03]">
            {["Nome", "Provider", "Finalità", "Durata", "Tipo"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.18em] text-white/40 font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.02]">
              <td className="px-4 py-3 font-mono text-white/80 text-[11px]">{row.name}</td>
              <td className="px-4 py-3 text-white/50">{row.provider}</td>
              <td className="px-4 py-3 text-white/55 max-w-[220px]">{row.purpose}</td>
              <td className="px-4 py-3 text-white/50 whitespace-nowrap">{row.duration}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${typeColors[row.type]}`}
                >
                  {row.type}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── CookiePolicyPage ───────────────────────────────────────── */
export function CookiePolicyPage() {
  const lastUpdated = "17 marzo 2026";

  const essentialCookies: CookieRow[] = [
    {
      name: "truckly_session",
      provider: "Truckly",
      purpose: "Mantiene la sessione autenticata dell'utente all'interno della piattaforma.",
      duration: "Sessione (chiusura browser)",
      type: "essenziale",
    },
    {
      name: "truckly_csrf",
      provider: "Truckly",
      purpose: "Protezione contro attacchi CSRF (Cross-Site Request Forgery).",
      duration: "Sessione",
      type: "essenziale",
    },
    {
      name: "truckly:map-style",
      provider: "Truckly",
      purpose: "Salva la preferenza dello stile mappa selezionato dall'utente (localStorage).",
      duration: "Persistente (localStorage)",
      type: "funzionale",
    },
    {
      name: "truckly:marker-style",
      provider: "Truckly",
      purpose: "Salva la preferenza dello stile marker veicoli (localStorage).",
      duration: "Persistente (localStorage)",
      type: "funzionale",
    },
  ];

  const functionalCookies: CookieRow[] = [
    {
      name: "__Secure-next-auth.*",
      provider: "Truckly",
      purpose: "Gestione dell'autenticazione sicura e del token di sessione.",
      duration: "30 giorni",
      type: "essenziale",
    },
  ];

  const analyticsCookies: CookieRow[] = [
    {
      name: "_ga, _ga_*",
      provider: "Google LLC",
      purpose: "Google Analytics: misura le sessioni, i pageview e il comportamento degli utenti in forma anonima e aggregata.",
      duration: "2 anni",
      type: "analitico",
    },
    {
      name: "_gid",
      provider: "Google LLC",
      purpose: "Google Analytics: distingue gli utenti unici (dati aggregati).",
      duration: "24 ore",
      type: "analitico",
    },
  ];

  return (
    <div className="min-h-screen bg-[#080809] text-white">
      <HomeNavbar />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 15% 40%, rgba(255,122,26,0.18) 0%, transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-6 py-16 md:py-20">
          <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-orange-400/70">
            Documento legale
          </p>
          <h1
            className="font-bold leading-tight"
            style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.03em" }}
          >
            Cookie Policy
          </h1>
          <p className="mt-3 text-sm text-white/45">
            Ultimo aggiornamento: {lastUpdated}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-6 py-14">

        <Section title="1. Cosa sono i Cookie">
          <P>
            I cookie sono piccoli file di testo che i siti web salvano sul dispositivo dell'utente
            (computer, tablet, smartphone) durante la navigazione. Consentono al sito di ricordare
            le azioni e le preferenze dell'utente nel tempo, in modo che quest'ultimo non debba
            re-inserirle ogni volta che torna sul sito.
          </P>
          <P>
            Truckly utilizza anche tecnologie analoghe come il <strong className="text-white/75">localStorage</strong> del browser,
            che funziona in modo simile ma non prevede scadenza automatica. Nella presente Policy
            il termine "cookie" si riferisce in senso lato a tutte queste tecnologie.
          </P>
        </Section>

        <Section title="2. Tipologie di Cookie Utilizzati">
          <P>
            La piattaforma Truckly utilizza le seguenti categorie di cookie:
          </P>

          {/* Essential */}
          <div className="mt-4 mb-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-block rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-emerald-400/80">
                Essenziali
              </span>
              <span className="text-white/40 text-xs">— sempre attivi, non richiedono consenso</span>
            </div>
            <P>
              Necessari al funzionamento della piattaforma. Senza di essi non è possibile utilizzare
              il servizio (autenticazione, sicurezza, sessione). Non possono essere disattivati.
            </P>
          </div>
          <CookieTable rows={essentialCookies} />

          {/* Functional */}
          <div className="mt-6 mb-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-block rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-400/80">
                Funzionali
              </span>
              <span className="text-white/40 text-xs">— migliorano l'esperienza utente</span>
            </div>
            <P>
              Permettono alla piattaforma di ricordare le preferenze dell'utente (es. stile della mappa,
              layout dei marker). Non raccolgono dati personali identificativi.
            </P>
          </div>
          <CookieTable rows={functionalCookies} />

          {/* Analytics */}
          <div className="mt-6 mb-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-block rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-blue-400/80">
                Analitici
              </span>
              <span className="text-white/40 text-xs">— richiedono consenso</span>
            </div>
            <P>
              Utilizziamo Google Analytics (con IP anonimizzato) per comprendere come gli utenti
              interagiscono con la piattaforma, migliorare le funzionalità e rilevare eventuali
              problemi tecnici. I dati sono aggregati e non permettono l'identificazione del singolo utente.
            </P>
          </div>
          <CookieTable rows={analyticsCookies} />
        </Section>

        <Section title="3. Cookie di Terze Parti">
          <P>
            I cookie analitici di Google Analytics sono gestiti da Google LLC, con sede negli
            Stati Uniti. Il trasferimento dei dati verso gli USA avviene nel rispetto delle clausole
            contrattuali standard approvate dalla Commissione Europea. Per maggiori informazioni
            sulla privacy di Google:{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300"
            >
              policies.google.com/privacy
            </a>
            . Per disattivare Google Analytics:{" "}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300"
            >
              Google Analytics Opt-out
            </a>
            .
          </P>
        </Section>

        <Section title="4. Gestione e Revoca del Consenso">
          <P>
            Al primo accesso alla piattaforma, viene mostrato un banner informativo che consente
            di accettare o rifiutare i cookie non essenziali. Il consenso può essere revocato o
            modificato in qualsiasi momento tramite le impostazioni del browser o contattandoci
            all'indirizzo{" "}
            <a
              href="mailto:administration@atsco.it"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300"
            >
              administration@atsco.it
            </a>
            .
          </P>
          <P>
            È possibile gestire i cookie anche direttamente dal browser. Di seguito le guide per i
            browser più diffusi:
          </P>
          <div className="flex flex-wrap gap-3 mt-2">
            {[
              { label: "Google Chrome",  url: "https://support.google.com/chrome/answer/95647" },
              { label: "Mozilla Firefox", url: "https://support.mozilla.org/kb/enhanced-tracking-protection-firefox-desktop" },
              { label: "Apple Safari",   url: "https://support.apple.com/guide/safari/manage-cookies-sfri11471" },
              { label: "Microsoft Edge", url: "https://support.microsoft.com/microsoft-edge/delete-cookies-in-microsoft-edge-63947406" },
            ].map((b) => (
              <a
                key={b.label}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/55 transition hover:border-white/20 hover:text-white/80"
              >
                <i className="fa fa-external-link text-[9px] text-orange-500/50" aria-hidden="true" />
                {b.label}
              </a>
            ))}
          </div>
          <P>
            Si segnala che la disattivazione di cookie essenziali potrebbe compromettere il
            corretto funzionamento della piattaforma.
          </P>
        </Section>

        <Section title="5. Durata della Conservazione">
          <P>
            I cookie di sessione vengono eliminati automaticamente alla chiusura del browser.
            I cookie persistenti rimangono sul dispositivo per la durata indicata nella tabella
            della sezione 2, salvo cancellazione anticipata da parte dell'utente.
          </P>
        </Section>

        <Section title="6. Aggiornamenti della Cookie Policy">
          <P>
            La presente Cookie Policy può essere aggiornata per riflettere modifiche tecniche,
            normative o ai servizi utilizzati. La data di ultimo aggiornamento è sempre indicata
            in cima al documento. In caso di modifiche sostanziali agli utenti registrati verrà
            data comunicazione tramite e-mail o avviso in piattaforma.
          </P>
        </Section>

        <Section title="7. Contatti">
          <P>
            Per qualsiasi domanda relativa all'utilizzo dei cookie o per esercitare i propri diritti
            in materia di dati personali, contattare il Titolare del trattamento:{" "}
            <a
              href="mailto:administration@atsco.it"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300"
            >
              administration@atsco.it
            </a>
          </P>
          <P>
            Per ulteriori informazioni sul trattamento dei dati personali consulta la nostra{" "}
            <a
              href="/privacy"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300"
            >
              Privacy Policy
            </a>
            .
          </P>
        </Section>

        {/* Bottom divider */}
        <div className="mt-12 border-t border-white/8 pt-8 text-xs text-white/30">
          © 2026 ATS S.r.l. · Truckly · Tutti i diritti riservati ·{" "}
          <a href="/privacy" className="hover:text-white/60 transition">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
