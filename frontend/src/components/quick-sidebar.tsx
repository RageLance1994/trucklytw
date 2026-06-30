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
    return { label: "In marcia", className: "bg-ok/15 text-ok" };
  }
  if (raw === "working") {
    return { label: "Lavoro", className: "bg-warn/15 text-warn" };
  }
  if (raw === "resting" || raw === "stopped" || raw === "fermo") {
    return { label: "Fermo", className: "bg-down/15 text-down" };
  }
  return { label: status || "Online", className: "bg-accent text-muted-foreground" };
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
        className="rounded-xl border border-border bg-card shadow-sm cursor-pointer"
        onClick={() => (window as any).trucklyFlyToVehicle?.(vehicle)}
      >
        <div className="flex items-start justify-between gap-2 px-3 py-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-foreground">{label}</div>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] ${status.className}`}
              >
                {status.label}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{subtitle}</div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                className="h-8 w-8 rounded-lg border border-border bg-accent/40 text-muted-foreground hover:text-foreground hover:bg-accent transition inline-flex items-center justify-center"
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
      className={`fixed top-0 bottom-0 left-0 md:left-[var(--tk-toolbar-left,0px)] md:top-[var(--tk-toolbar-top,0px)] md:bottom-[var(--tk-toolbar-bottom,0px)] z-40 w-full max-w-none sm:w-[92vw] sm:max-w-[440px] border-r border-border bg-background text-foreground flex flex-col pt-16 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isOpen ? "translate-x-0" : "-translate-x-full pointer-events-none opacity-0"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-start justify-between px-5 py-5 border-b border-border">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Vista rapida</p>
          <h2 className="text-xl font-semibold leading-tight text-foreground">Veicoli</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs h-8 w-8 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-ring/60 transition inline-flex items-center justify-center"
            aria-label="Chiudi"
          >
            <i className="fa fa-close" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="px-5 pt-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setActiveTab("vehicles")}
            className={`pb-2 uppercase tracking-[0.12em] text-xs transition-colors ${
              activeTab === "vehicles" ? "text-brand" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Veicoli
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("drivers")}
            className={`pb-2 uppercase tracking-[0.12em] text-xs transition-colors ${
              activeTab === "drivers" ? "text-brand" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Autisti
          </button>
        </div>
        <div className="h-0.5 w-28 rounded-full bg-border">
          <div
            className={`h-full rounded-full bg-brand transition-transform duration-200 ${
              activeTab === "vehicles" ? "translate-x-0 w-14" : "translate-x-14 w-14"
            }`}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {activeTab === "vehicles" ? (
          sortedVehicles.length ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setListTab("all")}
                  className={`rounded-full px-3 py-1 transition ${
                    listTab === "all" ? "bg-accent text-foreground" : "hover:text-foreground"
                  }`}
                >
                  Tutti
                </button>
                <button
                  type="button"
                  onClick={() => setListTab("companies")}
                  className={`rounded-full px-3 py-1 transition ${
                    listTab === "companies" ? "bg-accent text-foreground" : "hover:text-foreground"
                  }`}
                >
                  Aziende
                </button>
                <button
                  type="button"
                  onClick={() => setListTab("groups")}
                  className={`rounded-full px-3 py-1 transition ${
                    listTab === "groups" ? "bg-accent text-foreground" : "hover:text-foreground"
                  }`}
                >
                  Gruppi
                </button>
              </div>

              {listTab === "all" && (
                <div className="rounded-2xl border border-border bg-background p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Tutti
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {sortedVehicles.length} veicoli
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">{sortedVehicles.map(renderVehicleCard)}</div>
                </div>
              )}

              {listTab === "companies" && (
                <div className="rounded-2xl border border-border bg-background p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Aziende
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {groupedByCompany.length} aziende
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCompaniesExpanded((prev) => !prev)}
                      className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition"
                    >
                      {companiesExpanded ? "Riduci" : "Espandi"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {groupedByCompany.map((company) => (
                      <details
                        key={company.label}
                        open={companiesExpanded}
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-foreground">
                          <span className="truncate">{company.label}</span>
                          <span className="text-[10px] text-muted-foreground">{company.list.length}</span>
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
                <div className="rounded-2xl border border-border bg-background p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Gruppi
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {groupedByTag.length} tag
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {groupedByTag.map((tag) => (
                      <details
                        key={tag.label}
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-foreground">
                          <span className="truncate">{tag.label}</span>
                          <span className="text-[10px] text-muted-foreground">{tag.list.length}</span>
                        </summary>
                        <div className="mt-2 space-y-2">{tag.list.map(renderVehicleCard)}</div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background px-4 py-4 text-sm text-muted-foreground">
              Nessun veicolo disponibile.
            </div>
          )
        ) : (
          <div className="rounded-xl border border-border bg-background px-4 py-4 text-sm text-muted-foreground">
            Elenco autisti disponibile a breve.
          </div>
        )}
      </div>
    </aside>
  );
}

