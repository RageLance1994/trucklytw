import React from "react";
import { HomeNavbar } from "../components/home-navbar";

/* ─── Shared section wrapper ─────────────────────────────────── */
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

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="ml-4 space-y-1.5 list-none">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orange-500/60" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─── PrivacyPage ────────────────────────────────────────────── */
export function PrivacyPage() {
  const lastUpdated = "17 marzo 2026";

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
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-white/45">
            Ultimo aggiornamento: {lastUpdated}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-6 py-14">

        <Section title="1. Titolare del Trattamento">
          <P>
            Il Titolare del Trattamento dei dati personali è <strong className="text-white/80">ATS S.r.l.</strong>,
            con sede legale in Italia, operante attraverso la piattaforma <strong className="text-white/80">Truckly</strong>.
          </P>
          <P>
            Per qualsiasi richiesta relativa al trattamento dei dati personali è possibile contattarci
            all'indirizzo e-mail:{" "}
            <a
              href="mailto:administration@atsco.it"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300"
            >
              administration@atsco.it
            </a>
          </P>
        </Section>

        <Section title="2. Tipologie di Dati Trattati">
          <P>
            Truckly tratta le seguenti categorie di dati personali in relazione all'utilizzo della
            piattaforma e dei servizi correlati:
          </P>
          <Ul
            items={[
              "Dati anagrafici e di contatto: nome, cognome, indirizzo e-mail, numero di telefono, ragione sociale dell'azienda.",
              "Dati di accesso: credenziali di autenticazione (username/e-mail e hash della password), log di accesso, indirizzi IP, timestamp delle sessioni.",
              "Dati telematici dei veicoli: posizione GPS (latitudine, longitudine), velocità, angolo di marcia, stato motore/accensione, dati dal tachigrafo digitale, dati di consumo carburante.",
              "Dati degli autisti: nome, cognome, numero carta tachigrafica, orari di guida, soste e periodi di riposo, attività registrate.",
              "Dati di utilizzo della piattaforma: log delle funzioni utilizzate, preferenze interfaccia, eventi di navigazione interni.",
              "Dati di fatturazione: dati necessari alla gestione del contratto e all'emissione di fatture.",
            ]}
          />
        </Section>

        <Section title="3. Finalità e Basi Giuridiche del Trattamento">
          <P>I dati personali vengono trattati per le seguenti finalità:</P>
          <Ul
            items={[
              "Esecuzione del contratto (art. 6, par. 1, lett. b GDPR): erogazione dei servizi di localizzazione, monitoraggio fleet e gestione tachigrafo sottoscritti dall'utente.",
              "Obbligo legale (art. 6, par. 1, lett. c GDPR): conservazione dei dati fiscali e dei registri delle attività richiesta dalla normativa vigente.",
              "Legittimo interesse (art. 6, par. 1, lett. f GDPR): sicurezza informatica della piattaforma, prevenzione di frodi e abusi, miglioramento del servizio tramite analisi aggregata e anonimizzata.",
              "Consenso (art. 6, par. 1, lett. a GDPR): invio di comunicazioni commerciali e di aggiornamenti sul prodotto, laddove richiesto.",
            ]}
          />
        </Section>

        <Section title="4. Comunicazione e Condivisione dei Dati">
          <P>
            I dati personali non sono venduti a terzi. Possono essere comunicati esclusivamente a:
          </P>
          <Ul
            items={[
              "Fornitori di servizi tecnici: provider di infrastruttura cloud (es. Google Cloud Platform), utilizzati per hosting e storage nel rispetto delle garanzie GDPR.",
              "Soggetti autorizzati internamente: dipendenti e collaboratori di ATS S.r.l. che necessitano dei dati per le finalità indicate.",
              "Autorità pubbliche: ove richiesto da obblighi normativi o provvedimenti dell'Autorità.",
            ]}
          />
          <P>
            Qualsiasi trasferimento di dati verso paesi extra-SEE avviene esclusivamente nel rispetto
            degli artt. 44-49 del GDPR (clausole contrattuali standard o decisioni di adeguatezza).
          </P>
        </Section>

        <Section title="5. Conservazione dei Dati">
          <P>
            I dati vengono conservati per il tempo strettamente necessario al raggiungimento delle
            finalità per cui sono stati raccolti:
          </P>
          <Ul
            items={[
              "Dati di accesso e log di sicurezza: 12 mesi dalla registrazione.",
              "Dati telematici dei veicoli: 24 mesi dalla rilevazione, salvo diversi accordi contrattuali.",
              "Dati tachigrafo autisti: 24 mesi, in conformità al Regolamento (UE) n. 165/2014.",
              "Dati di fatturazione: 10 anni, come previsto dalla normativa fiscale italiana.",
              "Dati per comunicazioni commerciali (con consenso): fino alla revoca del consenso.",
            ]}
          />
        </Section>

        <Section title="6. Diritti dell'Interessato">
          <P>
            In qualità di interessato, hai il diritto di:
          </P>
          <Ul
            items={[
              "Accesso (art. 15 GDPR): ottenere conferma del trattamento e copia dei dati personali.",
              "Rettifica (art. 16 GDPR): correggere dati inesatti o incompleti.",
              "Cancellazione (art. 17 GDPR): richiedere la cancellazione dei dati (\"diritto all'oblio\"), nei limiti previsti dalla legge.",
              "Limitazione del trattamento (art. 18 GDPR): richiedere la sospensione del trattamento in determinati casi.",
              "Portabilità (art. 20 GDPR): ricevere i propri dati in formato strutturato e leggibile da dispositivo automatico.",
              "Opposizione (art. 21 GDPR): opporsi al trattamento fondato su legittimo interesse.",
              "Revoca del consenso: in qualsiasi momento, senza pregiudizio per la liceità del trattamento precedente.",
            ]}
          />
          <P>
            Per esercitare i tuoi diritti scrivici a{" "}
            <a
              href="mailto:administration@atsco.it"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300"
            >
              administration@atsco.it
            </a>
            . Hai inoltre il diritto di proporre reclamo al Garante per la protezione dei dati personali
            (
            <a
              href="https://www.garanteprivacy.it"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300"
            >
              www.garanteprivacy.it
            </a>
            ).
          </P>
        </Section>

        <Section title="7. Sicurezza dei Dati">
          <P>
            Adottiamo misure tecniche e organizzative adeguate per proteggere i dati personali da
            accessi non autorizzati, perdita, divulgazione o alterazione. Tra queste: cifratura TLS/HTTPS
            per tutte le trasmissioni, controllo degli accessi basato su ruoli, monitoraggio continuo
            dell'infrastruttura e audit periodici della sicurezza.
          </P>
        </Section>

        <Section title="8. Cookie">
          <P>
            Per informazioni dettagliate sull'utilizzo dei cookie, ti invitiamo a consultare la nostra{" "}
            <a
              href="/cookie-policy"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300"
            >
              Cookie Policy
            </a>
            .
          </P>
        </Section>

        <Section title="9. Modifiche alla Privacy Policy">
          <P>
            La presente Privacy Policy può essere aggiornata periodicamente per riflettere modifiche
            normative o ai nostri servizi. La data di ultimo aggiornamento è indicata in cima al documento.
            In caso di modifiche sostanziali, gli utenti registrati saranno informati via e-mail o
            tramite avviso in piattaforma.
          </P>
        </Section>

        {/* Bottom divider */}
        <div className="mt-12 border-t border-white/8 pt-8 text-xs text-white/30">
          © 2026 ATS S.r.l. · Truckly · Tutti i diritti riservati ·{" "}
          <a href="/cookie-policy" className="hover:text-white/60 transition">Cookie Policy</a>
        </div>
      </div>
    </div>
  );
}
