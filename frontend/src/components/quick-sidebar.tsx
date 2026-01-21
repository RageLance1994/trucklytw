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
    company?: string;
    customer?: string;
    tags?: string[];
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
  const [listTab, setListTab] = React.useState<"all" | "companies" | "groups">("all");
  const [companiesExpanded, setCompaniesExpanded] = React.useState(false);

  const sortedVehicles = React.useMemo(() => {
    return [...vehicles].sort((a, b) => {
      const aLabel = (a.nickname || a.name || a.imei || "").toString();
      const bLabel = (b.nickname || b.name || b.imei || "").toString();
      return aLabel.localeCompare(bLabel, "it-IT", { sensitivity: "base" });
    });
  }, [vehicles]);

  const groupedByCompany = React.useMemo(() => {
    const buckets = new Map<string, QuickSidebarProps["vehicles"]>();
    sortedVehicles.forEach((vehicle) => {
      const raw = (vehicle.company || vehicle.customer || "").toString().trim();
      const key = raw || "Senza azienda";
      const list = buckets.get(key) || [];
      list.push(vehicle);
      buckets.set(key, list);
    });

    return [...buckets.entries()]
      .map(([label, list]) => ({ label, list }))
      .sort((a, b) => a.label.localeCompare(b.label, "it-IT", { sensitivity: "base" }));
  }, [sortedVehicles]);

  const groupedByTag = React.useMemo(() => {
    const buckets = new Map<string, QuickSidebarProps["vehicles"]>();
    sortedVehicles.forEach((vehicle) => {
      const tags = Array.isArray(vehicle.tags) ? vehicle.tags : [];
      if (!tags.length) {
        const list = buckets.get("Senza tag") || [];
        list.push(vehicle);
        buckets.set("Senza tag", list);
        return;
      }
      tags.forEach((tag) => {
        const label = tag?.toString().trim();
        if (!label) return;
        const list = buckets.get(label) || [];
        list.push(vehicle);
        buckets.set(label, list);
      });
    });

    return [...buckets.entries()]
      .map(([label, list]) => ({ label, list }))
      .sort((a, b) => a.label.localeCompare(b.label, "it-IT", { sensitivity: "base" }));
  }, [sortedVehicles]);

  const renderVehicleCard = (vehicle: QuickSidebarProps["vehicles"][number]) => {
    const plate = normalizePlate(vehicle.plate);
    const label = vehicle.nickname || vehicle.name || plate || vehicle.imei;
    const subtitle = `${plate} | ${vehicle.imei || "--"}`;
    const status = getStatusMeta(vehicle.status);

    return (
      <div
        key={`${vehicle.imei}-${label}`}
        className="rounded-xl border border-white/10 bg-[#121212] shadow-[0_10px_20px_rgba(0,0,0,0.35)] cursor-pointer"
        onClick={() => (window as any).trucklyFlyToVehicle?.(vehicle)}
      >
        <div className="flex items-start justify-between gap-2 px-3 py-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-white">{label}</div>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] ${status.className}`}
              >
                {status.label}
              </span>
            </div>
            <div className="text-[10px] text-white/55 mt-1">{subtitle}</div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 transition inline-flex items-center justify-center"
                aria-label="Apri menu veicolo"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
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
              <DropdownMenuItem onSelect={() => (window as any).trucklyFlyToVehicle?.(vehicle)}>
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
  };

  return (
    <aside
      className={`fixed top-0 bottom-0 left-0 z-40 w-[92vw] max-w-[440px] border-r border-white/10 bg-[#0c0c0d] text-[#f8fafc] flex flex-col pt-16 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
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
            className="text-xs h-8 w-8 rounded-full border border-white/20 text-white/75 hover:text-white hover:border-white/50 transition inline-flex items-center justify-center"
            aria-label="Chiudi"
          >
            <i className="fa fa-close" aria-hidden="true" />
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
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-white/50">
                <button
                  type="button"
                  onClick={() => setListTab("all")}
                  className={`rounded-full px-3 py-1 transition ${
                    listTab === "all" ? "bg-white/10 text-white" : "hover:text-white"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setListTab("companies")}
                  className={`rounded-full px-3 py-1 transition ${
                    listTab === "companies" ? "bg-white/10 text-white" : "hover:text-white"
                  }`}
                >
                  Companies
                </button>
                <button
                  type="button"
                  onClick={() => setListTab("groups")}
                  className={`rounded-full px-3 py-1 transition ${
                    listTab === "groups" ? "bg-white/10 text-white" : "hover:text-white"
                  }`}
                >
                  Groups
                </button>
              </div>

              {listTab === "all" && (
                <div className="rounded-2xl border border-white/10 bg-[#0d0d0f] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                        All
                      </p>
                      <p className="text-[11px] text-white/60">
                        {sortedVehicles.length} veicoli
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">{sortedVehicles.map(renderVehicleCard)}</div>
                </div>
              )}

              {listTab === "companies" && (
                <div className="rounded-2xl border border-white/10 bg-[#0d0d0f] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                        Companies
                      </p>
                      <p className="text-[11px] text-white/60">
                        {groupedByCompany.length} aziende
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCompaniesExpanded((prev) => !prev)}
                      className="text-[10px] uppercase tracking-[0.18em] text-white/60 hover:text-white transition"
                    >
                      {companiesExpanded ? "Riduci" : "Espandi"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {groupedByCompany.map((company) => (
                      <details
                        key={company.label}
                        open={companiesExpanded}
                        className="rounded-xl border border-white/10 bg-[#121212] px-3 py-2"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-white">
                          <span className="truncate">{company.label}</span>
                          <span className="text-[10px] text-white/55">{company.list.length}</span>
                        </summary>
                        <div className="mt-2 space-y-2">
                          {company.list.map(renderVehicleCard)}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {listTab === "groups" && (
                <div className="rounded-2xl border border-white/10 bg-[#0d0d0f] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                        Groups
                      </p>
                      <p className="text-[11px] text-white/60">
                        {groupedByTag.length} tag
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {groupedByTag.map((tag) => (
                      <details
                        key={tag.label}
                        className="rounded-xl border border-white/10 bg-[#121212] px-3 py-2"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-white">
                          <span className="truncate">{tag.label}</span>
                          <span className="text-[10px] text-white/55">{tag.list.length}</span>
                        </summary>
                        <div className="mt-2 space-y-2">{tag.list.map(renderVehicleCard)}</div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#0d0d0f] px-4 py-4 text-sm text-white/60">
              Nessun veicolo disponibile.
            </div>
          )
        ) : (
          <div className="rounded-xl border border-white/10 bg-[#0d0d0f] px-4 py-4 text-sm text-white/60">
            Elenco autisti disponibile a breve.
          </div>
        )}
      </div>
    </aside>
  );
}

