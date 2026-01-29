import { useContext } from "react";
import { ScheduleContext, type ScheduleContextValue } from "./ScheduleContext";

export const useSchedule = (): ScheduleContextValue => {
  const context = useContext(ScheduleContext);
  if (!context) {
    throw new Error("useSchedule must be used inside ScheduleProvider");
  }
  return context;
};
