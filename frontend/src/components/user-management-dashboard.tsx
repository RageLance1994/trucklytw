import React from "react";
import { createPortal } from "react-dom";
import { API_BASE_URL, VEHICLES_PATH } from "../config";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { TabSwitch } from "./ui/tab-switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/* ------------------------------- tipi ------------------------------- */

type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: number | null;
  privilege: number | null;
  createdAt: string | number | null;
};

type AdminCompany = {
  id: string;
  name: string;
  createdAt: string | number | null;
  updatedAt?: string | number | null;
  userCount: number;
  users: AdminUser[];
};

type AdminVehicleSummary = {
  id?: string | null;
  imei?: string | null;
  nickname?: string | null;
  plate?: string | null;
  tags?: string[];
};

type TachoCompany = {
  id: string;
  name: string;
  parentId?: string | null;
  depth?: number;
};

type SortDir = "asc" | "desc";
type CompanySortField = "name" | "userCount" | "createdAt";
type UserSortField = "name" | "email" | "role" | "createdAt";

/* ------------------------------ helper ------------------------------ */

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const labelClass = "text-xs font-medium text-muted-foreground";

const formatShortDate = (value: string | number | null | undefined) => {
  if (!value) return "N/D";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/D";
  return date.toLocaleDateString("it-IT");
};

const formatRoleLabel = (value: number | null | undefined) => {
  if (value == null) return "N/D";
  return value <= 1 ? "Admin" : "Operatore";
};

const sortWithDir = <T,>(
  list: T[],
  dir: SortDir,
  selector: (item: T) => string | number | null | undefined,
) => {
  const multiplier = dir === "desc" ? -1 : 1;
  return [...list].sort((a, b) => {
    const av = selector(a);
    const bv = selector(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * multiplier;
    return String(av).localeCompare(String(bv), "it", { sensitivity: "base" }) * multiplier;
  });
};

function SortButton({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground sm:text-xs",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      <span>{label}</span>
      {active && (
        <i
          className={`fa ${dir === "asc" ? "fa-sort-up" : "fa-sort-down"}`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/** Modal accessibile (dialog + Escape + click backdrop), reso in portal su body. */
function Modal({
  open,
  onClose,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = (typeof document !== "undefined"
      ? document.activeElement
      : null) as HTMLElement | null;

    const focusableSelector =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap: il Tab non deve uscire dal dialog.
      if (e.key === "Tab" && dialogRef.current) {
        const items = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
        ).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    // Autofocus sul primo campo (o sul dialog) all'apertura.
    const root = dialogRef.current;
    const firstField = root?.querySelector<HTMLElement>(
      'input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])',
    );
    (firstField || root)?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            {eyebrow && (
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <i className="fa fa-close" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
        {footer && <div className="mt-6 flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* Riquadro restrizioni veicoli (riusato da Nuovo utente + Modifica). */
function RestrictionPicker({
  mode,
  onModeChange,
  search,
  onSearchChange,
  filterOpen,
  onFilterToggle,
  tags,
  activeTags,
  onToggleTag,
  vehicles,
  loading,
  selectedIds,
  onToggleVehicle,
}: {
  mode: "include" | "exclude";
  onModeChange: (m: "include" | "exclude") => void;
  search: string;
  onSearchChange: (v: string) => void;
  filterOpen: boolean;
  onFilterToggle: () => void;
  tags: string[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  vehicles: AdminVehicleSummary[];
  loading: boolean;
  selectedIds: string[];
  onToggleVehicle: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border border-border bg-background p-0.5">
        {(["include", "exclude"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={cn(
              "rounded-[5px] px-3 py-1 text-xs font-medium transition-colors",
              mode === m
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "include" ? "Mostra solo" : "Tutti tranne"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cerca veicolo..."
          className={cn(inputClass, "flex-1")}
        />
        <div className="relative">
          <button
            type="button"
            onClick={onFilterToggle}
            className="inline-flex size-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Filtra per tag"
            aria-expanded={filterOpen}
          >
            <i className="fa fa-filter" aria-hidden="true" />
          </button>
          {filterOpen && (
            <div className="absolute right-0 z-10 mt-2 w-48 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg">
              {tags.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Nessun tag disponibile.
                </div>
              ) : (
                tags.map((tag) => {
                  const isActive = activeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onToggleTag(tag)}
                      className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="truncate">{tag}</span>
                      {isActive && (
                        <i className="fa fa-check text-brand" aria-hidden="true" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Veicolo</span>
          <span>Tag</span>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Caricamento veicoli...</div>
          ) : vehicles.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              Nessun veicolo corrispondente ai filtri.
            </div>
          ) : (
            vehicles.map((vehicle) => {
              const vehicleKey =
                vehicle.id || vehicle.imei || `${vehicle.nickname}-${vehicle.plate}`;
              const selectionId = vehicle.id || null;
              const isSelected = selectionId ? selectedIds.includes(selectionId) : false;
              return (
                <button
                  key={vehicleKey}
                  type="button"
                  onClick={() => selectionId && onToggleVehicle(selectionId)}
                  disabled={!selectionId}
                  aria-pressed={isSelected}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 border-t border-border px-3 py-2 text-left text-xs transition-colors first:border-t-0 disabled:opacity-50",
                    isSelected
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-accent/50",
                  )}
                >
                  <span className="truncate">
                    {vehicle.nickname || vehicle.plate || vehicle.imei || "Veicolo"}
                  </span>
                  <span className="flex items-center justify-between gap-2 truncate text-muted-foreground">
                    <span className="truncate">{(vehicle.tags || []).join(", ") || "--"}</span>
                    {isSelected && (
                      <i className="fa fa-check shrink-0 text-brand" aria-hidden="true" />
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------- componente principale ------------------------- */

/**
 * UserManagementDashboard — gestione aziende/utenti, dislocata dall'ex `AdminSidebar`
 * (drawer) a un tab dedicato della WorkspacePage. Token-izzata + tabelle responsive
 * secondo AGENTS.md. Fetcha la propria sessione (permessi/azienda).
 */
export function UserManagementDashboard() {
  // sessione / permessi
  const [sessionLoaded, setSessionLoaded] = React.useState(false);
  const [privilege, setPrivilege] = React.useState<number | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [sessionCompanyId, setSessionCompanyId] = React.useState<string | null>(null);
  const [sessionCompanyName, setSessionCompanyName] = React.useState<string | null>(null);
  const canManageUsers = Number.isInteger(privilege) && (privilege as number) <= 2;

  const [companies, setCompanies] = React.useState<AdminCompany[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [companySort, setCompanySort] = React.useState<{ field: CompanySortField; dir: SortDir }>({
    field: "name",
    dir: "asc",
  });
  const [userSort, setUserSort] = React.useState<{ field: UserSortField; dir: SortDir }>({
    field: "name",
    dir: "asc",
  });
  const [userSearch, setUserSearch] = React.useState<Record<string, string>>({});
  const [tachoCompanies, setTachoCompanies] = React.useState<TachoCompany[]>([]);
  const [tachoQuery, setTachoQuery] = React.useState("");
  const [tachoDropdownOpen, setTachoDropdownOpen] = React.useState(false);
  const [selectedTachoCompany, setSelectedTachoCompany] = React.useState<TachoCompany | null>(null);
  const [importName, setImportName] = React.useState("");
  const [tachoLoading, setTachoLoading] = React.useState(false);
  const [tachoError, setTachoError] = React.useState<string | null>(null);
  const [registering, setRegistering] = React.useState(false);
  const [registerSuccess, setRegisterSuccess] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"new" | "import">("new");
  const [newName, setNewName] = React.useState("");
  const [legalAddress, setLegalAddress] = React.useState("");
  const [vatId, setVatId] = React.useState("");
  const [sdiCode, setSdiCode] = React.useState("");
  const [registerTeltonika, setRegisterTeltonika] = React.useState(false);
  const [userModalOpen, setUserModalOpen] = React.useState(false);
  const [userCompanyId, setUserCompanyId] = React.useState<string | null>(null);
  const [userCompanyName, setUserCompanyName] = React.useState<string | null>(null);
  const [userFirstName, setUserFirstName] = React.useState("");
  const [userLastName, setUserLastName] = React.useState("");
  const [userPhone, setUserPhone] = React.useState("");
  const [userEmail, setUserEmail] = React.useState("");
  const [userPassword, setUserPassword] = React.useState("");
  const [userPrivilege, setUserPrivilege] = React.useState(2);
  const [userStatus] = React.useState(0);
  const [userSubmitting, setUserSubmitting] = React.useState(false);
  const [userError, setUserError] = React.useState<string | null>(null);
  const [userSuccess, setUserSuccess] = React.useState<string | null>(null);
  const [vehicleInventory, setVehicleInventory] = React.useState<AdminVehicleSummary[]>([]);
  const [vehicleTags, setVehicleTags] = React.useState<string[]>([]);
  const [selectedVehicleIds, setSelectedVehicleIds] = React.useState<string[]>([]);
  const [allowedVehicleTags, setAllowedVehicleTags] = React.useState<string[]>([]);
  const [restrictionsEnabled, setRestrictionsEnabled] = React.useState(false);
  const [restrictionMode, setRestrictionMode] = React.useState<"include" | "exclude">("include");
  const [restrictionSearch, setRestrictionSearch] = React.useState("");
  const [restrictionFilterOpen, setRestrictionFilterOpen] = React.useState(false);
  const [vehicleLoading, setVehicleLoading] = React.useState(false);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [editUserId, setEditUserId] = React.useState<string | null>(null);
  const [editUserName, setEditUserName] = React.useState<string | null>(null);
  const [editUserRole, setEditUserRole] = React.useState<number | null>(null);
  const [editRestrictionMode, setEditRestrictionMode] = React.useState<"include" | "exclude">(
    "include",
  );
  const [editRestrictionSearch, setEditRestrictionSearch] = React.useState("");
  const [editRestrictionFilterOpen, setEditRestrictionFilterOpen] = React.useState(false);
  const [editAllowedVehicleTags, setEditAllowedVehicleTags] = React.useState<string[]>([]);
  const [editSelectedVehicleIds, setEditSelectedVehicleIds] = React.useState<string[]>([]);
  const [editLoading, setEditLoading] = React.useState(false);
  const [editSaving, setEditSaving] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editSuccess, setEditSuccess] = React.useState<string | null>(null);

  // Sessione: permessi + azienda corrente.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/session`, {
          cache: "no-store" as RequestCache,
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setSessionLoaded(true);
          return;
        }
        const data = await res.json().catch(() => null);
        const priv = [
          data?.user?.effectivePrivilege,
          data?.user?.privilege,
          data?.user?.role,
        ].find((v) => Number.isInteger(v));
        const role = Number.isInteger(data?.user?.role) ? data.user.role : null;
        if (!cancelled) {
          setPrivilege(Number.isInteger(priv) ? (priv as number) : null);
          setIsSuperAdmin(role != null ? role === 0 : priv === 0);
          setSessionCompanyId(data?.user?.companyId ?? null);
          setSessionCompanyName(data?.user?.companyName ?? null);
          setSessionLoaded(true);
        }
      } catch {
        if (!cancelled) setSessionLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchCompanies = React.useCallback(async () => {
    const query = new URLSearchParams();
    const trimmed = search.trim();
    if (trimmed) query.set("search", trimmed);
    const url = `${API_BASE_URL || ""}/api/admin/companies${query.toString() ? `?${query}` : ""}`;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCompanies(Array.isArray(data?.companies) ? data.companies : []);
    } catch (err: any) {
      setError(err?.message || "Errore durante il caricamento.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchTachoCompanies = React.useCallback(async () => {
    setTachoLoading(true);
    setTachoError(null);
    try {
      const res = await fetch(`${API_BASE_URL || ""}/api/tacho/companies`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTachoCompanies(Array.isArray(data?.companies) ? data.companies : []);
    } catch (err: any) {
      setTachoError(err?.message || "Errore durante il caricamento del servizio.");
    } finally {
      setTachoLoading(false);
    }
  }, []);

  const fetchVehicles = React.useCallback(async () => {
    setVehicleLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL || ""}${VEHICLES_PATH}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setVehicleInventory([]);
        setVehicleTags([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const vehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
      const normalized = vehicles.map((vehicle: any) => {
        const rawPlate = vehicle?.plate;
        const plate = typeof rawPlate === "string" ? rawPlate : rawPlate?.v || null;
        const rawTags = Array.isArray(vehicle?.tags)
          ? vehicle.tags
          : Array.isArray(vehicle?.details?.tags)
            ? vehicle.details.tags
            : [];
        const tags = rawTags.map((tag: any) => String(tag).trim()).filter(Boolean);
        return {
          id: vehicle?._id ? String(vehicle._id) : vehicle?.id ? String(vehicle.id) : null,
          imei: vehicle?.imei ?? null,
          nickname: vehicle?.nickname ?? null,
          plate,
          tags,
        } as AdminVehicleSummary;
      });
      const tagSet = new Set<string>();
      normalized.forEach((vehicle) => {
        vehicle.tags?.forEach((tag) => tagSet.add(tag));
      });
      setVehicleInventory(normalized);
      setVehicleTags(Array.from(tagSet).sort((a, b) => a.localeCompare(b, "it")));
    } catch {
      setVehicleInventory([]);
      setVehicleTags([]);
    } finally {
      setVehicleLoading(false);
    }
  }, []);

  const resetModal = () => {
    setActiveTab("new");
    setNewName("");
    setLegalAddress("");
    setVatId("");
    setSdiCode("");
    setRegisterTeltonika(false);
    setSelectedTachoCompany(null);
    setImportName("");
    setTachoQuery("");
    setTachoDropdownOpen(false);
    setTachoError(null);
    setRegisterSuccess(null);
  };

  const resetUserModal = () => {
    setUserFirstName("");
    setUserLastName("");
    setUserPhone("");
    setUserEmail("");
    setUserPassword("");
    setUserPrivilege(isSuperAdmin ? 1 : 3);
    setUserSubmitting(false);
    setUserError(null);
    setUserSuccess(null);
    setAllowedVehicleTags([]);
    setSelectedVehicleIds([]);
    setRestrictionsEnabled(false);
    setRestrictionMode("include");
    setRestrictionSearch("");
    setRestrictionFilterOpen(false);
  };

  React.useEffect(() => {
    if (!canManageUsers || isSuperAdmin) return;
    if (sessionCompanyId) {
      setUserCompanyId(sessionCompanyId);
      setUserCompanyName(sessionCompanyName);
    }
  }, [canManageUsers, isSuperAdmin, sessionCompanyId, sessionCompanyName]);

  React.useEffect(() => {
    if (userPrivilege !== 3) {
      setRestrictionsEnabled(false);
      setSelectedVehicleIds([]);
    }
  }, [userPrivilege]);

  const clearModalForm = () => {
    setNewName("");
    setLegalAddress("");
    setVatId("");
    setSdiCode("");
    setRegisterTeltonika(false);
    setSelectedTachoCompany(null);
    setImportName("");
    setTachoQuery("");
    setTachoDropdownOpen(false);
  };

  // Carica aziende quando ho i permessi (con debounce sulla ricerca).
  React.useEffect(() => {
    if (!sessionLoaded || !canManageUsers) return undefined;
    const handle = window.setTimeout(() => {
      fetchCompanies();
      if (isSuperAdmin) fetchTachoCompanies();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [sessionLoaded, canManageUsers, isSuperAdmin, fetchCompanies, fetchTachoCompanies, search]);

  React.useEffect(() => {
    if (!userModalOpen) return;
    fetchVehicles();
  }, [userModalOpen, fetchVehicles]);

  React.useEffect(() => {
    if (!editModalOpen || !editUserId) return;
    fetchVehicles();
    const loadUser = async () => {
      setEditLoading(true);
      setEditError(null);
      try {
        const res = await fetch(`${API_BASE_URL || ""}/api/admin/users/${editUserId}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = await res.json().catch(() => ({}));
        const user = data?.user || {};
        setEditUserRole(Number.isInteger(user.role) ? user.role : null);
        setEditRestrictionMode(user.allowedVehicleIdsMode === "exclude" ? "exclude" : "include");
        setEditAllowedVehicleTags(
          Array.isArray(user.allowedVehicleTags) ? user.allowedVehicleTags : [],
        );
        setEditSelectedVehicleIds(
          Array.isArray(user.allowedVehicleIds) ? user.allowedVehicleIds : [],
        );
      } catch (err: any) {
        setEditError(err?.message || "Errore durante il caricamento.");
      } finally {
        setEditLoading(false);
      }
    };
    void loadUser();
  }, [editModalOpen, editUserId, fetchVehicles]);

  React.useEffect(() => {
    if (!userModalOpen) return;
    setUserPrivilege(isSuperAdmin ? 1 : 3);
    setRestrictionsEnabled(false);
    setSelectedVehicleIds([]);
    setAllowedVehicleTags([]);
    setRestrictionMode("include");
    setRestrictionSearch("");
  }, [userModalOpen, isSuperAdmin]);

  const sortedCompanies = React.useMemo(() => {
    return sortWithDir(companies, companySort.dir, (company) => {
      if (companySort.field === "userCount") return company.userCount ?? 0;
      if (companySort.field === "createdAt") {
        return company.createdAt ? new Date(company.createdAt).getTime() : 0;
      }
      return company.name || "";
    });
  }, [companies, companySort]);

  const filteredTachoCompanies = React.useMemo(() => {
    const query = tachoQuery.trim().toLowerCase();
    if (!query) return tachoCompanies;
    return tachoCompanies.filter((company) => {
      const nameMatch = company.name?.toLowerCase().includes(query);
      const idMatch = company.id?.toLowerCase().includes(query);
      return nameMatch || idMatch;
    });
  }, [tachoCompanies, tachoQuery]);

  const handleRegisterCompany = async () => {
    if (activeTab === "new") {
      if (!newName.trim()) {
        setTachoError("Inserisci la ragione sociale.");
        return;
      }
    } else {
      if (!selectedTachoCompany) {
        setTachoError("Seleziona una azienda per l'import.");
        return;
      }
      if (!importName.trim()) {
        setTachoError("Inserisci il nome azienda.");
        return;
      }
    }

    setRegistering(true);
    setRegisterSuccess(null);
    setTachoError(null);
    try {
      const res = await fetch(`${API_BASE_URL || ""}/api/admin/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: activeTab === "new" ? newName.trim() : importName.trim(),
          legalAddress: activeTab === "new" ? legalAddress.trim() || null : null,
          taxId: activeTab === "new" ? vatId.trim() || null : null,
          sdiCode: activeTab === "new" ? sdiCode.trim() || null : null,
          registerTeltonika: activeTab === "new" ? registerTeltonika : false,
          tkCompanyId: activeTab === "import" ? selectedTachoCompany?.id : null,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      setRegisterSuccess("Azienda registrata.");
      fetchCompanies();
      clearModalForm();
      const createdCompanyId = data?.company?.id || null;
      const createdCompanyName = data?.company?.name || null;
      if (createdCompanyId) {
        setModalOpen(false);
        setUserCompanyId(createdCompanyId);
        setUserCompanyName(createdCompanyName);
        setUserModalOpen(true);
      }
    } catch (err: any) {
      setTachoError(err?.message || "Errore durante la registrazione.");
    } finally {
      setRegistering(false);
    }
  };

  const handleRegisterUser = async () => {
    if (!userCompanyId) {
      setUserError("Seleziona una azienda.");
      return;
    }
    if (
      !userFirstName.trim() ||
      !userLastName.trim() ||
      !userPhone.trim() ||
      !userEmail.trim() ||
      !userPassword
    ) {
      setUserError("Compila tutti i campi obbligatori.");
      return;
    }
    setUserSubmitting(true);
    setUserError(null);
    try {
      const res = await fetch(`${API_BASE_URL || ""}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: userFirstName.trim(),
          lastName: userLastName.trim(),
          phone: userPhone.trim(),
          email: userEmail.trim(),
          password: userPassword,
          companyId: userCompanyId,
          role: userPrivilege,
          privilege: userPrivilege,
          status: userStatus,
          allowedVehicleIds: userPrivilege === 3 && restrictionsEnabled ? selectedVehicleIds : [],
          allowedVehicleIdsMode:
            userPrivilege === 3 && restrictionsEnabled ? restrictionMode : "include",
          allowedVehicleTags: userPrivilege === 3 && restrictionsEnabled ? allowedVehicleTags : [],
          allowedVehicleTagsMode:
            userPrivilege === 3 && restrictionsEnabled ? restrictionMode : "include",
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      setUserSuccess("Utente registrato.");
      fetchCompanies();
    } catch (err: any) {
      setUserError(err?.message || "Errore durante la registrazione utente.");
    } finally {
      setUserSubmitting(false);
    }
  };

  const openEditRestrictions = (user: AdminUser) => {
    setEditUserId(user.id);
    setEditUserName(`${user.firstName} ${user.lastName}`.trim() || user.email);
    setEditModalOpen(true);
    setEditError(null);
    setEditSuccess(null);
  };

  const resetEditModal = () => {
    setEditUserId(null);
    setEditUserName(null);
    setEditUserRole(null);
    setEditRestrictionMode("include");
    setEditRestrictionSearch("");
    setEditRestrictionFilterOpen(false);
    setEditAllowedVehicleTags([]);
    setEditSelectedVehicleIds([]);
    setEditError(null);
    setEditSuccess(null);
  };

  const handleSaveRestrictions = async () => {
    if (!editUserId) return;
    setEditSaving(true);
    setEditError(null);
    setEditSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL || ""}/api/admin/users/${editUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          allowedVehicleIds: editSelectedVehicleIds,
          allowedVehicleIdsMode: editRestrictionMode,
          allowedVehicleTags: editAllowedVehicleTags,
          allowedVehicleTagsMode: editRestrictionMode,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      setEditSuccess("Restrizioni aggiornate.");
    } catch (err: any) {
      setEditError(err?.message || "Errore durante il salvataggio.");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleCompany = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateCompanySort = (field: CompanySortField) => {
    setCompanySort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === "asc" ? "desc" : "asc",
    }));
  };

  const updateUserSort = (field: UserSortField) => {
    setUserSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === "asc" ? "desc" : "asc",
    }));
  };

  const companyGrid =
    "grid min-w-0 grid-cols-[minmax(0,2.2fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto] items-center gap-2 sm:gap-3";
  const userGrid =
    "grid min-w-0 grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] items-center gap-2 sm:gap-3";

  const filteredVehicles = React.useMemo(() => {
    const query = restrictionSearch.trim().toLowerCase();
    const activeTags = new Set(allowedVehicleTags);
    return vehicleInventory.filter((vehicle) => {
      if (activeTags.size > 0) {
        const hasTag =
          Array.isArray(vehicle.tags) && vehicle.tags.some((tag) => activeTags.has(tag));
        if (!hasTag) return false;
      }
      if (!query) return true;
      const name =
        `${vehicle.nickname || ""} ${vehicle.plate || ""} ${vehicle.imei || ""}`.toLowerCase();
      return name.includes(query);
    });
  }, [allowedVehicleTags, restrictionSearch, vehicleInventory]);

  const editFilteredVehicles = React.useMemo(() => {
    const query = editRestrictionSearch.trim().toLowerCase();
    const activeTags = new Set(editAllowedVehicleTags);
    return vehicleInventory.filter((vehicle) => {
      if (activeTags.size > 0) {
        const hasTag =
          Array.isArray(vehicle.tags) && vehicle.tags.some((tag) => activeTags.has(tag));
        if (!hasTag) return false;
      }
      if (!query) return true;
      const name =
        `${vehicle.nickname || ""} ${vehicle.plate || ""} ${vehicle.imei || ""}`.toLowerCase();
      return name.includes(query);
    });
  }, [editAllowedVehicleTags, editRestrictionSearch, vehicleInventory]);

  if (!sessionLoaded) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Caricamento autorizzazioni...
      </div>
    );
  }

  if (!canManageUsers) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Non hai i permessi per gestire gli utenti.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {/* Header fisso: titolo + ricerca + azioni — NON scorre con la tabella. */}
        <div className="shrink-0 space-y-3 border-b border-border p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Aziende
            </p>
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca azienda..."
                aria-label="Cerca azienda"
                className={cn(inputClass, "w-40 sm:w-56")}
              />
              {isSuperAdmin && (
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  onClick={() => {
                    setModalOpen(true);
                    setRegisterSuccess(null);
                    setTachoError(null);
                  }}
                >
                  <i className="fa fa-plus" aria-hidden="true" />
                  <span className="hidden sm:inline">Registra azienda</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={fetchCompanies}
                aria-label="Aggiorna elenco aziende"
                disabled={loading}
              >
                <i
                  className={cn("fa fa-refresh", loading && "animate-spin")}
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
          {error && <p className="text-xs text-down">{error}</p>}
        </div>

        {/* Tabella aziende: scroll INDIPENDENTE — l'overflow resta qui dentro,
            non tocca la pagina né il tab switch. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="space-y-3">
            {/* Intestazioni ordinabili: sticky, restano visibili scrollando la lista. */}
            <div
              className={cn(
                companyGrid,
                "sticky top-0 z-10 bg-card px-3 pb-2 pt-1 text-[9px] sm:text-[10px]",
              )}
            >
              <SortButton
                label="Azienda"
                active={companySort.field === "name"}
                dir={companySort.dir}
                onClick={() => updateCompanySort("name")}
              />
              <SortButton
                label="Utenti"
                active={companySort.field === "userCount"}
                dir={companySort.dir}
                onClick={() => updateCompanySort("userCount")}
              />
              <SortButton
                label="Creato"
                active={companySort.field === "createdAt"}
                dir={companySort.dir}
                onClick={() => updateCompanySort("createdAt")}
              />
              <div className="text-right text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[10px]">
                Azioni
              </div>
            </div>

          {sortedCompanies.length === 0 && !loading ? (
            <div className="rounded-md border border-border bg-background px-3 py-3 text-xs text-muted-foreground">
              Nessuna azienda trovata.
            </div>
          ) : (
            sortedCompanies.map((company) => {
              const isExpanded = expanded.has(company.id);
              const searchValue = (userSearch[company.id] || "").trim().toLowerCase();
              const filteredUsers = searchValue
                ? company.users.filter((user) => {
                    const name = `${user.firstName} ${user.lastName}`.toLowerCase();
                    return (
                      name.includes(searchValue) || user.email.toLowerCase().includes(searchValue)
                    );
                  })
                : company.users;
              const sortedUsers = sortWithDir(filteredUsers, userSort.dir, (user) => {
                if (userSort.field === "email") return user.email;
                if (userSort.field === "role") return user.role ?? 99;
                if (userSort.field === "createdAt") {
                  return user.createdAt ? new Date(user.createdAt).getTime() : 0;
                }
                return `${user.firstName} ${user.lastName}`.trim();
              });

              return (
                <div
                  key={company.id}
                  className="rounded-md border border-border bg-background px-3 py-3 text-xs text-foreground"
                >
                  <div className={companyGrid}>
                    <button
                      type="button"
                      onClick={() => toggleCompany(company.id)}
                      className="flex min-w-0 items-center gap-2 text-left"
                      aria-expanded={isExpanded}
                    >
                      <i
                        className={`fa ${isExpanded ? "fa-caret-down" : "fa-caret-right"} text-muted-foreground`}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium text-foreground">{company.name}</span>
                    </button>
                    <div className="text-muted-foreground">{company.userCount}</div>
                    <div className="text-muted-foreground">{formatShortDate(company.createdAt)}</div>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            aria-label={`Azioni per ${company.name}`}
                          >
                            <i className="fa fa-ellipsis-h text-[11px]" aria-hidden="true" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[160px]">
                          <DropdownMenuItem
                            onSelect={() => {
                              setUserCompanyId(company.id);
                              setUserCompanyName(company.name);
                              setUserModalOpen(true);
                              setUserSuccess(null);
                              setUserError(null);
                            }}
                          >
                            <i className="fa fa-user-plus mr-2 text-[12px]" aria-hidden="true" />
                            Nuovo utente
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <div className="flex items-center justify-end">
                        <input
                          value={userSearch[company.id] || ""}
                          onChange={(e) =>
                            setUserSearch((prev) => ({ ...prev, [company.id]: e.target.value }))
                          }
                          placeholder="Cerca utenti..."
                          aria-label={`Cerca utenti in ${company.name}`}
                          className={cn(inputClass, "w-40 sm:w-56")}
                        />
                      </div>

                      <div className={cn(userGrid, "px-2 text-[9px] sm:text-[10px]")}>
                        <SortButton
                          label="Nome"
                          active={userSort.field === "name"}
                          dir={userSort.dir}
                          onClick={() => updateUserSort("name")}
                        />
                        <div className="hidden sm:block">
                          <SortButton
                            label="Email"
                            active={userSort.field === "email"}
                            dir={userSort.dir}
                            onClick={() => updateUserSort("email")}
                          />
                        </div>
                        <SortButton
                          label="Ruolo"
                          active={userSort.field === "role"}
                          dir={userSort.dir}
                          onClick={() => updateUserSort("role")}
                        />
                        <SortButton
                          label="Creato"
                          active={userSort.field === "createdAt"}
                          dir={userSort.dir}
                          onClick={() => updateUserSort("createdAt")}
                        />
                        <div className="text-right text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[10px]">
                          Azioni
                        </div>
                      </div>

                      {sortedUsers.length === 0 ? (
                        <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                          Nessun utente trovato.
                        </div>
                      ) : (
                        sortedUsers.map((user) => (
                          <div
                            key={user.id}
                            className={cn(
                              userGrid,
                              "rounded-md border border-border bg-card px-3 py-2 text-[10px] text-foreground sm:text-[11px]",
                            )}
                          >
                            <div className="min-w-0 truncate">
                              {`${user.firstName} ${user.lastName}`.trim() || user.email}
                            </div>
                            <div className="hidden min-w-0 truncate text-muted-foreground sm:block">
                              {user.email}
                            </div>
                            <div className="text-muted-foreground">{formatRoleLabel(user.role)}</div>
                            <div className="text-muted-foreground">
                              {formatShortDate(user.createdAt)}
                            </div>
                            <div className="flex justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                                    aria-label={`Azioni per ${`${user.firstName} ${user.lastName}`.trim() || user.email}`}
                                  >
                                    <i className="fa fa-ellipsis-h text-[11px]" aria-hidden="true" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[160px]">
                                  <DropdownMenuItem onSelect={() => openEditRestrictions(user)}>
                                    <i className="fa fa-pencil mr-2 text-[12px]" aria-hidden="true" />
                                    Modifica
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <i className="fa fa-ban mr-2 text-[12px]" aria-hidden="true" />
                                    Disattiva
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>

      {/* ---------------------- Modal: registra azienda ---------------------- */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetModal();
        }}
        eyebrow="Registrazione azienda"
        title="Nuova azienda"
        subtitle="Crea una nuova azienda o importa da un servizio esterno."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModalOpen(false);
                resetModal();
              }}
            >
              Annulla
            </Button>
            <Button type="button" variant="brand" onClick={handleRegisterCompany} disabled={registering}>
              {registering ? "Salvataggio..." : "Registra"}
            </Button>
          </>
        }
      >
        <TabSwitch
          ariaLabel="Tipo registrazione azienda"
          value={activeTab}
          onChange={(id) => {
            setActiveTab(id as "new" | "import");
            setRegisterSuccess(null);
            setTachoError(null);
          }}
          tabs={[
            { id: "new", label: "Nuova" },
            { id: "import", label: "Importa da servizio esterno" },
          ]}
        />

        <div className="mt-5 space-y-4">
          {activeTab === "new" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className={labelClass}>Ragione sociale</label>
                <input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setTachoError(null);
                  }}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className={labelClass}>Sede legale</label>
                <input
                  value={legalAddress}
                  onChange={(e) => {
                    setLegalAddress(e.target.value);
                    setTachoError(null);
                  }}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Partita Iva</label>
                <input
                  value={vatId}
                  onChange={(e) => {
                    setVatId(e.target.value);
                    setTachoError(null);
                  }}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Codice Univoco</label>
                <input
                  value={sdiCode}
                  onChange={(e) => {
                    setSdiCode(e.target.value);
                    setTachoError(null);
                  }}
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
                <input
                  type="checkbox"
                  className="accent-brand"
                  aria-label="Registra su servizio esterno"
                  checked={registerTeltonika}
                  onChange={(e) => setRegisterTeltonika(e.target.checked)}
                />
                Registra su servizio esterno
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className={labelClass}>Azienda servizio esterno</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchTachoCompanies}
                  disabled={tachoLoading}
                >
                  {tachoLoading ? "Aggiorno..." : "Aggiorna"}
                </Button>
              </div>
              <div className="relative">
                <input
                  value={tachoQuery}
                  onChange={(e) => {
                    setTachoQuery(e.target.value);
                    setSelectedTachoCompany(null);
                    setRegisterSuccess(null);
                    setTachoError(null);
                  }}
                  onFocus={() => setTachoDropdownOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setTachoDropdownOpen(false), 120);
                  }}
                  placeholder="Seleziona o cerca..."
                  className={inputClass}
                />
                {tachoDropdownOpen && (
                  <div
                    className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {filteredTachoCompanies.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nessuna azienda trovata.
                      </div>
                    ) : (
                      filteredTachoCompanies.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          onMouseDown={() => {
                            setSelectedTachoCompany(company);
                            setTachoQuery(company.name);
                            setImportName(company.name);
                            setRegisterSuccess(null);
                            setTachoError(null);
                            setTachoDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <span
                            className="truncate"
                            style={{
                              paddingLeft: `${Math.max(0, Number(company.depth || 0) * 10)}px`,
                            }}
                          >
                            {company.name}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {company.id}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Nome azienda</label>
                <input
                  value={importName}
                  onChange={(e) => {
                    setImportName(e.target.value);
                    setRegisterSuccess(null);
                    setTachoError(null);
                  }}
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>

        {tachoError && <p className="mt-4 text-sm text-down">{tachoError}</p>}
        {registerSuccess && <p className="mt-4 text-sm text-ok">{registerSuccess}</p>}
      </Modal>

      {/* ----------------------- Modal: registra utente ----------------------- */}
      <Modal
        open={userModalOpen}
        onClose={() => {
          setUserModalOpen(false);
          resetUserModal();
        }}
        eyebrow="Registrazione utente"
        title="Nuovo utente"
        subtitle={`Azienda: ${userCompanyName || userCompanyId || "N/D"}`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setUserModalOpen(false);
                resetUserModal();
              }}
            >
              Annulla
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={handleRegisterUser}
              disabled={userSubmitting}
            >
              {userSubmitting ? "Salvataggio..." : "Registra utente"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className={labelClass}>Nome</label>
            <input
              value={userFirstName}
              onChange={(e) => {
                setUserFirstName(e.target.value);
                setUserError(null);
                setUserSuccess(null);
              }}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Cognome</label>
            <input
              value={userLastName}
              onChange={(e) => {
                setUserLastName(e.target.value);
                setUserError(null);
                setUserSuccess(null);
              }}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Telefono</label>
            <input
              value={userPhone}
              onChange={(e) => {
                setUserPhone(e.target.value);
                setUserError(null);
                setUserSuccess(null);
              }}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Email</label>
            <input
              value={userEmail}
              onChange={(e) => {
                setUserEmail(e.target.value);
                setUserError(null);
                setUserSuccess(null);
              }}
              className={inputClass}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className={labelClass}>Password</label>
            <input
              type="password"
              value={userPassword}
              onChange={(e) => {
                setUserPassword(e.target.value);
                setUserError(null);
                setUserSuccess(null);
              }}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Privilegio</label>
            <select
              value={userPrivilege}
              onChange={(e) => setUserPrivilege(Number(e.target.value))}
              className={inputClass}
            >
              {isSuperAdmin ? (
                <>
                  <option value={0}>Super admin</option>
                  <option value={1}>Amministratore</option>
                  <option value={2}>Utente</option>
                  <option value={3}>Sola lettura</option>
                </>
              ) : (
                <option value={3}>Sola lettura</option>
              )}
            </select>
          </div>
        </div>

        {userPrivilege === 3 && (
          <div className="mt-6 space-y-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="accent-brand"
                aria-label="Abilita restrizioni veicoli"
                checked={restrictionsEnabled}
                onChange={(e) => setRestrictionsEnabled(e.target.checked)}
              />
              Restrizioni veicoli
            </label>

            {restrictionsEnabled && (
              <div className="rounded-md border border-border bg-background p-3">
                <RestrictionPicker
                  mode={restrictionMode}
                  onModeChange={setRestrictionMode}
                  search={restrictionSearch}
                  onSearchChange={setRestrictionSearch}
                  filterOpen={restrictionFilterOpen}
                  onFilterToggle={() => setRestrictionFilterOpen((prev) => !prev)}
                  tags={vehicleTags}
                  activeTags={allowedVehicleTags}
                  onToggleTag={(tag) =>
                    setAllowedVehicleTags((prev) =>
                      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
                    )
                  }
                  vehicles={filteredVehicles}
                  loading={vehicleLoading}
                  selectedIds={selectedVehicleIds}
                  onToggleVehicle={(id) =>
                    setSelectedVehicleIds((prev) =>
                      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
                    )
                  }
                />
              </div>
            )}
          </div>
        )}

        {userError && <p className="mt-4 text-sm text-down">{userError}</p>}
        {userSuccess && <p className="mt-4 text-sm text-ok">{userSuccess}</p>}
      </Modal>

      {/* -------------------- Modal: modifica restrizioni -------------------- */}
      <Modal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          resetEditModal();
        }}
        eyebrow="Restrizioni veicoli"
        title="Modifica visibilità"
        subtitle={`Utente: ${editUserName || "N/D"}`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditModalOpen(false);
                resetEditModal();
              }}
            >
              Annulla
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={handleSaveRestrictions}
              disabled={editSaving || editLoading || editUserRole !== 3}
            >
              {editSaving ? "Salvataggio..." : "Salva"}
            </Button>
          </>
        }
      >
        {editLoading ? (
          <div className="text-sm text-muted-foreground">Caricamento utente...</div>
        ) : editUserRole !== 3 ? (
          <div className="rounded-md border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
            Le restrizioni veicoli sono disponibili solo per utenti sola lettura.
          </div>
        ) : (
          <RestrictionPicker
            mode={editRestrictionMode}
            onModeChange={setEditRestrictionMode}
            search={editRestrictionSearch}
            onSearchChange={setEditRestrictionSearch}
            filterOpen={editRestrictionFilterOpen}
            onFilterToggle={() => setEditRestrictionFilterOpen((prev) => !prev)}
            tags={vehicleTags}
            activeTags={editAllowedVehicleTags}
            onToggleTag={(tag) =>
              setEditAllowedVehicleTags((prev) =>
                prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
              )
            }
            vehicles={editFilteredVehicles}
            loading={vehicleLoading}
            selectedIds={editSelectedVehicleIds}
            onToggleVehicle={(id) =>
              setEditSelectedVehicleIds((prev) =>
                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
              )
            }
          />
        )}

        {editError && <p className="mt-4 text-sm text-down">{editError}</p>}
        {editSuccess && <p className="mt-4 text-sm text-ok">{editSuccess}</p>}
      </Modal>
    </div>
  );
}
