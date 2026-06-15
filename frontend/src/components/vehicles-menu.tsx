import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  X,
  Truck,
  IdCard,
  GripVertical,
} from "lucide-react";
import { VehicleTypeIcon } from "./ui/vehicle-type-icon";
import { TabSwitch } from "./ui/tab-switch";
import { API_BASE_URL, VEHICLES_PATH } from "../config";
import { useClusters, type Cluster } from "../lib/use-clusters";

type GroupTab = "tutti" | "cluster" | "tipologie" | "tag";

const dispatch = (name: string, detail?: unknown) =>
  window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));

function statusColor(status?: string | null): string {
  const raw = String(status || "").toLowerCase();
  if (raw === "driving" || raw === "moving") return "text-emerald-400";
  if (raw === "working") return "text-amber-400";
  if (raw === "resting" || raw === "stopped" || raw === "fermo") return "text-rose-400";
  return "text-muted-foreground";
}

function vLabel(v: any): { label: string; plate: string } {
  const plate =
    typeof v?.plate === "string" ? v.plate : v?.plate?.v || v?.plate?.value || "";
  const label = v?.nickname || v?.name || plate || v?.imei || "--";
  return { label: String(label), plate: String(plate) };
}

const vImei = (v: any) => String(v?.imei || "");

function vTags(v: any): string[] {
  const raw = Array.isArray(v?.tags)
    ? v.tags
    : Array.isArray(v?.details?.tags)
      ? v.details.tags
      : [];
  return raw.map((t: any) => String(t).trim()).filter(Boolean);
}

// Raggruppamento per tipologia veicolo (vehicleType).
const TYPE_GROUPS: { key: string; label: string; match: string[] }[] = [
  { key: "camion", label: "Camion", match: ["camion", "truck"] },
  { key: "trattore", label: "Trattori", match: ["trattore", "tractor"] },
  { key: "furgone", label: "Furgoni", match: ["furgone", "van"] },
  { key: "auto", label: "Auto", match: ["auto", "car"] },
];

type Group = { id: string; label: string; vehicles: any[]; cluster?: Cluster };

export function VehiclesMenu({
  onMap,
  canManageVehicles,
}: {
  onMap: boolean;
  canManageVehicles: boolean;
}) {
  const navigate = useNavigate();
  const { clusters, create, remove, addToCluster, removeFromCluster, removeFromAll } =
    useClusters();
  const [vehicles, setVehicles] = React.useState<any[]>([]);
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<GroupTab>("tutti");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [newCluster, setNewCluster] = React.useState("");
  // id del gruppo cluster attualmente sotto il cursore durante un drag.
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const dragImei = React.useRef<string | null>(null);
  const dragFrom = React.useRef<string | null>(null); // cluster id di provenienza (o null)

  // Lista veicoli live (cache mappa) con fallback API se la mappa non c'è.
  React.useEffect(() => {
    let cancelled = false;
    const read = () => {
      const v = (window as any).trucklyVehicles;
      if (Array.isArray(v) && v.length) {
        setVehicles([...v]);
        return true;
      }
      return false;
    };
    if (!read()) {
      fetch(`${API_BASE_URL}${VEHICLES_PATH}`, {
        cache: "no-store" as RequestCache,
        credentials: "include",
      })
        .then((r) =>
          r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : null,
        )
        .then((d) => {
          if (!cancelled && d) setVehicles(Array.isArray(d.vehicles) ? d.vehicles : []);
        })
        .catch(() => {});
    }
    const id = window.setInterval(read, 2500);
    window.addEventListener("truckly:vehicles-refresh", read);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("truckly:vehicles-refresh", read);
    };
  }, []);

  // Sulla mappa: fly-to diretto. Fuori dalla mappa: si RIAPRE la mappa mettendo
  // a fuoco il veicolo (handoff via sessionStorage, letto da main.tsx al mount).
  const flyTo = (v: any) => {
    const fly = (window as any).trucklyFlyToVehicle;
    if (onMap && typeof fly === "function") {
      fly(v);
      return;
    }
    try {
      sessionStorage.setItem("truckly:focus-imei", vImei(v));
    } catch {}
    navigate("/dashboard");
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const { label, plate } = vLabel(v);
      return (
        label.toLowerCase().includes(q) ||
        plate.toLowerCase().includes(q) ||
        vImei(v).toLowerCase().includes(q)
      );
    });
  }, [vehicles, query]);

  const groups = React.useMemo<Group[]>(() => {
    if (tab === "tutti") {
      return [{ id: "all", label: "Tutti i veicoli", vehicles: filtered }];
    }
    if (tab === "tipologie") {
      const out: Group[] = [];
      const used = new Set<any>();
      for (const g of TYPE_GROUPS) {
        const list = filtered.filter((v) =>
          g.match.includes(String(v?.vehicleType || "").toLowerCase()),
        );
        list.forEach((v) => used.add(v));
        if (list.length) out.push({ id: g.key, label: g.label, vehicles: list });
      }
      const other = filtered.filter((v) => !used.has(v));
      if (other.length) out.push({ id: "altro", label: "Altro", vehicles: other });
      return out;
    }
    if (tab === "tag") {
      const byTag = new Map<string, any[]>();
      const untagged: any[] = [];
      for (const v of filtered) {
        const tags = vTags(v);
        if (tags.length === 0) {
          untagged.push(v);
          continue;
        }
        for (const t of tags) {
          if (!byTag.has(t)) byTag.set(t, []);
          byTag.get(t)!.push(v);
        }
      }
      const out: Group[] = Array.from(byTag.keys())
        .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }))
        .map((t) => ({ id: `tag:${t}`, label: t, vehicles: byTag.get(t)! }));
      if (untagged.length) out.push({ id: "tag:__none", label: "Senza tag", vehicles: untagged });
      return out;
    }
    // cluster
    const out: Group[] = clusters.map((c) => ({
      id: `cl:${c.id}`,
      label: c.name,
      cluster: c,
      vehicles: filtered.filter((v) => c.imeis.includes(vImei(v))),
    }));
    const assigned = new Set(clusters.flatMap((c) => c.imeis));
    const unassigned = filtered.filter((v) => !assigned.has(vImei(v)));
    out.push({ id: "cl:__none", label: "Senza cluster", vehicles: unassigned });
    return out;
  }, [tab, filtered, clusters]);

  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreateCluster = async () => {
    const c = await create(newCluster);
    if (c) setNewCluster("");
  };

  // Drag&drop. group.cluster?.id = cluster reale; null = gruppo "Senza cluster".
  const onDropToGroup = (targetClusterId: string | null, copy: boolean) => {
    const imei = dragImei.current;
    const from = dragFrom.current;
    dragImei.current = null;
    dragFrom.current = null;
    setDropTarget(null);
    if (!imei) return;
    if (!targetClusterId) {
      // Drop su "Senza cluster" = rimuovi da tutti i cluster.
      removeFromAll(imei);
      return;
    }
    if (from === targetClusterId) return; // già qui
    addToCluster(targetClusterId, imei);
    // Drag normale = sposta (rimuove dalla provenienza). Ctrl/Cmd = copia (multi-cluster).
    if (!copy && from) removeFromCluster(from, imei);
  };

  return (
    <div className="flex flex-col gap-2">
      {!onMap && (
        <p className="rounded-md bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Clicca un veicolo per aprirlo sulla mappa.
        </p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca veicolo..."
          aria-label="Cerca veicolo"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <TabSwitch
        ariaLabel="Raggruppamento veicoli"
        value={tab}
        onChange={(id) => setTab(id as GroupTab)}
        tabs={[
          { id: "tutti", label: "Tutti" },
          { id: "cluster", label: "Cluster" },
          { id: "tipologie", label: "Tipologie" },
          { id: "tag", label: "Per Tag" },
        ]}
      />

      {tab === "cluster" && (
        <div className="flex items-center gap-1.5">
          <input
            value={newCluster}
            onChange={(e) => setNewCluster(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateCluster()}
            placeholder="Nuovo cluster..."
            aria-label="Nome nuovo cluster"
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <button
            type="button"
            onClick={handleCreateCluster}
            disabled={!newCluster.trim()}
            aria-label="Crea cluster"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}

      {tab === "cluster" && (
        <p className="px-0.5 text-[11px] text-muted-foreground/70">
          Trascina un veicolo in un cluster. Tieni <kbd className="rounded bg-muted px-1">Ctrl</kbd>{" "}
          per copiarlo in più cluster.
        </p>
      )}

      <div className="flex flex-col gap-1">
        {groups.length === 0 || groups.every((g) => g.vehicles.length === 0) ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {tab === "cluster"
              ? "Nessun cluster: creane uno e trascina i veicoli."
              : "Nessun veicolo."}
          </p>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsed.has(group.id);
            // In "Tutti" non serve l'intestazione di gruppo.
            const showHeader = tab !== "tutti";
            const isCluster = tab === "cluster";
            const targetClusterId = group.cluster?.id ?? null;
            const dropHandlers = isCluster
              ? {
                  onDragOver: (e: React.DragEvent) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? "copy" : "move";
                    if (dropTarget !== group.id) setDropTarget(group.id);
                  },
                  onDrop: (e: React.DragEvent) => {
                    e.preventDefault();
                    onDropToGroup(targetClusterId, e.ctrlKey || e.metaKey);
                  },
                }
              : {};
            return (
              <div
                key={group.id}
                {...dropHandlers}
                className={`flex flex-col rounded-md transition-colors ${
                  isCluster && dropTarget === group.id
                    ? "bg-brand/10 ring-1 ring-brand/40"
                    : ""
                }`}
              >
                {showHeader && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={!isCollapsed}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">{group.label}</span>
                      <span className="shrink-0 text-[10px] font-normal text-muted-foreground/70">
                        {group.vehicles.length}
                      </span>
                    </button>
                    {group.cluster && (
                      <button
                        type="button"
                        onClick={() => remove(group.cluster!.id)}
                        aria-label={`Elimina cluster ${group.cluster.name}`}
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-down/10 hover:text-down"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {!isCollapsed &&
                  (group.vehicles.length === 0 ? (
                    <p className="px-2 py-3 text-center text-[11px] text-muted-foreground/70">
                      {isCluster ? "Trascina qui i veicoli." : "Nessun veicolo."}
                    </p>
                  ) : (
                    group.vehicles.map((v) => {
                      const { label, plate } = vLabel(v);
                      const imei = vImei(v);
                      if (!isCluster) {
                        return (
                          <button
                            key={imei}
                            type="button"
                            onClick={() => flyTo(v)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <VehicleTypeIcon
                              type={v?.vehicleType}
                              className={`size-5 shrink-0 ${statusColor(v?.status)}`}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                            {plate && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {plate}
                              </span>
                            )}
                          </button>
                        );
                      }
                      const addable = clusters.filter((c) => !c.imeis.includes(imei));
                      return (
                        <div
                          key={imei}
                          draggable
                          onDragStart={(e) => {
                            dragImei.current = imei;
                            dragFrom.current = targetClusterId;
                            e.dataTransfer.effectAllowed = "copyMove";
                            try {
                              e.dataTransfer.setData("text/plain", imei);
                            } catch {}
                          }}
                          onDragEnd={() => {
                            dragImei.current = null;
                            dragFrom.current = null;
                            setDropTarget(null);
                          }}
                          className="flex cursor-grab items-center gap-1 rounded-md active:cursor-grabbing"
                        >
                          <GripVertical
                            className="size-3.5 shrink-0 text-muted-foreground/40"
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            onClick={() => flyTo(v)}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <VehicleTypeIcon
                              type={v?.vehicleType}
                              className={`size-5 shrink-0 ${statusColor(v?.status)}`}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                            {plate && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {plate}
                              </span>
                            )}
                          </button>
                          {addable.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) addToCluster(e.target.value, imei);
                              }}
                              aria-label={`Aggiungi ${label} a un cluster`}
                              title="Aggiungi a un cluster"
                              className="h-7 w-9 shrink-0 rounded-md border border-input bg-background text-center text-[11px] text-muted-foreground outline-none focus-visible:border-ring"
                            >
                              <option value="">＋</option>
                              {addable.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          )}
                          {targetClusterId && (
                            <button
                              type="button"
                              onClick={() => removeFromCluster(targetClusterId, imei)}
                              aria-label={`Rimuovi ${label} dal cluster`}
                              title="Rimuovi dal cluster"
                              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-down/10 hover:text-down"
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  ))}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-1 border-t border-border pt-2">
        <Management canManageVehicles={canManageVehicles} />
      </div>
    </div>
  );
}

/** Azioni di gestione (ex sezione "Flotta"): veicoli + autisti. */
function Management({ canManageVehicles }: { canManageVehicles: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Gestione
      </p>
      {canManageVehicles && (
        <Item icon={<Plus className="size-4" />} onClick={() => dispatch("truckly:vehicle-register-open")}>
          Registra veicolo
        </Item>
      )}
      <Item
        icon={<Truck className="size-4" />}
        onClick={() => dispatch("truckly:bottom-bar-toggle", { mode: "vehicles" })}
      >
        Tabella veicoli
      </Item>
      <Item icon={<Plus className="size-4" />} onClick={() => dispatch("truckly:driver-register-open")}>
        Registra autista
      </Item>
      <Item
        icon={<IdCard className="size-4" />}
        onClick={() => dispatch("truckly:bottom-bar-toggle", { mode: "drivers" })}
      >
        Tabella autisti
      </Item>
    </div>
  );
}

function Item({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}
