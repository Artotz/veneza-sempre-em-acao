import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Appointment, Company } from "../lib/types";
import type { ScheduleRange } from "../state/ScheduleContext";

const DB_NAME = "pwa-cache";
const DB_VERSION = 2;
const SCHEDULE_STORE = "scheduleCache";
const ACTION_STORE = "pendingActions";
const COMPANY_STORE = "companiesCache";

export type ScheduleSnapshot = {
  key: string;
  userEmail: string;
  range: ScheduleRange;
  appointments: Appointment[];
  companies: Company[];
  createdAt: number;
};

export type PendingScheduleAction = {
  id: string;
  userEmail: string;
  appointmentId: string;
  actionType: "checkIn" | "checkOut" | "absence";
  changes: Record<string, unknown>;
  createdAt: number;
};

export type CompaniesSnapshot = {
  key: string;
  userEmail: string;
  companies: Company[];
  createdAt: number;
};

interface ScheduleDB extends DBSchema {
  scheduleCache: {
    key: string;
    value: ScheduleSnapshot;
  };
  pendingActions: {
    key: string;
    value: PendingScheduleAction;
  };
  companiesCache: {
    key: string;
    value: CompaniesSnapshot;
  };
}

let dbPromise: Promise<IDBPDatabase<ScheduleDB>> | null = null;

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB<ScheduleDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SCHEDULE_STORE)) {
          db.createObjectStore(SCHEDULE_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(ACTION_STORE)) {
          db.createObjectStore(ACTION_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(COMPANY_STORE)) {
          db.createObjectStore(COMPANY_STORE, { keyPath: "key" });
        }
      },
    });
  }

  return dbPromise;
};

const buildRangeKey = (userEmail: string, range: ScheduleRange) =>
  `schedule:${userEmail}:${range.startAt}:${range.endAt}`;

const buildLatestKey = (userEmail: string) => `latest:${userEmail}`;
const buildCompaniesKey = (userEmail: string) => `companies:${userEmail}`;

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const saveScheduleSnapshot = async (
  userEmail: string,
  range: ScheduleRange,
  appointments: Appointment[],
  companies: Company[]
) => {
  const db = await getDb();
  const payload: ScheduleSnapshot = {
    key: buildRangeKey(userEmail, range),
    userEmail,
    range,
    appointments,
    companies,
    createdAt: Date.now(),
  };

  const latest: ScheduleSnapshot = {
    ...payload,
    key: buildLatestKey(userEmail),
  };

  const tx = db.transaction(SCHEDULE_STORE, "readwrite");
  await tx.store.put(payload);
  await tx.store.put(latest);
  await tx.done;
};

export const saveCompaniesSnapshot = async (
  userEmail: string,
  companies: Company[]
) => {
  const db = await getDb();
  const payload: CompaniesSnapshot = {
    key: buildCompaniesKey(userEmail),
    userEmail,
    companies,
    createdAt: Date.now(),
  };
  await db.put(COMPANY_STORE, payload);
};

export const getCompaniesSnapshot = async (userEmail: string) => {
  const db = await getDb();
  return (await db.get(COMPANY_STORE, buildCompaniesKey(userEmail))) ?? null;
};

export const getScheduleSnapshot = async (
  userEmail: string,
  range: ScheduleRange
): Promise<ScheduleSnapshot | null> => {
  const db = await getDb();
  const byRange = await db.get(SCHEDULE_STORE, buildRangeKey(userEmail, range));
  if (byRange) return byRange;

  const latest = await db.get(SCHEDULE_STORE, buildLatestKey(userEmail));
  return latest ?? null;
};

export const savePendingAction = async (params: {
  userEmail: string;
  appointmentId: string;
  actionType: PendingScheduleAction["actionType"];
  changes: Record<string, unknown>;
}) => {
  const db = await getDb();
  const item: PendingScheduleAction = {
    id: generateId(),
    createdAt: Date.now(),
    ...params,
  };
  await db.put(ACTION_STORE, item);
  return item;
};

export const listPendingActions = async (userEmail: string) => {
  const db = await getDb();
  const items = await db.getAll(ACTION_STORE);
  return items
    .filter((item) => item.userEmail === userEmail)
    .sort((a, b) => a.createdAt - b.createdAt);
};

export const removePendingAction = async (id: string) => {
  const db = await getDb();
  await db.delete(ACTION_STORE, id);
};
