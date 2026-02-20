import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { t } from "../i18n";
import { isSameDay } from "../lib/date";
import {
  getAppointmentStatus,
  isPending,
  sortByStart,
} from "../lib/schedule";
import { useSchedule } from "../state/useSchedule";

const formatDuration = (valueMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export default function Home() {
  const { state } = useSchedule();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const todayAppointments = useMemo(() => {
    return state.appointments
      .filter((appointment) =>
        isSameDay(new Date(appointment.startAt), now),
      )
      .sort(sortByStart);
  }, [now, state.appointments]);

  const activeAppointment = useMemo(
    () =>
      todayAppointments.find(
        (appointment) => getAppointmentStatus(appointment) === "em_execucao",
      ),
    [todayAppointments],
  );

  const nextPendingAppointment = useMemo(() => {
    const nowMs = now.getTime();
    return todayAppointments.find((appointment) => {
      if (!isPending(appointment)) return false;
      const endMs = new Date(appointment.endAt).getTime();
      if (Number.isNaN(endMs)) return false;
      return endMs >= nowMs;
    });
  }, [now, todayAppointments]);

  const actionMessage = useMemo(() => {
    const nowMs = now.getTime();

    if (activeAppointment) {
      const startedAt = new Date(
        activeAppointment.checkInAt ?? activeAppointment.startAt,
      ).getTime();
      const elapsed = nowMs - startedAt;
      return t("ui.home_in_appointment_for", {
        time: formatDuration(elapsed),
      });
    }

    if (nextPendingAppointment) {
      const startMs = new Date(nextPendingAppointment.startAt).getTime();
      const endMs = new Date(nextPendingAppointment.endAt).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        if (nowMs >= startMs && nowMs <= endMs) {
          return t("ui.home_next_appointment_late_by", {
            time: formatDuration(nowMs - startMs),
          });
        }
        if (nowMs < startMs) {
          return t("ui.home_next_appointment_in", {
            time: formatDuration(startMs - nowMs),
          });
        }
      }
    }

    return t("ui.home_no_more_appointments_today");
  }, [activeAppointment, nextPendingAppointment, now]);

  return (
    <AppShell title={t("ui.home")}>
      <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
        <p className="text-base font-semibold text-foreground">
          {actionMessage}
        </p>
      </div>
    </AppShell>
  );
}
