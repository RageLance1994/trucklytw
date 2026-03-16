import React, { useEffect, useState } from "react";

const STORAGE_KEY = "truckly:cookie-consent";

type ConsentState = "accepted" | "rejected" | null;

export function CookieBanner() {
  const [consent, setConsent] = useState<ConsentState>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ConsentState | null;
    if (!stored) {
      // Small delay so the page renders first
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
    setConsent(stored);
  }, []);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setConsent("accepted");
    setVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem(STORAGE_KEY, "rejected");
    setConsent("rejected");
    setVisible(false);
  };

  if (!visible || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Preferenze cookie"
      className={`
        fixed bottom-0 left-0 right-0 z-[9999]
        transition-transform duration-500 ease-out
        ${visible ? "translate-y-0" : "translate-y-full"}
      `}
    >
      {/* Backdrop gradient */}
      <div
        className="pointer-events-none absolute bottom-full left-0 right-0 h-24"
        style={{
          background:
            "linear-gradient(to top, rgba(8,8,9,0.85) 0%, transparent 100%)",
        }}
      />

      {/* Banner card */}
      <div
        className="relative border-t border-white/[0.07] bg-[#0f0f10]/95 backdrop-blur-xl"
        style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.6)" }}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Icon */}
          <div className="hidden shrink-0 sm:flex items-center justify-center w-9 h-9 rounded-full bg-orange-500/10 border border-orange-500/20">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-orange-400/80"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </div>

          {/* Text */}
          <p className="flex-1 text-[12.5px] leading-relaxed text-white/55">
            Utilizziamo cookie tecnici essenziali e, con il tuo consenso, cookie
            analitici (Google Analytics con IP anonimizzato) per migliorare la
            piattaforma. I dati analitici sono aggregati e non identificano il
            singolo utente.{" "}
            <a
              href="/cookie-policy"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300 transition"
            >
              Cookie Policy
            </a>{" "}
            ·{" "}
            <a
              href="/privacy"
              className="text-orange-400/80 underline underline-offset-2 hover:text-orange-300 transition"
            >
              Privacy Policy
            </a>
          </p>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleReject}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] text-white/50 transition hover:border-white/20 hover:text-white/80"
            >
              Solo essenziali
            </button>
            <button
              onClick={handleAccept}
              className="rounded-lg bg-orange-500 px-4 py-2 text-[12px] font-medium text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 active:scale-[0.98]"
            >
              Accetta tutti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
