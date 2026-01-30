import { createContext } from "react";
import type { Appointment, Company } from "../lib/types";

export type ScheduleRange = {
  startAt: string;
  endAt: string;
};

export type ScheduleState = {
  appointments: Appointment[];
  companies: Company[];
  loading: boolean;
  error: string | null;
  busyIds: string[];
  range: ScheduleRange | null;
};

export type ScheduleContextValue = {
  state: ScheduleState;
  actions: {
    setRange: (range: { startAt: Date; endAt: Date }) => void;
    refresh: () => Promise<void>;
    checkIn: (
      id: string,
      payload: { at: string; lat: number; lng: number; accuracy: number }
    ) => Promise<Appointment | null>;
    checkOut: (
      id: string,
      payload: {
        at: string;
        lat: number;
        lng: number;
        accuracy: number;
        oportunidades: string[];
      }
    ) => Promise<Appointment | null>;
    justifyAbsence: (
      id: string,
      reason: string,
      note?: string
    ) => Promise<Appointment | null>;
  };
  selectors: {
    getCompany: (companyId: string) => Company | undefined;
    getAppointment: (id: string) => Appointment | undefined;
  };
};

export const ScheduleContext = createContext<ScheduleContextValue | null>(null);
