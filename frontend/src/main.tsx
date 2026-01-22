import React from "react";
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
  imei: string;
  nickname: string;
  plate: string;
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
  };
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
    mode: "driver" | "fuel" | "tacho";
  }>({ open: false, mode: "driver" });
  const [selectedDriverImei, setSelectedDriverImei] = React.useState<string | null>(null);
  const [selectedDriverDevice, setSelectedDriverDevice] = React.useState<any | null>(null);
  const [selectedFuelImei, setSelectedFuelImei] = React.useState<string | null>(null);
  const [selectedRouteImei, setSelectedRouteImei] = React.useState<string | null>(null);
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
    const fetchVehicles = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}${VEHICLES_PATH}`, {
          cache: "no-store" as RequestCache,
          credentials: "include",
        });

        if (res.status === 401) {
          navigate("/login", { replace: true });
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load vehicles (${res.status})`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          navigate("/login", { replace: true });
          return;
        }

        const data = await res.json();
        const enriched = (data?.vehicles ?? []).map((vehicle: Vehicle) => ({
          ...vehicle,
          lat:
            typeof vehicle.lat === "number" ? vehicle.lat : vehicle.lat ?? null,
          lon:
            typeof vehicle.lon === "number" ? vehicle.lon : vehicle.lon ?? null,
        }));

        setVehicles(enriched);
      } catch (err: any) {
        console.error("[Dashboard] error while loading vehicles", err);
        setError(err?.message || "Unable to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, [navigate]);

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
        detail?.mode === "fuel" || detail?.mode === "tacho" ? detail.mode : "driver";
      const imei = detail?.imei || null;

      if (mode === "fuel") {
        setSelectedFuelImei(imei);
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
      setIsDriverSidebarOpen(true);
      setBottomBarState((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("truckly:vehicle-register-open", handler);
    return () => window.removeEventListener("truckly:vehicle-register-open", handler);
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
    }
  }, [bottomBarState.open]);

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
            geofenceDraft={geofenceDraft}
          />
          <DriverBottomBar
            isOpen={bottomBarState.open}
            mode={bottomBarState.mode}
            onClose={() => setBottomBarState((prev) => ({ ...prev, open: false }))}
            selectedDriverImei={selectedDriverImei}
            selectedVehicleImei={selectedFuelImei}
            selectedVehicle={selectedFuelVehicle}
          />
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
              <span className="sm:hidden" aria-hidden="true">
                <i className="fa fa-eye" />
              </span>
              <span className="hidden sm:inline">Vista rapida</span>
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

