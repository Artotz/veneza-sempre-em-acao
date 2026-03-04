import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Appointment, Company, CompanyContact } from "../lib/types";
import type { ScheduleRange } from "../state/ScheduleContext";

const DB_NAME = "pwa-cache";
const DB_VERSION = 3;
const SCHEDULE_STORE = "scheduleCache";
const ACTION_STORE = "pendingActions";
const COMPANY_STORE = "companiesCache";
const TODAY_APPOINTMENTS_STORE = "todayAppointmentsCache";
const PENDING_APPOINTMENTS_STORE = "pendingAppointments";

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
  actionType: "checkIn" | "checkOut" | "absence" | "reschedule" | "companyContact";
  changes: Record<string, unknown>;
  createdAt: number;
};

export type CompaniesSnapshot = {
  key: string;
  userEmail: string;
  companies: Company[];
  createdAt: number;
};

export type TodayAppointmentsSnapshot = {
  key: string;
  userEmail: string;
  appointments: Appointment[];
  createdAt: number;
};

export type PendingAppointment = Appointment & {
  pendingSync: true;
  localCreatedAt: number;
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
  todayAppointmentsCache: {
    key: string;
    value: TodayAppointmentsSnapshot;
  };
  pendingAppointments: {
    key: string;
    value: PendingAppointment;
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
        if (!db.objectStoreNames.contains(TODAY_APPOINTMENTS_STORE)) {
          db.createObjectStore(TODAY_APPOINTMENTS_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(PENDING_APPOINTMENTS_STORE)) {
          db.createObjectStore(PENDING_APPOINTMENTS_STORE, { keyPath: "id" });
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
const buildTodayKey = (userEmail: string) => `today:${userEmail}`;

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const eq = <T,>(a: T | null | undefined, b: T | null | undefined) =>
  (a ?? null) === (b ?? null);

const areContactsEqual = (
  a?: CompanyContact | null,
  b?: CompanyContact | null
) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    eq(a.id, b.id) &&
    eq(a.companyId, b.companyId) &&
    eq(a.name, b.name) &&
    eq(a.contact, b.contact) &&
    eq(a.appointmentId, b.appointmentId) &&
    eq(a.createdAt, b.createdAt)
  );
};

const areCompaniesEqual = (a: Company, b: Company) =>
  eq(a.id, b.id) &&
  eq(a.name, b.name) &&
  eq(a.document, b.document) &&
  eq(a.state, b.state) &&
  eq(a.lat, b.lat) &&
  eq(a.lng, b.lng) &&
  eq(a.csa, b.csa) &&
  eq(a.emailCsa, b.emailCsa) &&
  eq(a.carteiraDef, b.carteiraDef) &&
  eq(a.clientClass, b.clientClass) &&
  eq(a.carteiraDef2, b.carteiraDef2) &&
  eq(a.classeCliente, b.classeCliente) &&
  eq(a.validacao, b.validacao) &&
  eq(a.referencia, b.referencia) &&
  eq(a.createdAt, b.createdAt) &&
  eq(a.segment, b.segment) &&
  eq(a.foraCarteira, b.foraCarteira) &&
  areContactsEqual(a.latestContact ?? null, b.latestContact ?? null);

const areCompanyListsEqual = (a: Company[], b: Company[]) => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!areCompaniesEqual(a[index], b[index])) return false;
  }
  return true;
};

const areAppointmentsEqual = (a: Appointment, b: Appointment) =>
  eq(a.id, b.id) &&
  eq(a.companyId, b.companyId) &&
  eq(a.companyName, b.companyName) &&
  eq(a.appointmentId, b.appointmentId) &&
  eq(a.consultantId, b.consultantId) &&
  eq(a.consultant, b.consultant) &&
  eq(a.createdBy, b.createdBy) &&
  eq(a.startAt, b.startAt) &&
  eq(a.endAt, b.endAt) &&
  eq(a.status, b.status) &&
  eq(a.checkInAt, b.checkInAt) &&
  eq(a.checkOutAt, b.checkOutAt) &&
  eq(a.checkInLat, b.checkInLat) &&
  eq(a.checkInLng, b.checkInLng) &&
  eq(a.checkInAccuracyM, b.checkInAccuracyM) &&
  eq(a.checkOutLat, b.checkOutLat) &&
  eq(a.checkOutLng, b.checkOutLng) &&
  eq(a.checkOutAccuracyM, b.checkOutAccuracyM) &&
  eq(a.addressSnapshot, b.addressSnapshot) &&
  eq(a.absenceReason, b.absenceReason) &&
  eq(a.absenceNote, b.absenceNote) &&
  eq(a.notes, b.notes) &&
  eq(a.clientThermometer, b.clientThermometer) &&
  eq(a.createdAt, b.createdAt) &&
  eq(a.updatedAt, b.updatedAt) &&
  eq(a.appointmentTitle, b.appointmentTitle) &&
  eq(a.pendingSync, b.pendingSync) &&
  eq(a.localCreatedAt, b.localCreatedAt) &&
  eq(
    (a.oportunidades ?? null)?.join("|") ?? null,
    (b.oportunidades ?? null)?.join("|") ?? null
  );

const areAppointmentListsEqual = (a: Appointment[], b: Appointment[]) => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!areAppointmentsEqual(a[index], b[index])) return false;
  }
  return true;
};

const areScheduleSnapshotsEqual = (
  a: ScheduleSnapshot,
  b: ScheduleSnapshot
) =>
  eq(a.userEmail, b.userEmail) &&
  eq(a.range.startAt, b.range.startAt) &&
  eq(a.range.endAt, b.range.endAt) &&
  areAppointmentListsEqual(a.appointments, b.appointments) &&
  areCompanyListsEqual(a.companies, b.companies);

const mergeLatestContacts = (
  companies: Company[],
  existing?: CompaniesSnapshot | null
) => {
  if (!existing?.companies.length) return companies;
  const latestById = new Map<string, CompanyContact | null>();
  existing.companies.forEach((company) => {
    if ("latestContact" in company) {
      latestById.set(company.id, company.latestContact ?? null);
    }
  });

  if (!latestById.size) return companies;

  return companies.map((company) => {
    if (company.latestContact != null) return company;
    if (!latestById.has(company.id)) return company;
    return {
      ...company,
      latestContact: latestById.get(company.id) ?? null,
    };
  });
};

export const saveScheduleSnapshot = async (
  userEmail: string,
  range: ScheduleRange,
  appointments: Appointment[],
  companies: Company[]
) => {
  const db = await getDb();
  const existingCompanies = await db.get(
    COMPANY_STORE,
    buildCompaniesKey(userEmail)
  );
  const mergedCompanies = mergeLatestContacts(companies, existingCompanies);
  const payload: ScheduleSnapshot = {
    key: buildRangeKey(userEmail, range),
    userEmail,
    range,
    appointments,
    companies: mergedCompanies,
    createdAt: Date.now(),
  };

  const latest: ScheduleSnapshot = {
    ...payload,
    key: buildLatestKey(userEmail),
  };

  const existingRange = await db.get(SCHEDULE_STORE, payload.key);
  const existingLatest = await db.get(SCHEDULE_STORE, latest.key);
  const shouldWriteRange =
    !existingRange || !areScheduleSnapshotsEqual(existingRange, payload);
  const shouldWriteLatest =
    !existingLatest || !areScheduleSnapshotsEqual(existingLatest, latest);

  if (!shouldWriteRange && !shouldWriteLatest) {
    return;
  }

  const tx = db.transaction(SCHEDULE_STORE, "readwrite");
  if (shouldWriteRange) {
    await tx.store.put(payload);
  }
  if (shouldWriteLatest) {
    await tx.store.put(latest);
  }
  await tx.done;
};

export const saveCompaniesSnapshot = async (
  userEmail: string,
  companies: Company[]
) => {
  const db = await getDb();
  const existing = await db.get(COMPANY_STORE, buildCompaniesKey(userEmail));
  const mergedCompanies = mergeLatestContacts(companies, existing);
  const payload: CompaniesSnapshot = {
    key: buildCompaniesKey(userEmail),
    userEmail,
    companies: mergedCompanies,
    createdAt: Date.now(),
  };
  if (existing && areCompanyListsEqual(existing.companies, payload.companies)) {
    return;
  }
  await db.put(COMPANY_STORE, payload);
};

export const getCompaniesSnapshot = async (userEmail: string) => {
  const db = await getDb();
  return (await db.get(COMPANY_STORE, buildCompaniesKey(userEmail))) ?? null;
};

export const saveTodayAppointments = async (
  userEmail: string,
  appointments: Appointment[]
) => {
  const db = await getDb();
  const payload: TodayAppointmentsSnapshot = {
    key: buildTodayKey(userEmail),
    userEmail,
    appointments,
    createdAt: Date.now(),
  };
  const existing = await db.get(TODAY_APPOINTMENTS_STORE, payload.key);
  if (existing && areAppointmentListsEqual(existing.appointments, appointments)) {
    return;
  }
  await db.put(TODAY_APPOINTMENTS_STORE, payload);
};

export const getTodayAppointments = async (userEmail: string) => {
  const db = await getDb();
  return (await db.get(TODAY_APPOINTMENTS_STORE, buildTodayKey(userEmail))) ?? null;
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

export const rebindPendingActions = async (
  oldAppointmentId: string,
  newAppointmentId: string
) => {
  const db = await getDb();
  const items = await db.getAll(ACTION_STORE);
  const toUpdate = items.filter((item) => item.appointmentId === oldAppointmentId);
  if (!toUpdate.length) return;

  const tx = db.transaction(ACTION_STORE, "readwrite");
  for (const item of toUpdate) {
    await tx.store.put({ ...item, appointmentId: newAppointmentId });
  }
  await tx.done;
};

export const removePendingAction = async (id: string) => {
  const db = await getDb();
  await db.delete(ACTION_STORE, id);
};

export const getPendingAppointment = async (id: string) => {
  const db = await getDb();
  return (await db.get(PENDING_APPOINTMENTS_STORE, id)) ?? null;
};

export const savePendingAppointment = async (
  userEmail: string,
  appointment: Appointment
) => {
  const db = await getDb();
  const createdBy = appointment.createdBy ?? userEmail;
  const consultant = appointment.consultant || userEmail;
  const payload: PendingAppointment = {
    ...appointment,
    createdBy,
    consultant,
    pendingSync: true,
    localCreatedAt: appointment.localCreatedAt ?? Date.now(),
  };
  await db.put(PENDING_APPOINTMENTS_STORE, payload);
  return payload;
};

export const listPendingAppointments = async (userEmail: string) => {
  const db = await getDb();
  const items = await db.getAll(PENDING_APPOINTMENTS_STORE);
  return items
    .filter((item) => item.createdBy === userEmail || item.consultant === userEmail)
    .sort((a, b) => (a.localCreatedAt ?? 0) - (b.localCreatedAt ?? 0));
};

export const removePendingAppointment = async (id: string) => {
  const db = await getDb();
  await db.delete(PENDING_APPOINTMENTS_STORE, id);
};

export const updateCompanyLatestContact = async (
  userEmail: string,
  companyId: string,
  contact: CompanyContact | null
) => {
  const db = await getDb();
  const existing = await db.get(COMPANY_STORE, buildCompaniesKey(userEmail));
  if (!existing) return;

  const nextCompanies = existing.companies.map((company) => {
    if (company.id !== companyId) return company;
    const current = company.latestContact ?? null;
    if (contact) {
      if (areContactsEqual(current, contact)) return company;
      if (current?.createdAt && contact.createdAt) {
        const currentDate = new Date(current.createdAt).getTime();
        const nextDate = new Date(contact.createdAt).getTime();
        if (Number.isFinite(currentDate) && Number.isFinite(nextDate)) {
          if (nextDate <= currentDate) return company;
        }
      }
    }
    return {
      ...company,
      latestContact: contact,
    };
  });

  if (areCompanyListsEqual(existing.companies, nextCompanies)) {
    return;
  }

  await db.put(COMPANY_STORE, {
    ...existing,
    companies: nextCompanies,
    createdAt: Date.now(),
  });
};
