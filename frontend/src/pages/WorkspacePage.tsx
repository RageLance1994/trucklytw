import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Fuel, Activity, Truck, IdCard, Download, Users } from "lucide-react";
import { API_BASE_URL, VEHICLES_PATH } from "../config";
import { LeftToolbar } from "../components/left-toolbar";
import {
  FuelDashboard,
  DriverDashboard,
  VehicleTableDashboard,
  DriverTableDashboard,
  TachoFilesDashboard,
} from "../components/driver-bottom-bar";
import { UserManagementDashboard } from "../components/user-management-dashboard";
import { TabSwitch } from "../components/ui/tab-switch";
import { ComboBox } from "../components/ui/combo-box";

type Tab = "driver" | "fuel" | "vehicles" | "drivers" | "tacho" | "users";

const TABS: {
  key: Tab;
  label: string;
  icon: React.ReactNode;
  perVehicle?: boolean;
  adminOnly?: boolean;
}[] = [
  { key: "driver", label: "Attività autista", icon: <Activity className="size-4" /> },
  { key: "fuel", label: "Carburante", icon: <Fuel className="size-4" />, perVehicle: true },
  { key: "vehicles", label: "Veicoli", icon: <Truck className="size-4" /> },
  { key: "drivers", label: "Autisti", icon: <IdCard className="size-4" /> },
  { key: "tacho", label: "Scarico dati", icon: <Download className="size-4" /> },
  { key: "users", label: "Utenti", icon: <Users className="size-4" />, adminOnly: true },
];

const isTab = (v: unknown): v is Tab => TABS.some((t) => t.key === v);

function vehicleLabel(v: any): string {
  const plate = typeof v?.plate === "string" ? v.plate : v?.plate?.v || v?.plate?.value || "";
  const nickname = v?.nickname || v?.name || "";
  return [nickname, plate].filter(Boolean).join(" · ") || String(v?.imei || "");
}

/**
 * WorkspacePage — pagina dedicata per analisi/gestione (ex contenuto della bottom bar).
 * Riusa i dashboard esistenti; niente più overlay sovrapposto alla sidebar.
 */
export function WorkspacePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "driver";
  const imeiParam = params.get("imei") || "";
  const driverIdParam = params.get("driverId") || "";

  const [vehicles, setVehicles] = React.useState<any[]>([]);
  const [priv, setPriv] = React.useState<number | null>(null);
  const [selImei, setSelImei] = React.useState<string>(imeiParam);

  // Lista veicoli (stesso endpoint della dashboard mappa)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}${VEHICLES_PATH}`, {
          cache: "no-store" as RequestCache,
          credentials: "include",
        });
        if (res.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        const ct = res.headers.get("content-type") || "";
        if (!res.ok || !ct.includes("application/json")) {
          navigate("/login", { replace: true });
          return;
        }
        const data = await res.json();
        if (!cancelled) setVehicles(Array.isArray(data?.vehicles) ? data.vehicles : []);
      } catch (err) {
        console.error("[Workspace] vehicles load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Privilegio (per azioni tabella veicoli)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/session`, {
          cache: "no-store" as RequestCache,
          credentials: "include",
        });
        if (!res.ok) return;
        const d = await res.json().catch(() => null);
        const p = [d?.user?.effectivePrivilege, d?.user?.privilege, d?.user?.role].find((v) =>
          Number.isInteger(v),
        );
        if (!cancelled) setPriv(Number.isInteger(p) ? (p as number) : null);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync con cambi di query (?imei=)
  React.useEffect(() => {
    if (imeiParam) setSelImei(imeiParam);
  }, [imeiParam]);

  // Le azioni interne delle tabelle (riga → fuel/driver) usano l'event bus: restano nella pagina.
  React.useEffect(() => {
    const onToggle = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const mode = detail?.mode;
      if (!isTab(mode)) return;
      const next = new URLSearchParams(params);
      next.set("tab", mode);
      if (detail?.imei) next.set("imei", String(detail.imei));
      if (detail?.driverId) next.set("driverId", String(detail.driverId));
      setParams(next);
    };
    window.addEventListener("truckly:bottom-bar-toggle", onToggle);
    return () => window.removeEventListener("truckly:bottom-bar-toggle", onToggle);
  }, [params, setParams]);

  // Azioni "da mappa" (apri driver/rotte/edit/registra) innescate da tabelle o toolbar:
  // si fa handoff alla pagina mappa, che le riesegue al mount.
  React.useEffect(() => {
    const MAP_EVENTS = [
      "truckly:driver-open",
      "truckly:routes-open",
      "truckly:vehicle-edit-open",
      "truckly:driver-edit-open",
      "truckly:vehicle-register-open",
      "truckly:driver-register-open",
    ];
    const handlers: Array<[string, EventListener]> = MAP_EVENTS.map((name) => {
      const fn: EventListener = (e) => {
        const detail = (e as CustomEvent)?.detail ?? null;
        try {
          sessionStorage.setItem("truckly:pending-intent", JSON.stringify({ name, detail }));
        } catch {}
        navigate("/dashboard");
      };
      window.addEventListener(name, fn);
      return [name, fn];
    });
    return () => handlers.forEach(([name, fn]) => window.removeEventListener(name, fn));
  }, [navigate]);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next);
  };

  const onSelectVehicle = (imei: string) => {
    setSelImei(imei);
    const next = new URLSearchParams(params);
    if (imei) next.set("imei", imei);
    else next.delete("imei");
    setParams(next);
  };

  const tabMeta = TABS.find((t) => t.key === tab)!;
  const selectedVehicle = vehicles.find((v) => String(v?.imei || "") === String(selImei)) || null;
  const canEdit = Number.isInteger(priv) && (priv as number) <= 1;
  const canDelete = Number.isInteger(priv) && priv === 0;
  const canManageUsers = Number.isInteger(priv) && (priv as number) <= 2;
  // Tab a tabella: gestiscono lo scroll internamente (header fisso) → niente scroll pagina.
  const isTableTab = tab === "users" || tab === "vehicles" || tab === "drivers" || tab === "tacho";
  // Il tab "Utenti" compare solo a chi può gestirli; il componente comunque
  // ri-verifica i permessi al suo interno.
  const visibleTabs = TABS.filter((t) => !t.adminOnly || canManageUsers);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <LeftToolbar />
      <main className="flex h-full flex-col md:pl-[var(--tk-toolbar-left,0px)] md:pr-[var(--tk-toolbar-right,0px)] md:pt-[var(--tk-toolbar-top,0px)] md:pb-[var(--tk-toolbar-bottom,0px)]">
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 md:px-8">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Analisi &amp; Gestione</h1>
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <ArrowLeft className="size-4" />
              Mappa
            </button>
          </div>

          {/* Tabs (stile underline omologato a htsmedcms / calcolo IVA) */}
          <TabSwitch
            className="mb-4"
            ariaLabel="Sezioni"
            value={tab}
            onChange={(id) => setTab(id as Tab)}
            tabs={visibleTabs.map((t) => ({ id: t.key, label: t.label, icon: t.icon }))}
          />

          {/* Selettore veicolo per i tab per-veicolo */}
          {tabMeta.perVehicle && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted-foreground">Veicolo</label>
              <ComboBox
                className="w-full min-w-0 sm:w-[260px] sm:min-w-[260px]"
                ariaLabel="Seleziona veicolo"
                placeholder="Cerca veicolo..."
                value={selImei}
                onChange={onSelectVehicle}
                options={vehicles.map((v) => ({
                  value: String(v?.imei || ""),
                  label: vehicleLabel(v),
                }))}
              />
            </div>
          )}
        </div>

        {/* Contenuto: scroll full-width così la scrollbar sta al bordo destro.
            Il tab "Utenti" gestisce lo scroll internamente (tabella indipendente):
            qui blocchiamo lo scroll di pagina e diamo altezza piena. */}
        <div className={`min-h-0 flex-1 ${isTableTab ? "overflow-hidden" : "overflow-y-auto"}`}>
          <div
            className={`mx-auto w-full max-w-6xl px-4 pb-6 md:px-8 ${
              isTableTab ? "flex h-full flex-col" : ""
            }`}
          >
          <div className={`min-w-0 ${isTableTab ? "flex min-h-0 flex-1 flex-col" : ""}`}>
            {tabMeta.perVehicle && !selImei ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Seleziona un veicolo per vedere i dati.
              </p>
            ) : tab === "fuel" ? (
              <FuelDashboard isOpen selectedVehicleImei={selImei} selectedVehicle={selectedVehicle} />
            ) : tab === "driver" ? (
              <DriverDashboard selectedDriverImei={selImei} initialDriverId={driverIdParam} />
            ) : tab === "vehicles" ? (
              <VehicleTableDashboard
                vehicles={vehicles}
                canEdit={canEdit}
                canDelete={canDelete}
                canManageOwners={priv === 0}
              />
            ) : tab === "drivers" ? (
              <DriverTableDashboard isOpen />
            ) : tab === "users" ? (
              <UserManagementDashboard />
            ) : (
              <TachoFilesDashboard isOpen />
            )}
          </div>
          </div>
        </div>
      </main>
    </div>
  );
}
