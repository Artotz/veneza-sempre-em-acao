import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Appointment, Company } from "../lib/types";
import {
  fetchSchedule,
  mockAbsence,
  mockCheckIn,
  mockCheckOut,
} from "../mock/schedule";

type ScheduleState = {
  appointments: Appointment[];
  companies: Company[];
  loading: boolean;
  error: string | null;
  busyIds: string[];
};

type ScheduleAction =
  | {
      type: "init";
      payload: { appointments: Appointment[]; companies: Company[] };
    }
  | { type: "error"; payload: string }
  | { type: "set_busy"; payload: { id: string; busy: boolean } }
  | { type: "update"; payload: { id: string; changes: Partial<Appointment> } };

const initialState: ScheduleState = {
  appointments: [],
  companies: [],
  loading: true,
  error: null,
  busyIds: [],
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
    default:
      return state;
  }
};

type ScheduleContextValue = {
  state: ScheduleState;
  actions: {
    checkIn: (id: string) => Promise<void>;
    checkOut: (id: string) => Promise<void>;
    justifyAbsence: (id: string, reason: string) => Promise<void>;
  };
  selectors: {
    getCompany: (companyId: string) => Company | undefined;
    getAppointment: (id: string) => Appointment | undefined;
  };
};

const ScheduleContext = createContext<ScheduleContextValue | null>(null);

export const ScheduleProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(scheduleReducer, initialState);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await fetchSchedule();
        if (!mounted) return;
        dispatch({ type: "init", payload: data });
      } catch (error) {
        console.error(error);
        if (!mounted) return;
        dispatch({
          type: "error",
          payload: "Nao foi possivel carregar o cronograma.",
        });
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const runUpdate = useCallback(
    async (id: string, updatePromise: () => Promise<Partial<Appointment>>) => {
      dispatch({ type: "set_busy", payload: { id, busy: true } });
      try {
        const changes = await updatePromise();
        dispatch({ type: "update", payload: { id, changes } });
      } finally {
        dispatch({ type: "set_busy", payload: { id, busy: false } });
      }
    },
    []
  );

  const actions = useMemo(
    () => ({
      checkIn: async (id: string) => {
        await runUpdate(id, () => mockCheckIn());
      },
      checkOut: async (id: string) => {
        await runUpdate(id, () => mockCheckOut());
      },
      justifyAbsence: async (id: string, reason: string) => {
        await runUpdate(id, () => mockAbsence(reason));
      },
    }),
    [runUpdate]
  );

  const selectors = useMemo(
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
    [state, actions, selectors]
  );

  return (
    <ScheduleContext.Provider value={value}>
      {children}
    </ScheduleContext.Provider>
  );
};

export const useSchedule = () => {
  const context = useContext(ScheduleContext);
  if (!context) {
    throw new Error("useSchedule must be used inside ScheduleProvider");
  }
  return context;
};
