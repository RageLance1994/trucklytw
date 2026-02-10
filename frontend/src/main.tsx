import React from "react";

// Polyfill for older browsers (Opera/Vista/7) missing AbortSignal.throwIfAborted
if (typeof AbortSignal !== "undefined" && !AbortSignal.prototype.throwIfAborted) {
  AbortSignal.prototype.throwIfAborted = function () {
    if (this.aborted) {
      if (typeof DOMException !== "undefined") {
        throw new DOMException("Aborted", "AbortError");
      }
      const err = new Error("Aborted");
      (err as any).name = "AbortError";
      throw err;
    }
  };
}
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import "./style.css";
import { MapContainer } from "./MapContainer";
import { Button } from "./components/ui/button";
import { HomeNavbar } from "./components/home-navbar";
import { Navbar } from "./components/navbar";
import { DriverSidebar } from "./components/driver-sidebar";
import { QuickSidebar } from "./components/quick-sidebar";
import { DriverBottomBar } from "./components/driver-bottom-bar";
import { HomePage } from "./pages/HomePage";
import { AccessRequestPage } from "./pages/AccessRequestPage";
import {
  API_BASE_URL,
  LOGIN_PATH,
  VEHICLES_PATH,
  WS_URL,
} from "./config";

type Vehicle = {
  id?: string;
  _id?: string;
  imei: string;
  nickname: string;
  plate: string;
  brand?: string;
  model?: string;
  deviceModel?: string;
  codec?: string;
  lat?: number | null;
  lon?: number | null;
  status?: string;
  angle?: number;
  details?: {
    tanks?: {
      primary?: { capacity?: number | null };
      secondary?: { capacity?: number | null };
      unit?: string;
    };
    sim?: {
      prefix?: string | null;
      number?: string | null;
      iccid?: string | null;
    };
  };
  tags?: string[];
  company?: string;
  customer?: string;
};

const normalizeVehiclePlate = (plate: unknown) => {
  if (!plate) return "";
  if (typeof plate === "string") return plate;
  if (typeof plate === "object") {
    const value = (plate as { v?: string; value?: string }).v
      || (plate as { v?: string; value?: string }).value;
    return value || "";
  }
  return "";
};

const getVehicleStatusMeta = (status?: string | null) => {
  const raw = typeof status === "string" ? status.toLowerCase() : "";
  if (raw === "driving" || raw === "moving") {
    return { label: "In marcia", className: "bg-emerald-400/40 text-emerald-100 ring-1 ring-emerald-300/40" };
  }
  if (raw === "working" || raw === "idle_on" || raw === "ignition_on" || raw === "quadro acceso") {
    return { label: "Quadro acceso", className: "bg-amber-400/40 text-amber-100 ring-1 ring-amber-300/40" };
  }
  if (
    raw === "resting"
    || raw === "stopped"
    || raw === "fermo"
    || raw === "idle_off"
    || raw === "ignition_off"
  ) {
    return { label: "Fermo", className: "bg-rose-400/40 text-rose-100 ring-1 ring-rose-300/40" };
  }
  return { label: "Fermo", className: "bg-rose-400/40 text-rose-100 ring-1 ring-rose-300/40" };
};

function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/session`, {
          cache: "no-store" as RequestCache,
          credentials: "include",
        });

        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.user) {
          navigate(next, { replace: true });
        }
      } catch (err) {
        console.warn("[Login] session check failed", err);
      }
    };

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const isFormLogin = !LOGIN_PATH.toLowerCase().includes("/api/");
      const url = `${API_BASE_URL}${LOGIN_PATH}`;

      const body = isFormLogin
        ? new URLSearchParams({
            // backend form expects "username" field
            username: email,
            password,
          }).toString()
        : JSON.stringify({ email, password });

      const headers: HeadersInit = {
        "Content-Type": isFormLogin
          ? "application/x-www-form-urlencoded;charset=UTF-8"
          : "application/json",
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        credentials: "include",
      });

      if (!res.ok) {
        let message = `Login failed (${res.status})`;
        const text = await res.text().catch(() => "");

        try {
          const data = JSON.parse(text);
          if (data?.error) {
            message = data.error;
          }
        } catch {
          if (text) {
            message = text.slice(0, 200);
          }
        }

        throw new Error(message);
      }

      // For the current Express /login, a successful response is an HTML redirect.
      // Just assume success and redirect user to dashboard.
      navigate(next, { replace: true });
    } catch (err: any) {
      console.error("Login error", err);
      setError(err?.message || "Network error - unable to reach backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-[#f4f4f5]">
      <HomeNavbar />
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center px-4 pb-16 pt-6">
        <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900/70 p-8 shadow-xl">
          <div className="mb-6 flex justify-center">
            <img
              src="/assets/images/logo_white.png"
              alt="Truckly"
              className="h-9 w-auto"
              loading="lazy"
            />
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-zinc-300" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-zinc-300" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            {error && <div className="text-sm text-red-400">{error}</div>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isDriverSidebarOpen, setIsDriverSidebarOpen] = React.useState(false);
  const [isQuickSidebarOpen, setIsQuickSidebarOpen] = React.useState(false);
  const [bottomBarState, setBottomBarState] = React.useState<{
    open: boolean;
    mode: "driver" | "fuel" | "tacho" | "vehicles";
  }>({ open: false, mode: "driver" });
  const [mobileMarkerPanel, setMobileMarkerPanel] = React.useState<{
    open: boolean;
    html: string;
    vehicle: Vehicle | null;
    device: any | null;
    imei: string | null;
  }>({ open: false, html: "", vehicle: null, device: null, imei: null });
  const [assistantOpen, setAssistantOpen] = React.useState(false);
  const [assistantCompanionMode, setAssistantCompanionMode] = React.useState(false);
  const [assistantAction, setAssistantAction] = React.useState<any | null>(null);
  const [mobileMarkerMenuOpen, setMobileMarkerMenuOpen] = React.useState(false);
  const [mapStyle, setMapStyle] = React.useState<
    "base" | "light" | "dark" | "satellite"
  >("base");
  const [assistantInput, setAssistantInput] = React.useState("");
  const [assistantMessages, setAssistantMessages] = React.useState<
    {
      id: string;
      role: "user" | "assistant";
      text: string;
      fullText?: string;
      isTyping?: boolean;
    }[]
  >([]);
  const [assistantChats, setAssistantChats] = React.useState<
    {
      id: string;
      topicKeywords: string[];
      title: string | null;
      updatedAt: string | null;
    }[]
  >([]);
  const [assistantChatId, setAssistantChatId] = React.useState<string | null>(null);
  const [assistantChatsLoading, setAssistantChatsLoading] = React.useState(false);
  const [assistantChatLoading, setAssistantChatLoading] = React.useState(false);
  const [assistantSending, setAssistantSending] = React.useState(false);
  const [assistantError, setAssistantError] = React.useState<string | null>(null);
  const [assistantAttachments, setAssistantAttachments] = React.useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const assistantScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [deleteChatId, setDeleteChatId] = React.useState<string | null>(null);
  const [selectedDriverImei, setSelectedDriverImei] = React.useState<string | null>(null);
  const [selectedDriverDevice, setSelectedDriverDevice] = React.useState<any | null>(null);
  const [selectedFuelImei, setSelectedFuelImei] = React.useState<string | null>(null);
  const [selectedRouteImei, setSelectedRouteImei] = React.useState<string | null>(null);
  const [vehicleEditTarget, setVehicleEditTarget] = React.useState<Vehicle | null>(null);
  const [vehicleEditFocus, setVehicleEditFocus] = React.useState<"tags" | null>(null);
  const [sidebarMode, setSidebarMode] = React.useState<
    "driver" | "routes" | "geofence" | "vehicle" | "admin"
  >("driver");
  const [geofenceDraft, setGeofenceDraft] = React.useState<{
    geofenceId: string;
    imei: string;
    center: { lng: number; lat: number };
    radiusMeters: number;
  } | null>(null);
  const selectedFuelImeiRef = React.useRef<string | null>(null);
  const selectedFuelVehicle = React.useMemo(
    () => vehicles.find((vehicle) => vehicle.imei === selectedFuelImei) ?? null,
    [vehicles, selectedFuelImei],
  );

  React.useEffect(() => {
    selectedFuelImeiRef.current = selectedFuelImei;
  }, [selectedFuelImei]);

  React.useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const html = typeof detail.html === "string" ? detail.html : "";
      const vehicle = detail?.vehicle || null;
      const device = detail?.device || null;
      const imei = detail?.vehicle?.imei || detail?.imei || null;
      setMobileMarkerPanel({ open: true, html, vehicle, device, imei });
      setMobileMarkerMenuOpen(false);
    };
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const html = typeof detail.html === "string" ? detail.html : "";
      const imei = detail?.imei || null;
      if (!imei || imei !== mobileMarkerPanel.imei) return;
      setMobileMarkerPanel((prev) => ({
        ...prev,
        html: html || prev.html,
        device: detail?.device ?? prev.device,
        vehicle: detail?.vehicle ?? prev.vehicle,
      }));
    };
    const handleClose = () => {
      setMobileMarkerPanel((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("truckly:mobile-marker-open", handleOpen as EventListener);
    window.addEventListener("truckly:mobile-marker-update", handleUpdate as EventListener);
    window.addEventListener("truckly:mobile-marker-close", handleClose as EventListener);
    return () => {
      window.removeEventListener("truckly:mobile-marker-open", handleOpen as EventListener);
      window.removeEventListener("truckly:mobile-marker-update", handleUpdate as EventListener);
      window.removeEventListener("truckly:mobile-marker-close", handleClose as EventListener);
    };
  }, [mobileMarkerPanel.imei]);

  React.useEffect(() => {
    if (bottomBarState.open || isDriverSidebarOpen || isQuickSidebarOpen) {
      setMobileMarkerPanel((prev) => ({ ...prev, open: false }));
    }
  }, [bottomBarState.open, isDriverSidebarOpen, isQuickSidebarOpen]);

  const cycleMobileVehicle = (direction: "prev" | "next") => {
    if (!vehicles.length) return;
    const currentImei = mobileMarkerPanel.imei;
    const currentIndex = currentImei
      ? vehicles.findIndex((vehicle) => vehicle.imei === currentImei)
      : -1;
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const delta = direction === "prev" ? -1 : 1;
    const nextIndex = (baseIndex + delta + vehicles.length) % vehicles.length;
    const nextVehicle = vehicles[nextIndex];
    if (!nextVehicle?.imei) return;
    setMobileMarkerPanel((prev) => ({
      ...prev,
      open: true,
      vehicle: nextVehicle,
      imei: nextVehicle.imei,
      html: "",
      device: null,
    }));
    setMobileMarkerMenuOpen(false);
    window.dispatchEvent(
      new CustomEvent("truckly:mobile-marker-focus", {
        detail: { imei: nextVehicle.imei },
      }),
    );
  };

  const handleMobileMarkerAction = (action: string) => {
    const imei = mobileMarkerPanel.vehicle?.imei || null;
    const device = mobileMarkerPanel.device || null;
    if (!action || !imei) return;
    if (action === "driver") {
      window.dispatchEvent(
        new CustomEvent("truckly:driver-open", {
          detail: { imei, device },
        }),
      );
    } else if (action === "fuel") {
      window.dispatchEvent(
        new CustomEvent("truckly:bottom-bar-toggle", {
          detail: { mode: "fuel", imei },
        }),
      );
    } else if (action === "routes") {
      window.dispatchEvent(
        new CustomEvent("truckly:routes-open", {
          detail: { imei },
        }),
      );
    } else if (action === "geofence") {
      (window as any).trucklyStartGeofence?.(imei);
    }
    setMobileMarkerMenuOpen(false);
    };
  
  const loadVehicles = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}${VEHICLES_PATH}`, {
        cache: "no-store" as RequestCache,
        credentials: "include",
      });

      if (res.status === 401) {
        navigate("/login", { replace: true });
        return null;
      }

      if (!res.ok) {
        throw new Error(`Failed to load vehicles (${res.status})`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        navigate("/login", { replace: true });
        return null;
      }

      const data = await res.json();
      const enriched = (data?.vehicles ?? []).map((vehicle: Vehicle) => ({
        ...vehicle,
        lat: typeof vehicle.lat === "number" ? vehicle.lat : vehicle.lat ?? null,
        lon: typeof vehicle.lon === "number" ? vehicle.lon : vehicle.lon ?? null,
      }));

      setVehicles(enriched);
      return enriched;
    } catch (err: any) {
      console.error("[Dashboard] error while loading vehicles", err);
      setError(err?.message || "Unable to load vehicles");
      return null;
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  React.useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  React.useEffect(() => {
    const handler = () => {
      setLoading(true);
      void loadVehicles();
    };
    window.addEventListener("truckly:vehicles-refresh", handler);
    return () => window.removeEventListener("truckly:vehicles-refresh", handler);
  }, [loadVehicles]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const imei = detail?.imei || null;
      const device =
        detail?.device ||
        ((window as any).trucklyGetAvl?.(imei)?.data ||
          (window as any).trucklyGetAvl?.(imei) ||
          null);
      setSelectedDriverImei(imei);
      setSelectedDriverDevice(device);
      setBottomBarState((prev) => ({ ...prev, open: false }));
      setSidebarMode("driver");
      setIsDriverSidebarOpen(true);
    };
    window.addEventListener("truckly:driver-open", handler);
    return () => window.removeEventListener("truckly:driver-open", handler);
  }, []);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const mode =
        detail?.mode === "fuel"
        || detail?.mode === "tacho"
        || detail?.mode === "vehicles"
          ? detail.mode
          : "driver";
      const imei = detail?.imei || null;

      if (mode === "fuel") {
        setSelectedFuelImei(imei);
      }
      if (mode === "vehicles") {
        setIsQuickSidebarOpen(false);
        setIsDriverSidebarOpen(false);
      }

      setBottomBarState((prev) => ({
        open:
          prev.mode === mode &&
          (mode === "fuel"
            ? imei && imei === selectedFuelImeiRef.current
            : true)
            ? !prev.open
            : true,
        mode,
      }));
    };
    window.addEventListener("truckly:bottom-bar-toggle", handler);
    return () => window.removeEventListener("truckly:bottom-bar-toggle", handler);
  }, []);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const imei = detail?.vehicle?.imei || null;
      const device = detail?.device || null;
      if (!imei) return;

      if (isDriverSidebarOpen && sidebarMode === "driver") {
        setSelectedDriverImei(imei);
        setSelectedDriverDevice(device);
      }

      if (bottomBarState.open && bottomBarState.mode === "fuel") {
        setSelectedFuelImei(imei);
      }
    };

    window.addEventListener("vchange", handler);
    return () => window.removeEventListener("vchange", handler);
  }, [bottomBarState.open, bottomBarState.mode, isDriverSidebarOpen, sidebarMode]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      setSelectedRouteImei(detail?.imei || null);
      setSidebarMode("routes");
      setIsDriverSidebarOpen(true);
      setBottomBarState((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("truckly:routes-open", handler);
    return () => window.removeEventListener("truckly:routes-open", handler);
  }, []);

  React.useEffect(() => {
    const handler = () => {
      setSidebarMode("vehicle");
      setVehicleEditTarget(null);
      setVehicleEditFocus(null);
      setIsDriverSidebarOpen(true);
      setBottomBarState((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("truckly:vehicle-register-open", handler);
    return () => window.removeEventListener("truckly:vehicle-register-open", handler);
  }, []);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const target = detail?.vehicle || null;
      setVehicleEditTarget(target);
      setVehicleEditFocus(detail?.focus === "tags" ? "tags" : null);
      setSidebarMode("vehicle");
      setIsDriverSidebarOpen(true);
      setBottomBarState((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("truckly:vehicle-edit-open", handler);
    return () => window.removeEventListener("truckly:vehicle-edit-open", handler);
  }, []);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      if (!detail?.geofenceId || !detail?.imei || !detail?.center) return;
      setGeofenceDraft({
        geofenceId: detail.geofenceId,
        imei: detail.imei,
        center: detail.center,
        radiusMeters: detail.radiusMeters ?? 0,
      });
      setSidebarMode("geofence");
      setIsDriverSidebarOpen(true);
      setBottomBarState((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("truckly:geofence-created", handler);
    return () => window.removeEventListener("truckly:geofence-created", handler);
  }, []);

  React.useEffect(() => {
    const handler = () => {
      if (isDriverSidebarOpen && sidebarMode === "admin") {
        setIsDriverSidebarOpen(false);
        return;
      }
      setSidebarMode("admin");
      setIsDriverSidebarOpen(true);
      setBottomBarState((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("truckly:admin-open", handler);
    return () => window.removeEventListener("truckly:admin-open", handler);
  }, [isDriverSidebarOpen, sidebarMode]);

  React.useEffect(() => {
    if (bottomBarState.open) {
      setIsDriverSidebarOpen(false);
      setIsQuickSidebarOpen(false);
    }
  }, [bottomBarState.open]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem("truckly:map-style");
      if (saved === "base" || saved === "light" || saved === "dark" || saved === "satellite") {
        setMapStyle(saved);
      }
    } catch {}

    const handleMapStyle = (event: Event) => {
      const next = (event as CustomEvent)?.detail?.style;
      if (next === "base" || next === "light" || next === "dark" || next === "satellite") {
        setMapStyle(next);
      }
    };

    window.addEventListener("truckly:map-style", handleMapStyle as EventListener);
    return () => window.removeEventListener("truckly:map-style", handleMapStyle as EventListener);
  }, []);

  React.useEffect(() => {
    if (assistantCompanionMode) return;
    if (isQuickSidebarOpen || isDriverSidebarOpen || bottomBarState.open) {
      setAssistantOpen(false);
    }
  }, [assistantCompanionMode, bottomBarState.open, isDriverSidebarOpen, isQuickSidebarOpen]);

  React.useEffect(() => {
    if (assistantOpen) return;
    setAssistantCompanionMode(false);
    setAssistantAction(null);
  }, [assistantOpen]);

  React.useEffect(() => {
    if (!assistantOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAssistantOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [assistantOpen]);

  const loadAssistantChats = React.useCallback(async () => {
    setAssistantChatsLoading(true);
    setAssistantError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/_agents/chats`, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.chats) ? data.chats : [];
      setAssistantChats(
        list.map((chat: any) => ({
          id: String(chat._id || chat.id),
          topicKeywords: Array.isArray(chat.topicKeywords) ? chat.topicKeywords : [],
          title: chat.title ? String(chat.title) : null,
          updatedAt: chat.updatedAt ? String(chat.updatedAt) : null,
        })),
      );
    } catch (err: any) {
      setAssistantError(err?.message || "Errore durante il caricamento chat.");
    } finally {
      setAssistantChatsLoading(false);
    }
  }, []);

  const loadAssistantChat = React.useCallback(async (chatId: string) => {
    setAssistantChatLoading(true);
    setAssistantError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/_agents/chats/${chatId}`, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      const chat = data?.chat;
      const messages = Array.isArray(chat?.messages) ? chat.messages : [];
      setAssistantMessages(
        messages.map((msg: any, index: number) => ({
          id: String(msg._id || msg.createdAt || `${chatId}-${index}`),
          role: msg.role === "assistant" ? "assistant" : "user",
          text: String(msg.content || ""),
        })),
      );
      setAssistantChatId(chatId);
    } catch (err: any) {
      setAssistantError(err?.message || "Errore durante il caricamento chat.");
    } finally {
      setAssistantChatLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!assistantOpen) return;
    setAssistantMessages([]);
    setAssistantChatId(null);
    setAssistantInput("");
    void loadAssistantChats();
  }, [assistantOpen, loadAssistantChats]);

  const resolveVehicleByQueryInList = React.useCallback(
    (list: Vehicle[], query?: unknown) => {
      if (!query) return null;
      if (typeof query === "object") {
        const imei = (query as any)?.imei || (query as any)?.vehicleId || (query as any)?.id;
        if (imei) {
          return list.find((vehicle) => String(vehicle.imei) === String(imei)) || null;
        }
      }
      const q = String(query || "").trim().toLowerCase();
      if (!q) return null;
      const exact = list.find((vehicle) => String(vehicle.imei).toLowerCase() === q);
      if (exact) return exact;
      return (
        list.find((vehicle) => {
          const nickname = String(vehicle.nickname || "").toLowerCase();
          const plate = String(vehicle.plate || "").toLowerCase();
          return nickname.includes(q) || plate.includes(q);
        }) || null
      );
    },
    [],
  );

  const resolveVehicleByQuery = React.useCallback(
    (query?: unknown) => resolveVehicleByQueryInList(vehicles, query),
    [resolveVehicleByQueryInList, vehicles],
  );

  const performAssistantAction = React.useCallback(
    async (payload: any) => {
      if (!payload || typeof payload !== "object") return false;
      const action = String(payload.action || payload.type || "").toLowerCase();
      if (!action) return false;

      let currentVehicles = vehicles;
      const getKnownImeis = () => new Set(currentVehicles.map((vehicle) => String(vehicle.imei)));

      const ensureVehiclesLoaded = async () => {
        const refreshed = await loadVehicles();
        if (Array.isArray(refreshed)) {
          currentVehicles = refreshed;
        }
      };

      const toArray = (value: any) => (Array.isArray(value) ? value : value ? [value] : []);
      const toNumber = (value: any) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      };
      const getCenter = (raw: any) => {
        if (!raw) return null;
        const lat = toNumber(raw.lat ?? raw.latitude);
        const lng = toNumber(raw.lng ?? raw.lon ?? raw.long ?? raw.longitude);
        if (lat === null || lng === null) return null;
        return { lat, lng };
      };
      const resolveImeiFromList = (value: any) =>
        resolveVehicleByQueryInList(currentVehicles, value)?.imei || null;
      const resolveVehicleWithRefresh = async (value: any) => {
        let match = resolveVehicleByQueryInList(currentVehicles, value);
        if (!match) {
          await ensureVehiclesLoaded();
          match = resolveVehicleByQueryInList(currentVehicles, value);
        }
        return match;
      };

      const candidateQueries = [
        payload?.targetImei,
        payload?.target,
        payload?.targetQuery,
        payload?.query,
        payload?.imei,
        payload?.vehicleId,
        payload?.vehicle,
        payload?.event?.target,
        payload?.event?.vehicleId,
        payload?.event?.imei,
      ];

      let targetImei =
        payload?.targetImei != null ? String(payload.targetImei) : null;
      if (targetImei && !getKnownImeis().has(String(targetImei))) {
        await ensureVehiclesLoaded();
        if (!getKnownImeis().has(String(targetImei))) {
          targetImei = null;
        }
      }

      if (!targetImei) {
        for (const query of candidateQueries) {
          const match = await resolveVehicleWithRefresh(query);
          if (match?.imei) {
            targetImei = String(match.imei);
            break;
          }
        }
      }

      if (action.includes("geofence")) {
        const center =
          getCenter(payload.coordinatesCenter) ||
          getCenter(payload.center) ||
          getCenter(payload.coordinates?.center);
        const radius =
          toNumber(payload.coordinatesRadius) ||
          toNumber(payload.radiusMeters) ||
          toNumber(payload.radius) ||
          toNumber(payload.coordinates?.radius);
        const imei =
          targetImei || (currentVehicles.length === 1 ? currentVehicles[0]?.imei : null);
        if (imei && !getKnownImeis().has(String(imei))) {
          await ensureVehiclesLoaded();
        }
        const validImei = imei && getKnownImeis().has(String(imei)) ? imei : null;
        if (center) {
          (window as any).trucklyFlyToLocation?.({ lng: center.lng, lat: center.lat });
        }
        if (validImei && center && radius) {
          (window as any).trucklyCreateGeofence?.(validImei, center, radius);
          return true;
        }
        if (validImei) {
          (window as any).trucklyStartGeofence?.(validImei);
          return true;
        }
        return Boolean(center);
      }

      if (action.includes("showall") || action.includes("show_all")) {
        (window as any).trucklyShowAllMarkers?.();
        return true;
      }

      if (action.includes("showgroup") || action.includes("group") || action.includes("hide_show")) {
        const list = []
          .concat(toArray(payload.targetsImeis))
          .concat(toArray(payload.targets))
          .concat(toArray(payload.targetIds))
          .concat(toArray(payload.group))
          .concat(toArray(payload.groupImeis));
        let resolved = list
          .map((entry) => resolveImeiFromList(entry) || (typeof entry === "string" ? entry : null))
          .filter(Boolean) as string[];
        resolved = resolved.filter((imei) => getKnownImeis().has(String(imei)));
        if (!resolved.length && list.length) {
          await ensureVehiclesLoaded();
          resolved = list
            .map((entry) => resolveImeiFromList(entry) || (typeof entry === "string" ? entry : null))
            .filter(Boolean) as string[];
          resolved = resolved.filter((imei) => getKnownImeis().has(String(imei)));
        }
        if (resolved.length) {
          (window as any).trucklyShowOnlyMarkers?.(resolved);
          return true;
        }
        if (action.includes("hide_show")) {
          const targetQuery =
            payload?.target ||
            payload?.targetQuery ||
            payload?.query ||
            payload?.vehicle;
          const match = await resolveVehicleWithRefresh(targetQuery);
          if (match?.imei && getKnownImeis().has(String(match.imei))) {
            (window as any).trucklyHideOtherMarkers?.(match.imei);
            (window as any).trucklyFlyToVehicle?.(match);
            return true;
          }
        }
      }

      if (action.includes("showfiltered") || action.includes("filter")) {
        const filters = payload.filters || payload.filter || {};
        const tags = toArray(filters.tags || filters.tag).map((tag) => String(tag).toLowerCase());
        const status = filters.status ? String(filters.status).toLowerCase() : null;
        const company = filters.company ? String(filters.company).toLowerCase() : null;
        const filtered = currentVehicles.filter((vehicle) => {
          const matchesStatus = status
            ? String(vehicle.status || "").toLowerCase().includes(status)
            : true;
          const matchesCompany = company
            ? String(vehicle.company || "").toLowerCase().includes(company)
            : true;
          const vehicleTags = Array.isArray(vehicle.tags)
            ? vehicle.tags.map((t) => String(t).toLowerCase())
            : [];
          const matchesTags = tags.length
            ? tags.some((tag) => vehicleTags.includes(tag))
            : true;
          return matchesStatus && matchesCompany && matchesTags;
        });
        const imeis = filtered
          .map((vehicle) => vehicle.imei)
          .filter(Boolean)
          .filter((imei) => getKnownImeis().has(String(imei)));
        if (imeis.length) {
          (window as any).trucklyShowOnlyMarkers?.(imeis);
          return true;
        }
      }

      if (action.includes("showalone") || action.includes("showonly") || action.includes("solo")) {
        const imei = targetImei || resolveImeiFromList(payload?.vehicle);
        if (imei && !getKnownImeis().has(String(imei))) {
          await ensureVehiclesLoaded();
        }
        if (imei && getKnownImeis().has(String(imei))) {
          (window as any).trucklyHideOtherMarkers?.(imei);
          const targetVehicle = currentVehicles.find((vehicle) => vehicle.imei === imei);
          if (targetVehicle) {
            (window as any).trucklyFlyToVehicle?.(targetVehicle);
          }
          return true;
        }
      }

      if (
        action.includes("track") ||
        action.includes("locate") ||
        action.includes("find") ||
        action.includes("showvehicle") ||
        action.includes("vehicle")
      ) {
        const query =
          payload?.query ||
          payload?.vehicle ||
          payload?.target ||
          payload?.targetImei ||
          payload?.imei ||
          payload?.targetQuery;
        const match = await resolveVehicleWithRefresh(query);
        if (match?.imei && getKnownImeis().has(String(match.imei))) {
          (window as any).trucklyShowAllMarkers?.();
          (window as any).trucklyFlyToVehicle?.(match);
          return true;
        }
      }

      if (action.includes("report_fuel")) {
        const match =
          targetImei ? { imei: targetImei } : await resolveVehicleWithRefresh(payload?.targetQuery || payload?.query);
        const imei = match?.imei || null;
        if (imei) {
          window.dispatchEvent(
            new CustomEvent("truckly:bottom-bar-toggle", {
              detail: { mode: "fuel", imei },
            }),
          );
          return true;
        }
      }

      if (action.includes("report_driver")) {
        const match =
          targetImei ? { imei: targetImei } : await resolveVehicleWithRefresh(payload?.targetQuery || payload?.query);
        const imei = match?.imei || null;
        if (imei) {
          window.dispatchEvent(
            new CustomEvent("truckly:driver-open", {
              detail: { imei },
            }),
          );
          return true;
        }
      }

      if (action.includes("report_route")) {
        const match =
          targetImei ? { imei: targetImei } : await resolveVehicleWithRefresh(payload?.targetQuery || payload?.query);
        const imei = match?.imei || null;
        if (imei) {
          window.dispatchEvent(
            new CustomEvent("truckly:routes-open", {
              detail: { imei },
            }),
          );
          return true;
        }
      }

      if (action.includes("activity_alert")) {
        return true;
      }

      if (action.includes("focus") || action.includes("center") || action.includes("fly")) {
        const center =
          getCenter(payload.coordinatesCenter) ||
          getCenter(payload.center) ||
          getCenter(payload.coordinates?.center);
        if (center) {
          (window as any).trucklyFlyToLocation?.({ lng: center.lng, lat: center.lat });
          return true;
        }
      }

      return false;
    },
    [loadVehicles, resolveVehicleByQueryInList, vehicles],
  );

  const handleAssistantSend = async () => {
    const text = assistantInput.trim();
    if ((!text && assistantAttachments.length === 0) || assistantSending) return;
    setAssistantSending(true);
    setAssistantError(null);
    setAssistantMessages((prev) =>
      prev.map((msg) =>
        msg.isTyping && msg.fullText
          ? { ...msg, text: msg.fullText, isTyping: false }
          : msg
      )
    );
    const typingId = `${Date.now()}-assistant-typing`;
    const userMessage = {
      id: `${Date.now()}-user`,
      role: "user" as const,
      text,
    };
    setAssistantMessages((prev) => [...prev, userMessage]);
    setAssistantInput("");
    setAssistantMessages((prev) => [
      ...prev,
      { id: typingId, role: "assistant" as const, text: "", isTyping: true },
    ]);
    try {
      const form = new FormData();
      if (assistantChatId) form.append("chatId", assistantChatId);
      form.append("message", text);
      assistantAttachments.forEach((file) => form.append("files", file));
      const res = await fetch(`${API_BASE_URL}/_agents/chat`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const data = await res.json().catch(() => ({}));
      const reply = data?.reply?.content ? String(data.reply.content) : "";
      const actionPayload =
        data?.actionPerformative ||
        data?.reply?.actionPerformative ||
        data?.action ||
        null;
      if (Array.isArray(actionPayload)) {
        let performed = false;
        for (const entry of actionPayload) {
          if (await performAssistantAction(entry)) {
            performed = true;
          }
        }
        if (performed) {
          setAssistantCompanionMode(true);
          setAssistantAction(actionPayload);
        }
      } else if (actionPayload && typeof actionPayload === "object") {
        const performed = await performAssistantAction(actionPayload);
        if (performed) {
          setAssistantCompanionMode(true);
          setAssistantAction(actionPayload);
        }
      }
      const nextChatId = data?.chatId ? String(data.chatId) : assistantChatId;
      if (nextChatId && nextChatId !== assistantChatId) {
        setAssistantChatId(nextChatId);
      }
      setAssistantMessages((prev) => {
        const next = prev.filter((msg) => msg.id !== typingId);
        return [
          ...next,
          {
            id: `${Date.now()}-assistant`,
            role: "assistant" as const,
            text: "",
            fullText: reply,
            isTyping: true,
          },
        ];
      });
      setAssistantAttachments([]);
      void loadAssistantChats();
    } catch (err: any) {
      setAssistantMessages((prev) => prev.filter((msg) => msg.id !== typingId));
      setAssistantError(err?.message || "Errore durante l'invio.");
    } finally {
      setAssistantSending(false);
    }
  };

  React.useEffect(() => {
    const typingMessage = assistantMessages.find((msg) => msg.isTyping);
    if (!typingMessage || !typingMessage.fullText) return;
    const interval = window.setInterval(() => {
      setAssistantMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== typingMessage.id || !msg.fullText) return msg;
          const nextLength = Math.min((msg.text?.length || 0) + 1, msg.fullText.length);
          const nextText = msg.fullText.slice(0, nextLength);
          const done = nextLength >= msg.fullText.length;
          return {
            ...msg,
            text: nextText,
            isTyping: done ? false : msg.isTyping,
          };
        })
      );
    }, 14);
    return () => window.clearInterval(interval);
  }, [assistantMessages]);

  React.useEffect(() => {
    if (!assistantOpen || assistantMessages.length === 0) return;
    const node = assistantScrollRef.current;
    if (!node) return;
    const raf = window.requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [assistantMessages, assistantOpen]);

  const mobileVehicle = mobileMarkerPanel.vehicle;
  const mobilePlate = normalizeVehiclePlate(mobileVehicle?.plate);
  const mobileNickname =
    mobileVehicle?.nickname
    || (mobileVehicle as { name?: string } | null)?.name
    || "";
  const mobileLabel = mobileNickname || mobilePlate || "Veicolo";
  const mobilePlateSuffix = mobileNickname && mobilePlate ? ` | ${mobilePlate}` : "";
  const mobileStatus = getVehicleStatusMeta(mobileVehicle?.status);

  return (
    <div className="w-full h-screen flex flex-col bg-[#0a0a0a] text-[#f4f4f5]">
      <Navbar />
      {loading ? (
        <div className="p-6 text-sm text-zinc-300">Loading vehicles...</div>
      ) : error ? (
        <div className="p-6 text-red-400 text-sm">
          {error}. Make sure you are authenticated.
        </div>
      ) : (
        <div className="relative h-full w-full">
          <MapContainer vehicles={vehicles} />
          <QuickSidebar
            isOpen={isQuickSidebarOpen}
            onClose={() => setIsQuickSidebarOpen(false)}
            vehicles={vehicles}
          />
            <DriverSidebar
              isOpen={isDriverSidebarOpen}
              onClose={() => setIsDriverSidebarOpen(false)}
              selectedDriverImei={selectedDriverImei}
              selectedRouteImei={selectedRouteImei}
              selectedDriverDevice={selectedDriverDevice}
              mode={sidebarMode}
              vehicleEditTarget={vehicleEditTarget}
              vehicleEditFocus={vehicleEditFocus}
              geofenceDraft={geofenceDraft}
            />
          <DriverBottomBar
            isOpen={bottomBarState.open}
            mode={bottomBarState.mode}
            onClose={() => setBottomBarState((prev) => ({ ...prev, open: false }))}
            selectedDriverImei={selectedDriverImei}
            selectedVehicleImei={selectedFuelImei}
            selectedVehicle={selectedFuelVehicle}
            vehicles={vehicles}
          />
          {assistantOpen && (
            <div
              className={`fixed inset-0 z-40 flex truckly-chat-overlay ${
                assistantCompanionMode
                  ? "items-end justify-end bg-transparent px-4 pb-4"
                  : "items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"
              } ${assistantCompanionMode ? "truckly-chat-overlay--companion" : ""}`}
            >
              <div
                className={`rounded-[28px] border border-white/10 bg-[#111111] flex truckly-chat-modal ${
                  assistantCompanionMode
                    ? "w-[360px] max-w-[92vw] h-[480px] md:w-[420px] md:h-[520px] px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
                    : "w-full max-w-4xl h-[75vh] px-6 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
                } ${assistantCompanionMode ? "truckly-chat-modal--companion" : ""}`}
              >
                {!assistantCompanionMode && (
                  <div className="w-60 border-r border-white/10 pr-4 flex flex-col min-w-0">
                  <div className="flex items-center justify-between pb-3">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                      Chat
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAssistantChatId(null);
                        setAssistantMessages([]);
                      }}
                      className="text-xs text-white/60 hover:text-white transition"
                    >
                      Nuova
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {assistantChatsLoading ? (
                      <div className="text-xs text-white/50">Caricamento...</div>
                    ) : assistantChats.length === 0 ? (
                      <div className="text-xs text-white/50">Nessuna chat.</div>
                    ) : (
                      assistantChats.map((chat) => {
                        const title = chat.title
                          ? chat.title
                          : chat.topicKeywords && chat.topicKeywords.length > 0
                            ? chat.topicKeywords.slice(0, 4).join(" · ")
                            : "Nuova chat";
                        return (
                          <div
                            key={chat.id}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-[12px] transition ${
                              assistantChatId === chat.id
                                ? "border-white/30 bg-white/10 text-white"
                                : "border-white/10 bg-white/5 text-white/70 hover:text-white hover:border-white/30"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => loadAssistantChat(chat.id)}
                              className="w-full text-left"
                            >
                              <div className="line-clamp-2">{title}</div>
                            </button>
                            <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/40">
                              <span>{chat.updatedAt ? "Aggiornata" : ""}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteChatId(chat.id);
                                }}
                                className="text-white/50 hover:text-white transition"
                                aria-label="Elimina chat"
                              >
                                <i className="fa fa-trash" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  </div>
                )}
                <div
                  className={`relative flex-1 flex flex-col min-w-0 ${
                    assistantCompanionMode ? "pl-0" : "pl-6"
                  }`}
                >
                  {assistantCompanionMode && (
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {assistantAction && (
                          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                            {String(
                              (Array.isArray(assistantAction)
                                ? assistantAction?.[0]?.action
                                : assistantAction?.action) || "azione",
                            )}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAssistantCompanionMode(false)}
                          className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/70 hover:text-white hover:border-white/40 transition"
                        >
                          Espandi
                        </button>
                        <button
                          type="button"
                          onClick={() => setAssistantOpen(false)}
                          className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/70 hover:text-white hover:border-white/40 transition"
                        >
                          Chiudi
                        </button>
                      </div>
                    </div>
                  )}

                  {!assistantCompanionMode && (
                  <button
                    type="button"
                    onClick={() => setAssistantOpen(false)}
                    className="absolute right-0 top-0 z-10 rounded-full border border-white/15 h-9 w-9 text-xs text-white/70 hover:text-white hover:border-white/40 transition inline-flex items-center justify-center"
                    aria-label="Chiudi"
                  >
                    <i className="fa fa-close" aria-hidden="true" />
                  </button>
                  )}

                  {assistantMessages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-8">
                      <div className="w-full text-center space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                          Assistente AI
                        </p>
                        <h3 className="text-2xl font-semibold text-white">
                          Quando vuoi.
                        </h3>
                      </div>
                      <div
                        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#1b1b1b] px-4 py-3"
                        onDragOver={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const files = Array.from(e.dataTransfer.files || []);
                          if (files.length) {
                            setAssistantAttachments(files);
                          }
                        }}
                      >
                      {assistantAttachments.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {assistantAttachments.map((file) => (
                            <span
                              key={`${file.name}-${file.size}-${file.lastModified}`}
                              className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70"
                            >
                              <span className="max-w-[160px] truncate">{file.name}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setAssistantAttachments((prev) =>
                                    prev.filter((f) => f !== file),
                                  )
                                }
                                className="text-white/40 opacity-0 transition group-hover:opacity-100 hover:text-white"
                                aria-label={`Rimuovi ${file.name}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div>
                        <input
                          placeholder="Fai una domanda"
                          value={assistantInput}
                            onChange={(e) => setAssistantInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAssistantSend();
                            }}
                            className="w-full bg-transparent text-base text-white/90 placeholder:text-white/50 outline-none"
                          />
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              accept="image/*,.pdf,.csv,.txt"
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                setAssistantAttachments(files);
                              }}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-xs text-white/60 hover:text-white transition"
                            >
                              Allegati
                            </button>
                          {assistantAttachments.length > 0 && (
                            <span className="text-[10px] text-white/40">
                              {assistantAttachments.length} file
                            </span>
                          )}
                          </div>
                          <button
                            type="button"
                            onClick={handleAssistantSend}
                            disabled={assistantSending}
                            className="h-10 w-10 rounded-full bg-white text-zinc-500 shadow-[0_12px_24px_rgba(0,0,0,0.35)] inline-flex items-center justify-center hover:text-zinc-600 transition disabled:opacity-60"
                            aria-label="Invia"
                          >
                            <i className="fa fa-arrow-up" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      {assistantError && (
                        <div className="text-xs text-red-400">{assistantError}</div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="relative mt-2 transition-opacity duration-300 opacity-0 pointer-events-none">
                        <div className="w-full text-center space-y-2">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                            Assistente AI
                          </p>
                          <h3 className="text-2xl font-semibold text-white">
                            Quando vuoi.
                          </h3>
                        </div>
                      </div>
                      <div className="mt-6 flex-1 flex flex-col gap-4 min-h-0">
                        <div
                          ref={assistantScrollRef}
                          className="flex-1 overflow-y-auto pr-2 space-y-3 overflow-x-hidden min-w-0"
                        >
                          {assistantChatLoading ? (
                            <div className="text-xs text-white/50">Caricamento chat...</div>
                          ) : (
                            assistantMessages.map((message) => (
                              <div
                                key={message.id}
                                className={`flex min-w-0 ${
                                  message.role === "user" ? "justify-end" : "justify-start"
                                }`}
                              >
                                <div
                                  className={`max-w-[60%] w-fit rounded-2xl px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap overflow-x-auto ${
                                    message.isTyping && !message.fullText
                                      ? "text-white/80"
                                      : message.role === "user"
                                        ? "bg-[#1f1f1f] text-white"
                                        : "bg-[#141414] text-white/80 border border-white/10"
                                  }`}
                                >
                                  {message.isTyping && !message.fullText ? (
                                    <span className="truckly-typing-dot" aria-hidden="true" />
                                  ) : (
                                    message.text
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-[#1b1b1b] px-5 py-4 transition-all">
                          <div>
                            <input
                              placeholder="Fai una domanda"
                              value={assistantInput}
                              onChange={(e) => setAssistantInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAssistantSend();
                              }}
                              className="w-full bg-transparent text-base text-white/90 placeholder:text-white/50 outline-none"
                            />
                          </div>
                        <div className="mt-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              accept="image/*,.pdf,.csv,.txt"
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                setAssistantAttachments(files);
                              }}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-xs text-white/60 hover:text-white transition"
                            >
                              Allegati
                            </button>
                            {assistantAttachments.length > 0 && (
                              <span className="text-[10px] text-white/40">
                                {assistantAttachments.length} file
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={handleAssistantSend}
                            disabled={assistantSending}
                              className="h-10 w-10 rounded-full bg-white text-zinc-500 shadow-[0_12px_24px_rgba(0,0,0,0.35)] inline-flex items-center justify-center hover:text-zinc-600 transition disabled:opacity-60"
                              aria-label="Invia"
                            >
                              <i className="fa fa-arrow-up" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        {assistantError && (
                          <div className="text-xs text-red-400">{assistantError}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {deleteChatId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111111] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
                <h4 className="text-sm font-semibold text-white">Eliminare chat?</h4>
                <p className="mt-2 text-xs text-white/60">
                  Questa azione e permanente. Vuoi continuare?
                </p>
                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteChatId(null)}
                    className="rounded-lg border border-white/15 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/70 hover:text-white hover:border-white/40 transition"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const target = deleteChatId;
                      setDeleteChatId(null);
                      try {
                        const res = await fetch(`${API_BASE_URL}/_agents/chats/${target}`, {
                          method: "DELETE",
                          credentials: "include",
                        });
                        if (!res.ok) {
                          const text = await res.text().catch(() => "");
                          throw new Error(text || `HTTP ${res.status}`);
                        }
                        if (assistantChatId === target) {
                          setAssistantChatId(null);
                          setAssistantMessages([]);
                        }
                        void loadAssistantChats();
                      } catch (err: any) {
                        setAssistantError(err?.message || "Errore durante l'eliminazione.");
                      }
                    }}
                    className="rounded-lg bg-red-500/20 border border-red-400/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100 hover:bg-red-500/30 transition"
                  >
                    Elimina
                  </button>
                </div>
              </div>
            </div>
          )}
          {mobileMarkerPanel.open && (
            <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
              <div className="truckly-mobile-panel flex h-[calc((100dvh-var(--truckly-nav-height,64px))*0.618)] flex-col border-t border-white/10 bg-[#0b0b0c] shadow-[0_-20px_40px_rgba(0,0,0,0.45)]">
                <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[12px] font-semibold uppercase tracking-[0.18em] text-white/80">
                        {mobileLabel}
                        {mobilePlateSuffix}
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${mobileStatus.className}`}
                      >
                        {mobileStatus.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cycleMobileVehicle("prev")}
                      className="h-8 w-8 rounded-full border border-white/15 text-xs text-white/70 hover:text-white hover:border-white/40 transition inline-flex items-center justify-center"
                      aria-label="Veicolo precedente"
                    >
                      <i className="fa fa-chevron-left" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => cycleMobileVehicle("next")}
                      className="h-8 w-8 rounded-full border border-white/15 text-xs text-white/70 hover:text-white hover:border-white/40 transition inline-flex items-center justify-center"
                      aria-label="Veicolo successivo"
                    >
                      <i className="fa fa-chevron-right" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileMarkerMenuOpen((prev) => !prev)}
                      className="h-8 w-8 rounded-full border border-white/15 text-xs text-white/70 hover:text-white hover:border-white/40 transition inline-flex items-center justify-center"
                      aria-label="Apri menu"
                      aria-expanded={mobileMarkerMenuOpen}
                    >
                      <i className="fa fa-bars" aria-hidden="true" />
                    </button>
                  </div>
                  {mobileMarkerMenuOpen && (
                    <div className="absolute right-4 top-full z-10 mt-2 w-56 rounded-2xl border border-white/10 bg-[#0a0a0a] p-2 shadow-[0_16px_30px_rgba(0,0,0,0.45)]">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleMobileMarkerAction("routes")}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:text-white hover:border-white/30 transition"
                        >
                          <i className="fa fa-road text-sm" aria-hidden="true" />
                          Percorsi
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMobileMarkerAction("fuel")}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:text-white hover:border-white/30 transition"
                        >
                          <i className="fa fa-tint text-sm" aria-hidden="true" />
                          Carburante
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMobileMarkerAction("driver")}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:text-white hover:border-white/30 transition"
                        >
                          <i className="fa fa-user text-sm" aria-hidden="true" />
                          Autista
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:text-white hover:border-white/30 transition"
                        >
                          <i className="fa fa-bell text-sm" aria-hidden="true" />
                          Alert
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMobileMarkerAction("geofence")}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/80 hover:text-white hover:border-white/30 transition"
                        >
                          <i className="fa fa-bullseye text-sm" aria-hidden="true" />
                          GeoFence
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMobileMarkerPanel((prev) => ({ ...prev, open: false }))}
                        className="mt-2 w-full rounded-xl border border-[var(--tv-red,#ef4444)] bg-[rgba(239,68,68,0.2)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white hover:bg-[rgba(239,68,68,0.3)] transition inline-flex items-center justify-center gap-2"
                      >
                        <i className="fa fa-close" aria-hidden="true" />
                        Chiudi pannello
                      </button>
                    </div>
                  )}
                </div>
                <div className="truckly-mobile-scrollbar flex-1 overflow-y-auto px-4 py-3 text-sm text-white/90">
                  <div
                    className="max-w-full"
                    dangerouslySetInnerHTML={{ __html: mobileMarkerPanel.html }}
                  />
                </div>
              </div>
            </div>
          )}
          {!isQuickSidebarOpen && !isDriverSidebarOpen && (
            <button
              type="button"
              onClick={() => setIsQuickSidebarOpen(true)}
              className={`fixed left-4 top-[5.25rem] z-40 rounded-full border border-white/15 bg-[#0a0a0a]/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 shadow-[0_16px_30px_rgba(0,0,0,0.35)] backdrop-blur transition ${
                bottomBarState.open
                  ? "pointer-events-none opacity-0"
                  : "hover:text-white hover:border-white/40"
              }`}
            >
              <span className="lg:hidden" aria-hidden="true">
                <i className="fa fa-eye" />
              </span>
              <span className="hidden lg:inline">Vista rapida</span>
            </button>
          )}
          {!isQuickSidebarOpen && !isDriverSidebarOpen && !bottomBarState.open && !assistantOpen && (
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className={`fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full border ${
                mapStyle === "dark"
                  ? "border-black/10 bg-white text-orange-500 hover:text-orange-400"
                  : "border-white/10 bg-[#0a0a0a] text-orange-400 hover:text-orange-300"
              } shadow-[0_18px_36px_rgba(0,0,0,0.55)] transition inline-flex items-center justify-center`}
              aria-label="Apri assistente AI"
            >
              <span className="relative flex h-6 w-6 items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3l1.6 3.6L17 8l-3.6 1.6L12 13l-1.6-3.4L7 8l3.4-1.4L12 3z" />
                  <path d="M6 14l.9 2L9 17l-2.1.9L6 20l-.9-2.1L3 17l2.1-.9L6 14z" />
                  <path d="M17 14l.7 1.6L20 16l-1.6.7L17 19l-.7-1.6L14 16l1.6-.7L17 14z" />
                </svg>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/accesso" element={<AccessRequestPage />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <App />,
);

