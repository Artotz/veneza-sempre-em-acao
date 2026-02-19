import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Appointment } from "../lib/types";
import { isSameDay } from "../lib/date";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import {
  APPOINTMENT_SELECT,
  COMPANY_SELECT,
  mapAppointment,
  mapCompany,
} from "../lib/supabase";
import { useAuth } from "../contexts/useAuth";
import {
  ScheduleContext,
  type ScheduleRange,
  type ScheduleState,
  type ScheduleContextValue,
} from "./ScheduleContext";
import {
  getCompaniesSnapshot,
  getScheduleSnapshot,
  getTodayAppointments,
  listPendingActions,
  listPendingAppointments,
  saveCompaniesSnapshot,
  saveScheduleSnapshot,
  saveTodayAppointments,
  type PendingScheduleAction,
} from "../storage/offlineSchedule";
import { t } from "../i18n";

type ScheduleAction =
  | {
      type: "init";
      payload: { appointments: Appointment[]; companies: ScheduleState["companies"] };
    }
  | { type: "error"; payload: string }
  | { type: "set_busy"; payload: { id: string; busy: boolean } }
  | { type: "update"; payload: { id: string; changes: Partial<Appointment> } }
  | { type: "set_range"; payload: ScheduleRange }
  | { type: "set_loading" }
  | { type: "reset" };

const initialState: ScheduleState = {
  appointments: [],
  companies: [],
  loading: false,
  error: null,
  busyIds: [],
  range: null,
};

const scheduleReducer = (
  state: ScheduleState,
  action: ScheduleAction
): ScheduleState => {
  switch (action.type) {
    case "init":
      return {
        ...state,
        appointments: action.payload.appointments,
        companies: action.payload.companies,
        loading: false,
        error: null,
      };
    case "error":
      return { ...state, loading: false, error: action.payload };
    case "set_busy":
      return {
        ...state,
        busyIds: action.payload.busy
          ? [...new Set([...state.busyIds, action.payload.id])]
          : state.busyIds.filter((id) => id !== action.payload.id),
      };
    case "update":
      return {
        ...state,
        appointments: state.appointments.map((appointment) =>
          appointment.id === action.payload.id
            ? { ...appointment, ...action.payload.changes }
            : appointment
        ),
      };
    case "set_range":
      if (
        state.range?.startAt === action.payload.startAt &&
        state.range?.endAt === action.payload.endAt
      ) {
        return state;
      }
      return { ...state, range: action.payload, loading: true, error: null };
    case "set_loading":
      return { ...state, loading: true, error: null };
    case "reset":
      return {
        ...state,
        appointments: [],
        companies: [],
        loading: false,
        error: null,
        busyIds: [],
      };
    default:
      return state;
  }
};

const hasCoords = (lat?: number | null, lng?: number | null) =>
  lat != null && lng != null;

const buildCheckInChanges = (payload: {
  at: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
}) => {
  const remoteChanges: Record<string, unknown> = {
    check_in_at: payload.at,
    status: "in_progress",
  };
  const localChanges: Partial<Appointment> = {
    checkInAt: payload.at,
    status: "in_progress",
  };

  if (hasCoords(payload.lat, payload.lng)) {
    remoteChanges.check_in_lat = payload.lat as number;
    remoteChanges.check_in_lng = payload.lng as number;
    localChanges.checkInLat = payload.lat as number;
    localChanges.checkInLng = payload.lng as number;
    if (payload.accuracy != null) {
      remoteChanges.check_in_accuracy_m = payload.accuracy;
      localChanges.checkInAccuracyM = payload.accuracy;
    }
  }

  return { remoteChanges, localChanges };
};

const buildCheckOutChanges = (payload: {
  at: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  oportunidades: string[];
  notes?: string | null;
}) => {
  const remoteChanges: Record<string, unknown> = {
    check_out_at: payload.at,
    status: "done",
    oportunidades: payload.oportunidades,
    notes: payload.notes ?? null,
  };
  const localChanges: Partial<Appointment> = {
    checkOutAt: payload.at,
    status: "done",
    oportunidades: payload.oportunidades,
    notes: payload.notes ?? null,
  };

  if (hasCoords(payload.lat, payload.lng)) {
    remoteChanges.check_out_lat = payload.lat as number;
    remoteChanges.check_out_lng = payload.lng as number;
    localChanges.checkOutLat = payload.lat as number;
    localChanges.checkOutLng = payload.lng as number;
    if (payload.accuracy != null) {
      remoteChanges.check_out_accuracy_m = payload.accuracy;
      localChanges.checkOutAccuracyM = payload.accuracy;
    }
  }

  return { remoteChanges, localChanges };
};

const buildAbsenceChanges = (reason: string, note?: string) => ({
  remoteChanges: {
    absence_reason: reason,
    absence_note: note ?? null,
    status: "absent",
  } as Record<string, unknown>,
  localChanges: {
    absenceReason: reason,
    absenceNote: note ?? null,
    status: "absent",
  } as Partial<Appointment>,
});

const isRangeContainingDate = (range: ScheduleRange, date: Date) => {
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  return date >= start && date <= end;
};

const filterAppointmentsForDate = (appointments: Appointment[], date: Date) =>
  appointments.filter((appointment) => isSameDay(new Date(appointment.startAt), date));

const filterAppointmentsByRange = (
  appointments: Appointment[],
  range: ScheduleRange
) => {
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  return appointments.filter((appointment) => {
    const when = new Date(appointment.startAt);
    return when >= start && when <= end;
  });
};

const mergeAppointments = (
  base: Appointment[],
  extras: Appointment[]
) => {
  const map = new Map<string, Appointment>();
  base.forEach((appointment) => map.set(appointment.id, appointment));
  extras.forEach((appointment) => {
    if (!map.has(appointment.id)) {
      map.set(appointment.id, appointment);
    }
  });
  return Array.from(map.values());
};

const toStringValue = (value: unknown) =>
  typeof value === "string" ? value : null;

const toNumberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const applyPendingActionsToAppointments = (
  appointments: Appointment[],
  pendingActions: PendingScheduleAction[]
) => {
  if (!pendingActions.length) return appointments;
  const actionsByAppointment = new Map<string, PendingScheduleAction[]>();

  pendingActions.forEach((action) => {
    const list = actionsByAppointment.get(action.appointmentId) ?? [];
    list.push(action);
    actionsByAppointment.set(action.appointmentId, list);
  });

  return appointments.map((appointment) => {
    const actions = actionsByAppointment.get(appointment.id);
    if (!actions?.length) return appointment;

    const sorted = [...actions].sort((a, b) => a.createdAt - b.createdAt);
    const next = sorted.reduce<Appointment>((current, action) => {
      const changes = action.changes ?? {};
      if (action.actionType === "checkIn") {
        return {
          ...current,
          status:
            (toStringValue(changes.status) as Appointment["status"]) ??
            "in_progress",
          checkInAt: toStringValue(changes.check_in_at) ?? current.checkInAt,
          checkInLat:
            toNumberValue(changes.check_in_lat) ?? current.checkInLat ?? null,
          checkInLng:
            toNumberValue(changes.check_in_lng) ?? current.checkInLng ?? null,
          checkInAccuracyM:
            toNumberValue(changes.check_in_accuracy_m) ??
            current.checkInAccuracyM ??
            null,
        };
      }
      if (action.actionType === "checkOut") {
        const hasNotes = Object.prototype.hasOwnProperty.call(changes, "notes");
        return {
          ...current,
          status:
            (toStringValue(changes.status) as Appointment["status"]) ?? "done",
          checkOutAt: toStringValue(changes.check_out_at) ?? current.checkOutAt,
          checkOutLat:
            toNumberValue(changes.check_out_lat) ?? current.checkOutLat ?? null,
          checkOutLng:
            toNumberValue(changes.check_out_lng) ?? current.checkOutLng ?? null,
          checkOutAccuracyM:
            toNumberValue(changes.check_out_accuracy_m) ??
            current.checkOutAccuracyM ??
            null,
          notes: hasNotes ? toStringValue(changes.notes) : current.notes ?? null,
          oportunidades: Array.isArray(changes.oportunidades)
            ? (changes.oportunidades as string[])
            : current.oportunidades,
        };
      }
      return {
        ...current,
        status:
          (toStringValue(changes.status) as Appointment["status"]) ?? "absent",
        absenceReason:
          toStringValue(changes.absence_reason) ?? current.absenceReason,
        absenceNote: toStringValue(changes.absence_note) ?? current.absenceNote,
      };
    }, appointment);

    return {
      ...next,
      pendingSync: true,
    };
  });
};

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scheduleReducer, initialState);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { user, loading: authLoading } = useAuth();
  const userEmail = user?.email?.trim() ?? null;

  const loadSchedule = useCallback(
    async (range: ScheduleRange, activeRef: { active: boolean }) => {
      if (!userEmail) {
        dispatch({
          type: "error",
          payload: t("ui.email_do_usuario_nao_encontrado"),
        });
        return;
      }
      dispatch({ type: "set_loading" });
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const [
          todayCache,
          companiesCache,
          pendingAppointments,
          pendingActions,
          scheduleSnapshot,
        ] = await Promise.all([
          getTodayAppointments(userEmail),
          getCompaniesSnapshot(userEmail),
          listPendingAppointments(userEmail),
          listPendingActions(userEmail),
          getScheduleSnapshot(userEmail, range),
        ]);
        if (!activeRef.active) return;

        const snapshotAppointments = scheduleSnapshot?.appointments ?? [];
        const snapshotCompanies = scheduleSnapshot?.companies ?? [];
        const baseAppointments = snapshotAppointments.length
          ? mergeAppointments(
              snapshotAppointments,
              todayCache?.appointments ?? []
            )
          : todayCache?.appointments ?? [];
        const baseCompanies = snapshotCompanies.length
          ? snapshotCompanies
          : companiesCache?.companies ?? [];

        const today = new Date();
        const pendingInRange = scheduleSnapshot
          ? filterAppointmentsByRange(
              pendingAppointments,
              scheduleSnapshot.range
            )
          : filterAppointmentsForDate(pendingAppointments, today);
        const mergedAppointments = mergeAppointments(
          baseAppointments,
          pendingInRange
        );
        const appointmentsWithPending = applyPendingActionsToAppointments(
          mergedAppointments,
          pendingActions
        );

        if (!appointmentsWithPending.length && !baseCompanies.length) {
          dispatch({
            type: "error",
            payload: t("ui.sem_conexao_e_sem_cache_local"),
          });
          return;
        }

        dispatch({
          type: "init",
          payload: {
            appointments: appointmentsWithPending,
            companies: baseCompanies,
          },
        });
        return;
      }
      try {
        const companiesPromise = supabase
          .from("companies")
          .select(COMPANY_SELECT)
          .eq("email_csa", userEmail)
          .order("name", { ascending: true });

        let appointmentsQuery = supabase
          .from("apontamentos")
          .select(`${APPOINTMENT_SELECT}, companies(name)`)
          .gte("starts_at", range.startAt)
          .lte("starts_at", range.endAt)
          .order("starts_at", { ascending: true });

        appointmentsQuery = appointmentsQuery.eq("consultant_name", userEmail);

        const [companiesResult, appointmentsResult] = await Promise.all([
          companiesPromise,
          appointmentsQuery,
        ]);

        if (!activeRef.active) return;

        if (companiesResult.error) {
          throw new Error(companiesResult.error.message);
        }
        if (appointmentsResult.error) {
          throw new Error(appointmentsResult.error.message);
        }

        const companies = (companiesResult.data ?? []).map(mapCompany);
        const appointments = (appointmentsResult.data ?? []).map(mapAppointment);
        const pendingAppointments = await listPendingAppointments(userEmail);
        const pendingInRange = filterAppointmentsByRange(
          pendingAppointments,
          range
        );
        const mergedAppointments = mergeAppointments(
          appointments,
          pendingInRange
        );
        const pendingActions = await listPendingActions(userEmail);
        const appointmentsWithPending = applyPendingActionsToAppointments(
          mergedAppointments,
          pendingActions
        );

        dispatch({
          type: "init",
          payload: { appointments: appointmentsWithPending, companies },
        });
        await saveScheduleSnapshot(
          userEmail,
          range,
          appointmentsWithPending,
          companies
        );
        await saveCompaniesSnapshot(userEmail, companies);

        const today = new Date();
        if (isRangeContainingDate(range, today)) {
          const todayAppointments = filterAppointmentsForDate(
            appointmentsWithPending,
            today
          );
          await saveTodayAppointments(userEmail, todayAppointments);
        }
      } catch (error) {
        console.error(error);
        if (!activeRef.active) return;
        dispatch({
          type: "error",
          payload: t("ui.nao_foi_possivel_carregar_o_cronograma"),
        });
      }
    },
    [supabase, userEmail]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      dispatch({ type: "reset" });
      return;
    }
    if (!state.range) return;
    const activeRef = { active: true };
    void loadSchedule(state.range, activeRef);
    return () => {
      activeRef.active = false;
    };
  }, [authLoading, loadSchedule, state.range, user]);

  const runUpdate = useCallback(
    async (id: string, updatePromise: () => Promise<Appointment | null>) => {
      dispatch({ type: "set_busy", payload: { id, busy: true } });
      try {
        return await updatePromise();
      } finally {
        dispatch({ type: "set_busy", payload: { id, busy: false } });
      }
    },
    []
  );

  const persistSnapshot = useCallback(
    (appointments: Appointment[], companies: ScheduleState["companies"]) => {
      if (!userEmail || !state.range) return;
      void saveScheduleSnapshot(userEmail, state.range, appointments, companies);
      void saveCompaniesSnapshot(userEmail, companies);
      const today = new Date();
      if (isRangeContainingDate(state.range, today)) {
        const todayAppointments = filterAppointmentsForDate(appointments, today);
        void saveTodayAppointments(userEmail, todayAppointments);
      }
    },
    [state.range, userEmail]
  );

  const applyLocalUpdate = useCallback(
    (id: string, changes: Partial<Appointment>) => {
      const nextAppointments = state.appointments.map((appointment) =>
        appointment.id === id ? { ...appointment, ...changes } : appointment
      );
      dispatch({ type: "update", payload: { id, changes } });
      persistSnapshot(nextAppointments, state.companies);
      return nextAppointments;
    },
    [persistSnapshot, state.appointments, state.companies]
  );

  const actions = useMemo<ScheduleContextValue["actions"]>(
    () => ({
      setRange: (range: { startAt: Date; endAt: Date }) => {
        const start = new Date(range.startAt);
        start.setHours(0, 0, 0, 0);
        const end = new Date(range.endAt);
        end.setHours(23, 59, 59, 999);
        dispatch({
          type: "set_range",
          payload: {
            startAt: start.toISOString(),
            endAt: end.toISOString(),
          },
        });
      },
      refresh: async () => {
        if (!state.range || !userEmail) return;
        const activeRef = { active: true };
        await loadSchedule(state.range, activeRef);
      },
      checkIn: async (
        id: string,
        payload: { at: string; lat?: number | null; lng?: number | null; accuracy?: number | null }
      ) =>
        runUpdate(id, async () => {
          const base =
            state.appointments.find((appointment) => appointment.id === id) ?? null;
          const { localChanges } = buildCheckInChanges(payload);
          const updatedLocal = base ? { ...base, ...localChanges } : null;
          applyLocalUpdate(id, localChanges);
          return updatedLocal;
        }),
      checkOut: async (
        id: string,
        payload: {
          at: string;
          lat?: number | null;
          lng?: number | null;
          accuracy?: number | null;
          oportunidades: string[];
          notes?: string | null;
        }
      ) =>
        runUpdate(id, async () => {
          const base =
            state.appointments.find((appointment) => appointment.id === id) ?? null;
          const { localChanges } = buildCheckOutChanges(payload);
          const updatedLocal = base ? { ...base, ...localChanges } : null;
          applyLocalUpdate(id, localChanges);
          return updatedLocal;
        }),
      justifyAbsence: async (id: string, reason: string, note?: string) =>
        runUpdate(id, async () => {
          const base =
            state.appointments.find((appointment) => appointment.id === id) ?? null;
          const { localChanges } = buildAbsenceChanges(reason, note);
          const updatedLocal = base ? { ...base, ...localChanges } : null;
          applyLocalUpdate(id, localChanges);
          return updatedLocal;
        }),
      setPendingSync: (id: string, pending: boolean) => {
        applyLocalUpdate(id, { pendingSync: pending });
      },
    }),
    [
      applyLocalUpdate,
      loadSchedule,
      runUpdate,
      state.appointments,
      state.range,
      userEmail,
    ]
  );

  const selectors = useMemo<ScheduleContextValue["selectors"]>(
    () => ({
      getCompany: (companyId: string) =>
        state.companies.find((company) => company.id === companyId),
      getAppointment: (id: string) =>
        state.appointments.find((appointment) => appointment.id === id),
    }),
    [state.appointments, state.companies]
  );

  const value = useMemo(
    () => ({ state, actions, selectors }),
    [actions, selectors, state]
  );

  return (
    <ScheduleContext.Provider value={value}>
      {children}
    </ScheduleContext.Provider>
  );
}
