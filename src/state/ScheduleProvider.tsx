import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Appointment } from "../lib/types";
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

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scheduleReducer, initialState);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { user, loading: authLoading } = useAuth();

  const loadSchedule = useCallback(
    async (range: ScheduleRange, activeRef: { active: boolean }) => {
      if (!user) return;
      const userEmail = user.email?.trim();
      if (!userEmail) {
        dispatch({
          type: "error",
          payload: "Email do usuario nao encontrado.",
        });
        return;
      }
      dispatch({ type: "set_loading" });
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

        dispatch({ type: "init", payload: { appointments, companies } });
      } catch (error) {
        console.error(error);
        if (!activeRef.active) return;
        dispatch({
          type: "error",
          payload: "Nao foi possivel carregar o cronograma.",
        });
      }
    },
    [supabase, user]
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

  const updateAppointment = useCallback(
    async (id: string, changes: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from("apontamentos")
        .update(changes)
        .eq("id", id)
        .select(APPOINTMENT_SELECT)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data ? mapAppointment(data) : null;
    },
    [supabase]
  );

  const runUpdate = useCallback(
    async (id: string, updatePromise: () => Promise<Appointment | null>) => {
      dispatch({ type: "set_busy", payload: { id, busy: true } });
      try {
        const updated = await updatePromise();
        if (updated) {
          dispatch({ type: "update", payload: { id, changes: updated } });
        }
        return updated;
      } finally {
        dispatch({ type: "set_busy", payload: { id, busy: false } });
      }
    },
    []
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
        if (!state.range || !user?.email) return;
        const activeRef = { active: true };
        await loadSchedule(state.range, activeRef);
      },
      checkIn: async (
        id: string,
        payload: { at: string; lat: number; lng: number; accuracy: number }
      ) =>
        runUpdate(id, () =>
          updateAppointment(id, {
            check_in_at: payload.at,
            check_in_lat: payload.lat,
            check_in_lng: payload.lng,
            check_in_accuracy_m: payload.accuracy,
            status: "in_progress",
          })
        ),
      checkOut: async (
        id: string,
        payload: {
          at: string;
          lat: number;
          lng: number;
          accuracy: number;
          oportunidades: string[];
        }
      ) =>
        runUpdate(id, () =>
          updateAppointment(id, {
            check_out_at: payload.at,
            check_out_lat: payload.lat,
            check_out_lng: payload.lng,
            check_out_accuracy_m: payload.accuracy,
            status: "done",
            oportunidades: payload.oportunidades,
          })
        ),
      justifyAbsence: async (id: string, reason: string, note?: string) =>
        runUpdate(id, () =>
          updateAppointment(id, {
            absence_reason: reason,
            absence_note: note ?? null,
            status: "absent",
          })
        ),
    }),
    [loadSchedule, runUpdate, state.range, updateAppointment, user]
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
