import { useCallback, useEffect, useRef, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import i18n from "../i18n";
import { normalizeModelId } from "../utils/machines";
import type {
  WarrantyDataShape,
  WarrantyMatrix,
  WarrantyModalities,
  WarrantyPayload,
  WarrantyUsage,
} from "../types/warranty";

const WARRANTY_META_CACHE_KEY = "pmp-warranty-meta-v1";
const WARRANTY_MODELS_CACHE_KEY = "warranty/modelos";
const WARRANTY_LEGACY_CACHE_KEYS = [
  "pmp-maintenance-cache-v1",
  "pmp-maintenance-cache-v2",
  "pmp-maintenance-cache-v3",
  "pmp-maintenance-raw-itens",
  "pmp-maintenance-raw-modelos",
];
const FIREBASE_DB_URL = import.meta.env.VITE_FIREBASE_DB_URL ?? "";
const WARRANTY_RESOURCE_PATH =
  import.meta.env.VITE_FIREBASE_WARRANTY_PATH ?? "/warranty";

export const WARRANTY_MONTHS = [24, 36, 48, 60, 72, 84] as const;
export const WARRANTY_HOURS = [
  1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 7500, 8000, 9000, 10000,
  12000,
] as const;

export const APPLICATION_KEYS = ["C", "A", "S", "G"] as const;
export const MODALITY_KEYS = ["TF", "TFH", "C"] as const;

const ensureDatabaseConfig = () => {
  if (!FIREBASE_DB_URL) {
    throw new Error(i18n.t("errors.firebaseUrlMissing"));
  }
};

type WarrantyCachePayload = {
  data: WarrantyDataShape;
  updatedAt: number;
};

function dropLegacyCaches() {
  if (typeof window === "undefined") return;
  for (const key of WARRANTY_LEGACY_CACHE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

const parseCache = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { data?: unknown; updatedAt?: number };
  } catch {
    return null;
  }
};

function loadWarrantyCache(): WarrantyCachePayload | null {
  if (typeof window === "undefined") return null;
  dropLegacyCaches();

  const modelosCache = parseCache(
    window.localStorage.getItem(WARRANTY_MODELS_CACHE_KEY)
  );
  if (!modelosCache?.data) return null;

  const meta = parseCache(window.localStorage.getItem(WARRANTY_META_CACHE_KEY));
  const rawUpdatedAt =
    typeof meta?.updatedAt === "number" && Number.isFinite(meta.updatedAt)
      ? meta.updatedAt
      : null;
  const updatedAt = normalizeTimestampMs(rawUpdatedAt) ?? Date.now();

  const payload: WarrantyPayload = {
    modelos: (modelosCache?.data as WarrantyPayload["modelos"]) ?? {},
  };

  return {
    data: normalizeWarrantyData(payload),
    updatedAt,
  };
}

function saveWarrantyCache(payload: {
  modelos?: WarrantyPayload["modelos"] | null;
  updatedAt: number | null;
}) {
  if (typeof window === "undefined") return;
  dropLegacyCaches();

  const safeModelos = payload.modelos ?? {};
  const updatedAt = normalizeTimestampMs(payload.updatedAt) ?? Date.now();

  try {
    window.localStorage.setItem(
      WARRANTY_MODELS_CACHE_KEY,
      JSON.stringify({ data: safeModelos })
    );
  } catch {
    // ignore
  }
  try {
    window.localStorage.setItem(
      WARRANTY_META_CACHE_KEY,
      JSON.stringify({ updatedAt })
    );
  } catch {
    // ignore
  }
  console.log("[WARRANTY CACHE] saved sections", updatedAt);
}

const isNetworkErrorMessage = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes("failed to fetch") || lower.includes("network");
};

const getInitialOnlineStatus = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const normalizeTimestampMs = (value: number | null): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
};

const parseVersionNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const buildWarrantyPath = (subPath?: string) => {
  const root = WARRANTY_RESOURCE_PATH.replace(/^\//, "").replace(/\.json$/, "");
  const cleanRoot = root.length > 0 ? root : "warranty";
  const cleanSuffix = subPath
    ? `/${subPath.replace(/^\//, "").replace(/\.json$/, "")}`
    : "";
  const full = `${cleanRoot.replace(/\/$/, "")}${cleanSuffix}`;
  console.log("[WARRANTY] path: ", full);
  return full;
};

const normalizeWarrantyMatrix = (raw: unknown): WarrantyMatrix => {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map((row) => {
    if (!Array.isArray(row)) return [];
    return WARRANTY_MONTHS.map((_, idx) => {
      const value = Number((row as unknown[])[idx]);
      return Number.isFinite(value) ? value : null;
    });
  });
};

const normalizeWarrantyModalities = (raw: unknown): WarrantyModalities => {
  if (!raw || typeof raw !== "object") return {};
  const tf = normalizeWarrantyMatrix((raw as Record<string, unknown>).TF);
  const tfh = normalizeWarrantyMatrix((raw as Record<string, unknown>).TFH);
  const comprehensive = normalizeWarrantyMatrix(
    (raw as Record<string, unknown>).C
  );
  const result: WarrantyModalities = {};
  if (tf.length > 0) result.TF = tf;
  if (tfh.length > 0) result.TFH = tfh;
  if (comprehensive.length > 0) result.C = comprehensive;
  return result;
};

const normalizeWarrantyUsage = (raw: unknown): WarrantyUsage => {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const result: WarrantyUsage = {};
  const c = normalizeWarrantyModalities(value.C);
  const a = normalizeWarrantyModalities(value.A);
  const s = normalizeWarrantyModalities(value.S);
  const g = normalizeWarrantyModalities(value.G);
  if (Object.keys(c).length > 0) result.C = c;
  if (Object.keys(a).length > 0) result.A = a;
  if (Object.keys(s).length > 0) result.S = s;
  if (Object.keys(g).length > 0) result.G = g;
  return result;
};

function normalizeWarrantyData(
  raw: WarrantyPayload | Partial<WarrantyDataShape> | null | undefined
) {
  const machines: string[] = [];
  const models: Record<string, WarrantyUsage> = {};

  const modelosSource =
    raw && typeof raw === "object" && "modelos" in raw
      ? (raw as WarrantyPayload).modelos
      : raw;

  const modelosEntries = Object.entries(
    (modelosSource as Record<string, WarrantyUsage | null> | null | undefined) ??
      {}
  );

  for (const [rawModelName, modelPayload] of modelosEntries) {
    if (!modelPayload) continue;
    const modelo = normalizeModelId(rawModelName);
    if (!modelo) continue;
    machines.push(modelo);
    models[modelo] = normalizeWarrantyUsage(modelPayload);
  }

  const uniqueMachines = Array.from(
    new Set(machines.map((m) => m.trim()).filter(Boolean))
  );

  if (typeof window !== "undefined") {
    console.log("[WARRANTY] normalizeWarrantyData", {
      rawKeys: raw && typeof raw === "object" ? Object.keys(raw) : [],
      modelosCount: modelosEntries.length,
      machines: uniqueMachines.length,
    });
  }

  return { machines: uniqueMachines, models } satisfies WarrantyDataShape;
}

export type WarrantyDataContextValue = {
  data: WarrantyDataShape | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  isOnline: boolean;
  syncing: boolean;
  retrySync: () => Promise<void>;
  sync: () => Promise<WarrantyDataShape | null>;
};

export function useWarrantyData(): WarrantyDataContextValue {
  const { user } = useAuth();
  const [data, setData] = useState<WarrantyDataShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(getInitialOnlineStatus());
  const [syncing, setSyncing] = useState(false);

  const lastUpdatedRef = useRef<number | null>(null);
  const initialSyncDoneRef = useRef(false);

  const setLastUpdatedValue = useCallback((value: number | null) => {
    const normalized = normalizeTimestampMs(value);
    lastUpdatedRef.current = normalized;
    setLastUpdated(normalized);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateStatus = () => setIsOnline(getInitialOnlineStatus());
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  const applyDataset = useCallback((dataset: WarrantyDataShape) => {
    setData(dataset);
  }, []);

  const fetchWarrantyFromFirebase = useCallback(
    async (expectedVersion?: number | null) => {
      ensureDatabaseConfig();
      const path = buildWarrantyPath("modelos");
      console.log("[WARRANTY] fetching from RTDB path:", path);
      const warrantyRef = ref(db, path);
      const snapshot = await get(warrantyRef);

      if (!snapshot.exists()) {
        throw new Error(i18n.t("errors.maintenanceMissing"));
      }

      const rawValue = snapshot.val();
      console.log("[WARRANTY] raw snapshot value", rawValue);

      const dataset = rawValue as
        | WarrantyPayload
        | Partial<WarrantyDataShape>
        | null;
      if (!dataset) throw new Error(i18n.t("errors.maintenanceMissing"));

      if (typeof window !== "undefined") {
        console.log("[WARRANTY] snapshot keys", Object.keys(dataset || {}));
        console.log(
          "[WARRANTY] modelos keys",
          Object.keys((dataset as WarrantyPayload).modelos ?? {})
        );
      }

      const normalized = normalizeWarrantyData(dataset);
      const updatedAtFromPayload = parseVersionNumber(
        (dataset as Record<string, unknown>)?.lastUpdated
      );

      const updatedAt =
        parseVersionNumber(expectedVersion) ??
        updatedAtFromPayload ??
        Date.now();

      applyDataset(normalized);
      setLastUpdatedValue(updatedAt);

      saveWarrantyCache({
        updatedAt,
        modelos:
          (dataset && typeof dataset === "object" && "modelos" in dataset
            ? (dataset as WarrantyPayload | null | undefined)?.modelos
            : (dataset as Record<string, WarrantyUsage | null> | null | undefined)) ??
          null,
      });

      setError(null);

      console.log("[WARRANTY] baixou do RTDB. updatedAt =", updatedAt);

      return normalized;
    },
    [applyDataset, setLastUpdatedValue]
  );

  const fetchWarrantyVersion = useCallback(async () => {
    ensureDatabaseConfig();
    const versionRef = ref(db, buildWarrantyPath("lastUpdated"));
    const snapshot = await get(versionRef);

    if (!snapshot.exists()) return null;

    return normalizeTimestampMs(parseVersionNumber(snapshot.val()));
  }, []);

  const syncWarranty = useCallback(async () => {
    if (!getInitialOnlineStatus()) {
      throw new Error(i18n.t("errors.syncOffline"));
    }

    let remoteVersion: number | null = null;

    try {
      remoteVersion = await fetchWarrantyVersion();
    } catch {
      return fetchWarrantyFromFirebase();
    }

    const cachedVersion = lastUpdatedRef.current;

    if (cachedVersion == null) {
      console.log("[WARRANTY] sem versão cacheada, baixando tudo");
      return fetchWarrantyFromFirebase(remoteVersion);
    }

    const shouldDownload =
      remoteVersion == null || remoteVersion !== cachedVersion;

    console.log("remote:", remoteVersion, "cached:", cachedVersion);

    if (!shouldDownload) {
      setError(null);
      setLastUpdatedValue(remoteVersion ?? cachedVersion);
      console.log("[WARRANTY] versões iguais, não baixou");
      return null;
    }

    return fetchWarrantyFromFirebase(remoteVersion);
  }, [fetchWarrantyFromFirebase, fetchWarrantyVersion, setLastUpdatedValue]);

  const handleRetryConnection = useCallback(async () => {
    if (syncing) return;
    if (!getInitialOnlineStatus()) {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
      return;
    }
    setSyncing(true);
    try {
      await syncWarranty();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isNetworkErrorMessage(message)) {
        setError(message);
      }
    } finally {
      setSyncing(false);
    }
  }, [syncWarranty, syncing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) return;

    const cached = loadWarrantyCache();
    const hadCachedData = Boolean(cached);

    if (cached) {
      console.log(
        "[WARRANTY] cache encontrado, usando localStorage",
        cached.updatedAt
      );
      applyDataset(cached.data);
      setLastUpdatedValue(cached.updatedAt);
    }

    if (!getInitialOnlineStatus()) {
      setLoading(false);
      if (!hadCachedData) {
        setError(i18n.t("messages.offlineNoCache"));
      }
      return;
    }

    if (!hadCachedData) {
      const run = async () => {
        try {
          await fetchWarrantyFromFirebase();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!isNetworkErrorMessage(message)) {
            setError(message);
          }
        } finally {
          setLoading(false);
        }
      };
      void run();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (initialSyncDoneRef.current) return;
      initialSyncDoneRef.current = true;

      const run = async () => {
        try {
          await syncWarranty();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!isNetworkErrorMessage(message)) {
            setError(message);
          }
        } finally {
          setLoading(false);
        }
      };

      void run();
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    applyDataset,
    fetchWarrantyFromFirebase,
    syncWarranty,
    user,
    setLastUpdatedValue,
  ]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    isOnline,
    syncing,
    retrySync: handleRetryConnection,
    sync: syncWarranty,
  };
}
