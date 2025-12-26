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
import { Navbar } from "./components/navbar";
import { DriverSidebar } from "./components/driver-sidebar";
import { DriverBottomBar } from "./components/driver-bottom-bar";
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
};

function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
    <div className="min-h-screen w-full flex items-center justify-center bg-[#09090b] text-[#f4f4f5]">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900/70 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold mb-6 text-center">
          Truckly Login
        </h1>

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
  );
}

function DashboardPage() {
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isDriverSidebarOpen, setIsDriverSidebarOpen] = React.useState(false);
  const [bottomBarState, setBottomBarState] = React.useState<{
    open: boolean;
    mode: "driver" | "fuel";
  }>({ open: false, mode: "driver" });
  const [selectedDriverImei, setSelectedDriverImei] = React.useState<string | null>(null);
  const [selectedFuelImei, setSelectedFuelImei] = React.useState<string | null>(null);
  const [selectedRouteImei, setSelectedRouteImei] = React.useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = React.useState<"driver" | "routes" | "geofence">("driver");
  const [geofenceDraft, setGeofenceDraft] = React.useState<{
    geofenceId: string;
    imei: string;
    center: { lng: number; lat: number };
    radiusMeters: number;
  } | null>(null);
  const selectedFuelImeiRef = React.useRef<string | null>(null);

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

        if (!res.ok) {
          throw new Error(`Failed to load vehicles (${res.status})`);
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
  }, []);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      setSelectedDriverImei(detail?.imei || null);
      setBottomBarState((prev) => ({ ...prev, open: false }));
      setSidebarMode("driver");
      setIsDriverSidebarOpen((prev) => !prev);
    };
    window.addEventListener("truckly:driver-open", handler);
    return () => window.removeEventListener("truckly:driver-open", handler);
  }, []);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const mode = detail?.mode === "fuel" ? "fuel" : "driver";
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
      setSelectedRouteImei(detail?.imei || null);
      setSidebarMode("routes");
      setIsDriverSidebarOpen(true);
      setBottomBarState((prev) => ({ ...prev, open: false }));
    };
    window.addEventListener("truckly:routes-open", handler);
    return () => window.removeEventListener("truckly:routes-open", handler);
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
    if (bottomBarState.open) {
      setIsDriverSidebarOpen(false);
    }
  }, [bottomBarState.open]);

  return (
    <div className="w-full h-screen flex flex-col bg-[#09090b] text-[#f4f4f5]">
      <Navbar />
      {loading ? (
        <div className="p-6 text-sm text-zinc-300">Loading vehicles…</div>
      ) : error ? (
        <div className="p-6 text-red-400 text-sm">
          {error}. Make sure you are authenticated.
        </div>
      ) : (
        <div className="relative h-full w-full">
          <MapContainer vehicles={vehicles} />
          <DriverSidebar
            isOpen={isDriverSidebarOpen}
            onClose={() => setIsDriverSidebarOpen(false)}
            selectedDriverImei={selectedDriverImei}
            selectedRouteImei={selectedRouteImei}
            mode={sidebarMode}
            geofenceDraft={geofenceDraft}
          />
          <DriverBottomBar
            isOpen={bottomBarState.open}
            mode={bottomBarState.mode}
            onClose={() => setBottomBarState((prev) => ({ ...prev, open: false }))}
            selectedDriverImei={selectedDriverImei}
            selectedVehicleImei={selectedFuelImei}
          />
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
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <App />,
);
