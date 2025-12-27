import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type QuickSidebarProps = {
  isOpen: boolean;
  onClose?: () => void;
  vehicles: Array<{
    imei: string;
    nickname?: string;
    name?: string;
    plate?: string | { v?: string; value?: string };
    status?: string;
  }>;
};

const normalizePlate = (plate: QuickSidebarProps["vehicles"][number]["plate"]) => {
  if (!plate) return "--";
  if (typeof plate === "string") return plate;
  return plate.v || plate.value || "--";
};

const getStatusMeta = (status?: string) => {
  const raw = typeof status === "string" ? status.toLowerCase() : "";
  if (raw === "driving" || raw === "moving") {
    return { label: "In marcia", className: "bg-emerald-500/20 text-emerald-200" };
  }
  if (raw === "working") {
    return { label: "Lavoro", className: "bg-amber-500/20 text-amber-200" };
  }
  if (raw === "resting" || raw === "stopped" || raw === "fermo") {
    return { label: "Fermo", className: "bg-rose-500/20 text-rose-200" };
  }
  return { label: status || "Online", className: "bg-white/10 text-white/70" };
};

export function QuickSidebar({ isOpen, onClose, vehicles }: QuickSidebarProps) {
  const [activeTab, setActiveTab] = React.useState<"vehicles" | "drivers">("vehicles");

  const sortedVehicles = React.useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const aLabel = (a.nickname || a.name || a.imei || "").toString();
      const bLabel = (b.nickname || b.name || b.imei || "").toString();
      return aLabel.localeCompare(bLabel, "it-IT", { sensitivity: "base" });
    });
  }, [vehicles]);

  return (
    <aside
      className={`fixed top-0 bottom-0 left-0 z-40 w-[92vw] max-w-[440px] border-r border-white/10 bg-[#0e0f14] text-[#f8fafc] flex flex-col pt-16 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isOpen ? "translate-x-0" : "-translate-x-full pointer-events-none opacity-0"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-start justify-between px-5 py-5 border-b border-white/10">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Vista rapida</p>
          <h2 className="text-xl font-semibold leading-tight text-white">Veicoli</h2>
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

      <div className="px-5 pt-3">
        <div className="flex items-center gap-4 text-sm text-white/70">
          <button
            type="button"
            onClick={() => setActiveTab("vehicles")}
            className={`pb-2 uppercase tracking-[0.12em] text-xs ${
              activeTab === "vehicles" ? "text-white" : "text-white/50"
            }`}
          >
            Veicoli
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("drivers")}
            className={`pb-2 uppercase tracking-[0.12em] text-xs ${
              activeTab === "drivers" ? "text-white" : "text-white/50"
            }`}
          >
            Autisti
          </button>
        </div>
        <div className="h-[3px] w-28 rounded-full bg-white/10">
          <div
            className={`h-full rounded-full bg-white transition-transform duration-200 ${
              activeTab === "vehicles" ? "translate-x-0 w-14" : "translate-x-14 w-14"
            }`}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {activeTab === "vehicles" ? (
          sortedVehicles.length ? (
            sortedVehicles.map((vehicle) => {
              const plate = normalizePlate(vehicle.plate);
              const label = vehicle.nickname || vehicle.name || plate || vehicle.imei;
              const subtitle = `${plate} | ${vehicle.imei || "--"}`;
              const status = getStatusMeta(vehicle.status);
              return (
                <div
                  key={vehicle.imei}
                  className="rounded-2xl border border-white/10 bg-[#10121a] shadow-[0_14px_30px_rgba(0,0,0,0.35)] cursor-pointer"
                  onClick={() => (window as any).trucklyFlyToVehicle?.(vehicle)}
                >
                  <div className="flex items-start justify-between gap-3 px-4 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-base font-semibold text-white">{label}</div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-white/55 mt-1">{subtitle}</div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(event) => event.stopPropagation()}
                          className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 transition inline-flex items-center justify-center"
                          aria-label="Apri menu veicolo"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          >
                            <path d="M4 7h16M4 12h16M4 17h16" />
                          </svg>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[180px]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onSelect={() => (window as any).trucklyFlyToVehicle?.(vehicle)}
                        >
                          Dettagli veicolo
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            (window as any).trucklyFlyToVehicle?.(vehicle);
                            window.dispatchEvent(
                              new CustomEvent("truckly:driver-open", {
                                detail: { imei: vehicle.imei },
                              }),
                            );
                          }}
                        >
                          Autista
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            (window as any).trucklyFlyToVehicle?.(vehicle);
                            window.dispatchEvent(
                              new CustomEvent("truckly:bottom-bar-toggle", {
                                detail: { mode: "fuel", imei: vehicle.imei },
                              }),
                            );
                          }}
                        >
                          Carburante
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#0c0f16] px-4 py-4 text-sm text-white/60">
              Nessun veicolo disponibile.
            </div>
          )
        ) : (
          <div className="rounded-xl border border-white/10 bg-[#0c0f16] px-4 py-4 text-sm text-white/60">
            Elenco autisti disponibile a breve.
          </div>
        )}
      </div>
    </aside>
  );
}
