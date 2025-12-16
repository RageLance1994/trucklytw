"use client";

import { useEffect, useState } from "react";
import MapContainer from "./MapContainer";

type Vehicle = {
  imei: string;
  nickname: string;
  plate: string;
  lat?: number;
  lon?: number;
};

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const res = await fetch("/api/vehicles", {
          cache: "no-store",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(`Failed to load vehicles (${res.status})`);
        }

        const data = await res.json();
        const enriched = (data?.vehicles ?? []).map((vehicle: Vehicle) => ({
          ...vehicle,
          lat: typeof vehicle.lat === "number" ? vehicle.lat : undefined,
          lon: typeof vehicle.lon === "number" ? vehicle.lon : undefined,
        }));

        setVehicles(enriched);
      } catch (err: any) {
        setError(err?.message || "Unable to load vehicles");
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-zinc-300">Loading vehicles…</div>;
  }

  return (
    <div className="w-full h-full flex flex-col">
      {error ? (
        <div className="p-6 text-red-400 text-sm">
          {error}. Make sure you are authenticated and the database is reachable.
        </div>
      ) : (
        <MapContainer vehicles={vehicles} />
      )}
    </div>
  );
}
