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
        const token = document.cookie
          .split("; ")
          .find((row) => row.startsWith("accessToken="))
          ?.split("=")[1];

        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${decodeURIComponent(token)}`;

        const res = await fetch("http://localhost:5050/api/vehicles", {
          cache: "no-store",
          headers,
        });

        if (!res.ok) {
          throw new Error(`Failed to load vehicles (${res.status})`);
        }

        const data = await res.json();
        setVehicles(data?.vehicles ?? []);
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
          {error}. Check that the backend is running at http://localhost:5050 and your token is valid.
        </div>
      ) : (
        <MapContainer vehicles={vehicles} />
      )}
    </div>
  );
}
