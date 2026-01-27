import { useCallback, useEffect, useRef, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import i18n from "../i18n";
import { normalizeModelId } from "../utils/machines";
import type {
  BranchPrice,
  DataShape,
  Item,
  LaborValue,
  MaintenanceItemDetails,
  MaintenancePayload,
  MaintenanceRevision,
  MaintenanceRevisionItem,
} from "../types/maintenance";

const MAINTENANCE_META_CACHE_KEY = "pmp-maintenance-meta-v1";
const MODELS_CACHE_KEY = "maintenance/modelos";
const ITEMS_CACHE_KEY = "maintenance/itens";
const LEGACY_CACHE_KEYS = [
  "pmp-maintenance-cache-v1",
  "pmp-maintenance-cache-v2",
  "pmp-maintenance-cache-v3",
  "pmp-maintenance-raw-itens",
  "pmp-maintenance-raw-modelos",
];
const MAINTENANCE_DB_URL = import.meta.env.VITE_FIREBASE_DB_URL ?? "";
const MAINTENANCE_RESOURCE_PATH =
  import.meta.env.VITE_FIREBASE_MAINTENANCE_PATH ?? "/maintenance";

const ensureDatabaseConfig = () => {
  if (!MAINTENANCE_DB_URL) {
    throw new Error(i18n.t("errors.firebaseUrlMissing"));
  }
};

type MaintenanceCachePayload = {
  data: DataShape;
  updatedAt: number;
};

function dropLegacyCaches() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_CACHE_KEYS) {
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

function loadMaintenanceCache(): MaintenanceCachePayload | null {
  if (typeof window === "undefined") return null;
  dropLegacyCaches();

  const modelosCache = parseCache(
    window.localStorage.getItem(MODELS_CACHE_KEY)
  );
  const itensCache = parseCache(window.localStorage.getItem(ITEMS_CACHE_KEY));
  if (!modelosCache?.data && !itensCache?.data) return null;

  const meta = parseCache(
    window.localStorage.getItem(MAINTENANCE_META_CACHE_KEY)
  );
  const rawUpdatedAt =
    typeof meta?.updatedAt === "number" && Number.isFinite(meta.updatedAt)
      ? meta.updatedAt
      : null;
  const updatedAt = normalizeTimestampMs(rawUpdatedAt) ?? Date.now();

  const payload: MaintenancePayload = {
    modelos: (modelosCache?.data as MaintenancePayload["modelos"]) ?? {},
    itens: (itensCache?.data as MaintenancePayload["itens"]) ?? {},
  };

  return {
    data: normalizeDataShape(payload),
    updatedAt,
  };
}

function saveMaintenanceCache(payload: {
  modelos?: MaintenancePayload["modelos"] | null;
  itens?: MaintenancePayload["itens"] | null;
  updatedAt: number | null;
}) {
  if (typeof window === "undefined") return;
  dropLegacyCaches();

  const safeModelos = payload.modelos ?? {};
  const safeItens = payload.itens ?? {};
  const updatedAt = normalizeTimestampMs(payload.updatedAt) ?? Date.now();

  try {
    window.localStorage.setItem(
      MODELS_CACHE_KEY,
      JSON.stringify({ data: safeModelos })
    );
  } catch {
    // ignore
  }
  try {
    window.localStorage.setItem(
      ITEMS_CACHE_KEY,
      JSON.stringify({ data: safeItens })
    );
  } catch {
    // ignore
  }
  try {
    window.localStorage.setItem(
      MAINTENANCE_META_CACHE_KEY,
      JSON.stringify({ updatedAt })
    );
  } catch {
    // ignore
  }
  console.log("[MAINT CACHE] saved sections", updatedAt);
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

const buildMaintenancePath = (subPath?: string) => {
  const root = MAINTENANCE_RESOURCE_PATH.replace(/^\//, "").replace(
    /\.json$/,
    ""
  );
  const cleanRoot = root.length > 0 ? root : "maintenance";
  const cleanSuffix = subPath
    ? `/${subPath.replace(/^\//, "").replace(/\.json$/, "")}`
    : "";
  return `${cleanRoot.replace(/\/$/, "")}${cleanSuffix}`;
};

function valuesArray<T>(
  value: T[] | Record<string, T> | null | undefined
): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}

const normalizeBranchPrice = (raw: unknown): BranchPrice => {
  if (!raw || typeof raw !== "object") return {};
  const precoInterno = Number(
    (raw as Record<string, unknown>).precoInterno ??
      (raw as Record<string, unknown>).interno ??
      (raw as Record<string, unknown>).preco_interno
  );
  const precoExterno = Number(
    (raw as Record<string, unknown>).precoExterno ??
      (raw as Record<string, unknown>).externo ??
      (raw as Record<string, unknown>).preco_externo
  );
  const precoJd = Number(
    (raw as Record<string, unknown>).jd ??
      (raw as Record<string, unknown>).precoJd ??
      (raw as Record<string, unknown>).preco_jd
  );

  return {
    precoInterno: Number.isFinite(precoInterno) ? precoInterno : null,
    precoExterno: Number.isFinite(precoExterno) ? precoExterno : null,
    jd: Number.isFinite(precoJd) ? precoJd : null,
  };
};

const normalizeBranchPriceMap = (
  raw: MaintenanceItemDetails["precos"] | null | undefined
) => {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, BranchPrice> = {};
  for (const [branchName, price] of Object.entries(raw)) {
    const key = branchName.trim();
    if (!key) continue;
    const normalized = normalizeBranchPrice(price);
    const hasAnyPrice =
      normalized.precoInterno != null ||
      normalized.precoExterno != null ||
      normalized.jd != null;
    if (hasAnyPrice) result[key] = normalized;
  }
  return result;
};

function normalizeLegacyDataShape(raw: Partial<DataShape> | null | undefined) {
  const machines = valuesArray<string | null>(raw?.machines)
    .filter((m): m is string => typeof m === "string" && m.length > 0)
    .map((m) => m.trim());

  const hours = valuesArray<number | string | null>(raw?.hours)
    .map((h) => Number(h))
    .filter((h) => Number.isFinite(h));

  const items = valuesArray<Item | null>(raw?.items)
    .filter((item): item is Item => Boolean(item))
    .map((item) => {
      const quantityRaw =
        (item as Record<string, unknown>)?.quantidade ??
        (item as Record<string, unknown>)?.qtd ??
        1;
      const quantity = Number(quantityRaw);
      return {
        ...item,
        quantidade: Number.isFinite(quantity) ? quantity : 1,
        branchPrices: item.branchPrices ?? {},
        // precos: item.precos ?? {},
      };
    });

  const laborFromValorMo = valuesArray<Partial<LaborValue>>(
    (raw as Record<string, unknown> | null | undefined)?.valor_mo as
      | Partial<LaborValue>[]
      | null
      | undefined
  );
  const laborFromField = valuesArray<Partial<LaborValue>>(
    raw?.labor as LaborValue[] | null
  );
  const laborRaw = (
    laborFromValorMo.length > 0 ? laborFromValorMo : laborFromField
  ).filter((entry): entry is Partial<LaborValue> => Boolean(entry));

  const labor: LaborValue[] = laborRaw.flatMap((entry) => {
    const modelo = typeof entry?.modelo === "string" ? entry.modelo.trim() : "";
    const horasRevisao = Number(
      (entry as Record<string, unknown>)?.horas_revisao ??
        (entry as Record<string, unknown>)?.hour ??
        (entry as Record<string, unknown>)?.horas_base ??
        0
    );
    if (!modelo || !Number.isFinite(horasRevisao)) return [];

    const valorMoRaw = (entry as Record<string, unknown>)?.valor_mo;
    const horasBaseRaw = (entry as Record<string, unknown>)?.horas_base;
    const totalMoRaw = (entry as Record<string, unknown>)?.total_mo;

    const valor_mo =
      typeof valorMoRaw === "number" && Number.isFinite(valorMoRaw)
        ? valorMoRaw
        : Number.isFinite(Number(valorMoRaw))
        ? Number(valorMoRaw)
        : null;
    const horas_base =
      typeof horasBaseRaw === "number" && Number.isFinite(horasBaseRaw)
        ? horasBaseRaw
        : Number.isFinite(Number(horasBaseRaw))
        ? Number(horasBaseRaw)
        : null;
    const total_mo =
      typeof totalMoRaw === "number" && Number.isFinite(totalMoRaw)
        ? totalMoRaw
        : Number.isFinite(Number(totalMoRaw))
        ? Number(totalMoRaw)
        : null;

    return [
      {
        modelo,
        horas_revisao: horasRevisao,
        valor_mo,
        horas_base,
        total_mo,
      },
    ];
  });

  return { machines, hours, items, labor } satisfies DataShape;
}

function normalizeNewDataShape(raw: MaintenancePayload | null | undefined) {
  const machines: string[] = [];
  const hoursSet = new Set<number>();
  const items: Item[] = [];
  const labor: LaborValue[] = [];

  if (!raw || typeof raw !== "object") {
    return { machines, hours: [], items, labor };
  }

  const hoursFromRoot = valuesArray<number | string | null>(
    (raw as Record<string, unknown> | null | undefined)?.hours as
      | number[]
      | string[]
      | null
      | undefined
  );
  for (const h of hoursFromRoot) {
    const parsed = Number(h);
    if (Number.isFinite(parsed)) hoursSet.add(parsed);
  }

  const modelosEntries = Object.entries(raw.modelos ?? {});
  const itemDetails = raw.itens ?? {};

  for (const [rawModelName, modelPayload] of modelosEntries) {
    if (!modelPayload) continue;
    const modelo = normalizeModelId(rawModelName);
    if (modelo) {
      machines.push(modelo);
    }

    const manutencoes =
      (modelPayload as Record<string, unknown>).manutencoes ?? {};
    const custoHoraMO = Number(
      (modelPayload as Record<string, unknown>).custoHoraMO ??
        (modelPayload as Record<string, unknown>).custoHoraMo ??
        (modelPayload as Record<string, unknown>).custo_hora_mo ??
        (modelPayload as Record<string, unknown>).custo_hora
    );

    for (const [hourKey, maint] of Object.entries(manutencoes ?? {})) {
      if (!maint) continue;
      const hour = Number(hourKey);
      if (!Number.isFinite(hour)) continue;
      hoursSet.add(hour);

      const horasMoValue = Number(
        (maint as Record<string, unknown>).horasMO ??
          (maint as Record<string, unknown>).horasMo ??
          (maint as Record<string, unknown>).horas_mo ??
          (maint as Record<string, unknown>).horasRevisao
      );
      const horas_base = Number.isFinite(horasMoValue) ? horasMoValue : null;
      const valor_mo = Number.isFinite(custoHoraMO) ? custoHoraMO : null;
      const total_mo =
        valor_mo != null && horas_base != null ? valor_mo * horas_base : null;

      if (valor_mo != null || total_mo != null) {
        labor.push({
          modelo,
          horas_revisao: hour,
          valor_mo,
          horas_base,
          total_mo,
        });
      }

      const manutItems = valuesArray<MaintenanceRevisionItem | null>(
        (maint as MaintenanceRevision | null | undefined)?.itens as
          | MaintenanceRevisionItem[]
          | Record<string, MaintenanceRevisionItem | null>
          | null
          | undefined
      ).filter((it): it is MaintenanceRevisionItem => Boolean(it?.codigo));

      for (const itemRef of manutItems) {
        const codigo =
          typeof itemRef.codigo === "string"
            ? itemRef.codigo.trim()
            : String(itemRef.codigo ?? "").trim();
        if (!codigo) continue;

        const qtdRaw =
          (itemRef as Record<string, unknown>).quantidade ??
          (itemRef as Record<string, unknown>).qtd ??
          1;
        const qtdParsed = Number(qtdRaw);
        const quantidade = Number.isFinite(qtdParsed) ? qtdParsed : 1;

        const details = itemDetails?.[codigo] ?? null;
        const descricao =
          typeof details?.descricao === "string" && details.descricao.trim()
            ? details.descricao.trim()
            : codigo;

        const branchPrices = normalizeBranchPriceMap(details?.precos);

        items.push({
          modelo,
          hour,
          tipo: "Peça",
          codigo,
          descricao,
          quantidade,
          // precos: {},
          branchPrices,
        });
      }
    }
  }

  const hours = Array.from(hoursSet)
    .filter((h): h is number => Number.isFinite(h))
    .sort((a, b) => a - b);
  const uniqueMachines = Array.from(
    new Set(machines.map((m) => m.trim()).filter(Boolean))
  );

  return { machines: uniqueMachines, hours, items, labor } satisfies DataShape;
}

function normalizeDataShape(raw: unknown) {
  if (raw && typeof raw === "object" && "modelos" in raw) {
    return normalizeNewDataShape(raw as MaintenancePayload);
  }
  return normalizeLegacyDataShape(raw as Partial<DataShape> | null | undefined);
}

export type MaintenanceDataContextValue = {
  data: DataShape | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  isOnline: boolean;
  syncing: boolean;
  retrySync: () => Promise<void>;
  sync: () => Promise<DataShape | null>;
};

export function useMaintenanceData(): MaintenanceDataContextValue {
  const { user } = useAuth();
  const [data, setData] = useState<DataShape | null>(null);
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

  const applyDataset = useCallback((dataset: DataShape) => {
    setData(dataset);
  }, []);

  const fetchMaintenanceFromFirebase = useCallback(
    async (expectedVersion?: number | null) => {
      ensureDatabaseConfig();
      const maintenanceRef = ref(db, buildMaintenancePath());
      const snapshot = await get(maintenanceRef);

      if (!snapshot.exists()) {
        throw new Error(i18n.t("errors.maintenanceMissing"));
      }

      const dataset = snapshot.val() as
        | MaintenancePayload
        | Partial<DataShape>
        | null;
      if (!dataset) throw new Error(i18n.t("errors.maintenanceMissing"));

      const normalized = normalizeDataShape(dataset);
      const updatedAtFromPayload = parseVersionNumber(
        (dataset as Record<string, unknown>)?.lastUpdated
      );

      const updatedAt =
        parseVersionNumber(expectedVersion) ??
        updatedAtFromPayload ??
        Date.now();

      applyDataset(normalized);
      setLastUpdatedValue(updatedAt);

      saveMaintenanceCache({
        updatedAt,
        itens:
          (dataset as MaintenancePayload | null | undefined)?.itens ?? null,
        modelos:
          (dataset as MaintenancePayload | null | undefined)?.modelos ?? null,
      });

      setError(null);

      console.log("[MAINT] baixou do RTDB. updatedAt =", updatedAt);

      return normalized;
    },
    [applyDataset, setLastUpdatedValue]
  );

  const fetchMaintenanceVersion = useCallback(async () => {
    ensureDatabaseConfig();
    const versionRef = ref(db, buildMaintenancePath("lastUpdated"));
    const snapshot = await get(versionRef);

    if (!snapshot.exists()) return null;

    return normalizeTimestampMs(parseVersionNumber(snapshot.val()));
  }, []);

  const syncMaintenance = useCallback(async () => {
    if (!getInitialOnlineStatus()) {
      throw new Error(i18n.t("errors.syncOffline"));
    }

    let remoteVersion: number | null = null;

    try {
      remoteVersion = await fetchMaintenanceVersion();
    } catch {
      return fetchMaintenanceFromFirebase();
    }

    const cachedVersion = lastUpdatedRef.current;

    if (cachedVersion == null) {
      console.log("[MAINT] sem versão cacheada, baixando tudo");
      return fetchMaintenanceFromFirebase(remoteVersion);
    }

    const shouldDownload =
      remoteVersion == null || remoteVersion !== cachedVersion;

    console.log("remote:", remoteVersion, "cached:", cachedVersion);

    if (!shouldDownload) {
      setError(null);
      setLastUpdatedValue(remoteVersion ?? cachedVersion);
      console.log("[MAINT] versões iguais, não baixou");
      return null;
    }

    return fetchMaintenanceFromFirebase(remoteVersion);
  }, [
    fetchMaintenanceFromFirebase,
    fetchMaintenanceVersion,
    setLastUpdatedValue,
  ]);

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
      await syncMaintenance();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isNetworkErrorMessage(message)) {
        setError(message);
      }
    } finally {
      setSyncing(false);
    }
  }, [syncMaintenance, syncing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) return;

    const cached = loadMaintenanceCache();
    const hadCachedData = Boolean(cached);

    if (cached) {
      console.log(
        "[MAINT] cache encontrado, usando localStorage",
        cached.updatedAt
      );
      const normalizedCached = normalizeDataShape(cached.data);
      applyDataset(normalizedCached);
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
          await fetchMaintenanceFromFirebase();
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
          await syncMaintenance();
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
    fetchMaintenanceFromFirebase,
    syncMaintenance,
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
    sync: syncMaintenance,
  };
}
