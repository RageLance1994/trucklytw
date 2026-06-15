import React from "react";
import { API_BASE_URL } from "../config";

/**
 * Cluster = gruppo di veicoli definito dall'utente (es. "Flotta Nord"),
 * condiviso a livello di azienda e persistito sul backend (`/api/clusters`).
 * MULTI-cluster: un veicolo (per IMEI) può appartenere a più cluster.
 */
export type Cluster = { id: string; name: string; imeis: string[] };

const BASE = `${API_BASE_URL || ""}/api/clusters`;
const JSON_HEADERS = { "Content-Type": "application/json" };

const byName = (a: Cluster, b: Cluster) =>
  a.name.localeCompare(b.name, "it", { sensitivity: "base" });

async function req(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

export function useClusters() {
  const [clusters, setClusters] = React.useState<Cluster[]>([]);
  const [loading, setLoading] = React.useState(true);
  const mounted = React.useRef(true);

  const refresh = React.useCallback(async () => {
    try {
      const data = await req("", { method: "GET" });
      if (mounted.current) {
        setClusters(Array.isArray(data?.clusters) ? data.clusters.slice().sort(byName) : []);
      }
    } catch {
      /* mantieni lo stato precedente */
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const create = React.useCallback(async (name: string): Promise<Cluster | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const data = await req("", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: trimmed }),
      });
      const cluster: Cluster | undefined = data?.cluster;
      if (cluster && mounted.current) {
        setClusters((prev) => [...prev, cluster].sort(byName));
      }
      return cluster || null;
    } catch {
      return null;
    }
  }, []);

  const rename = React.useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setClusters((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name: trimmed } : c)).sort(byName),
      );
      try {
        await req(`/${id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name: trimmed }),
        });
      } catch {
        refresh();
      }
    },
    [refresh],
  );

  const remove = React.useCallback(
    async (id: string) => {
      setClusters((prev) => prev.filter((c) => c.id !== id));
      try {
        await req(`/${id}`, { method: "DELETE" });
      } catch {
        refresh();
      }
    },
    [refresh],
  );

  const addToCluster = React.useCallback(
    async (clusterId: string, imei: string) => {
      const key = String(imei);
      setClusters((prev) =>
        prev.map((c) =>
          c.id === clusterId && !c.imeis.includes(key)
            ? { ...c, imeis: [...c.imeis, key] }
            : c,
        ),
      );
      try {
        await req(`/${clusterId}/vehicles`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ imei: key }),
        });
      } catch {
        refresh();
      }
    },
    [refresh],
  );

  const removeFromCluster = React.useCallback(
    async (clusterId: string, imei: string) => {
      const key = String(imei);
      setClusters((prev) =>
        prev.map((c) => (c.id === clusterId ? { ...c, imeis: c.imeis.filter((i) => i !== key) } : c)),
      );
      try {
        await req(`/${clusterId}/vehicles/${encodeURIComponent(key)}`, { method: "DELETE" });
      } catch {
        refresh();
      }
    },
    [refresh],
  );

  // Rimuove il veicolo da TUTTI i cluster (drop su "Senza cluster").
  const removeFromAll = React.useCallback(
    async (imei: string) => {
      const key = String(imei);
      const containing = clusters.filter((c) => c.imeis.includes(key));
      if (containing.length === 0) return;
      setClusters((prev) => prev.map((c) => ({ ...c, imeis: c.imeis.filter((i) => i !== key) })));
      try {
        await Promise.all(
          containing.map((c) =>
            req(`/${c.id}/vehicles/${encodeURIComponent(key)}`, { method: "DELETE" }),
          ),
        );
      } catch {
        refresh();
      }
    },
    [clusters, refresh],
  );

  const clustersOf = React.useCallback(
    (imei: string): Cluster[] => {
      const key = String(imei);
      return clusters.filter((c) => c.imeis.includes(key));
    },
    [clusters],
  );

  return {
    clusters,
    loading,
    refresh,
    create,
    rename,
    remove,
    addToCluster,
    removeFromCluster,
    removeFromAll,
    clustersOf,
  };
}
