import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { t } from "../i18n";
import { useAuth } from "../contexts/useAuth";
import {
  addDays,
  formatDateShort,
  isSameDay,
  startOfWeekMonday,
} from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentTitle,
  isBlocked,
  isPending,
  isSuggested,
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
  const { state, selectors, actions } = useSchedule();
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const startAt = startOfWeekMonday(today);
    const endAt = addDays(startAt, 6);
    actions.setRange({ startAt, endAt });
  }, [actions, today]);

  const todayAppointments = useMemo(() => {
    return state.appointments
      .filter((appointment) => isSameDay(new Date(appointment.startAt), now))
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

  const focusAppointment = activeAppointment ?? nextPendingAppointment;

  const actionState = useMemo(() => {
    const nowMs = now.getTime();

    if (activeAppointment) {
      const startedAt = new Date(
        activeAppointment.checkInAt ?? activeAppointment.startAt,
      ).getTime();
      const elapsed = nowMs - startedAt;
      return {
        message: t("ui.home_in_appointment_since"),
        timer: formatDuration(elapsed),
      };
    }

    if (nextPendingAppointment) {
      const startMs = new Date(nextPendingAppointment.startAt).getTime();
      const endMs = new Date(nextPendingAppointment.endAt).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        if (nowMs >= startMs && nowMs <= endMs) {
          return {
            message: t("ui.home_next_appointment_late_by_label"),
            timer: formatDuration(nowMs - startMs),
          };
        }
        if (nowMs < startMs) {
          return {
            message: t("ui.home_next_appointment_in_label"),
            timer: formatDuration(startMs - nowMs),
          };
        }
      }
    }

    return {
      message: t("ui.home_no_more_appointments_today"),
      timer: null,
    };
  }, [activeAppointment, nextPendingAppointment, now]);

  const daySummary = useMemo(() => {
    return todayAppointments.reduce(
      (acc, appointment) => {
        acc[getAppointmentStatus(appointment)] += 1;
        return acc;
      },
      {
        total: todayAppointments.length,
        agendado: 0,
        expirado: 0,
        em_execucao: 0,
        concluido: 0,
        cancelado: 0,
      },
    );
  }, [todayAppointments]);
  const completedCount = daySummary.concluido;
  const scheduledCount = daySummary.agendado;
  const inProgressCount = daySummary.em_execucao;
  const totalCount = completedCount + scheduledCount + inProgressCount;
  const canceledCount = daySummary.cancelado;
  const lateCount = useMemo(() => {
    const nowMs = now.getTime();
    return todayAppointments.filter((appointment) => {
      if (getAppointmentStatus(appointment) !== "agendado") return false;
      const endMs = new Date(appointment.endAt).getTime();
      if (Number.isNaN(endMs)) return false;
      return endMs < nowMs;
    }).length;
  }, [now, todayAppointments]);
  const suggestedCount = useMemo(
    () =>
      todayAppointments.filter((appointment) =>
        isSuggested(appointment, user?.email),
      ).length,
    [todayAppointments, user?.email],
  );

  return (
    <AppShell title={t("ui.home")}>
      <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
        <p className="text-base font-semibold text-foreground">
          {actionState.message}
        </p>
        {actionState.timer ? (
          <div className="mt-4 w-full rounded-2xl border border-border bg-foreground px-4 py-4 text-center shadow-sm">
            <p className="text-3xl font-semibold font-mono tracking-[0.35em] text-white sm:text-4xl">
              {actionState.timer}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {focusAppointment ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white">
              {t("ui.sua_proxima_visita")}
            </p>
            <AppointmentCard
              appointment={focusAppointment}
              companyName={
                focusAppointment.companyName ??
                selectors.getCompany(focusAppointment.companyId)?.name ??
                t("ui.empresa")
              }
              blocked={isBlocked(focusAppointment, todayAppointments)}
              headerLabel={`${formatDateShort(
                new Date(focusAppointment.startAt),
              )} - ${formatAppointmentWindow(focusAppointment)}`}
              detailLabel={getAppointmentTitle(focusAppointment)}
              onClick={() => navigate(`/apontamentos/${focusAppointment.id}`)}
            />
          </div>
        ) : null}
        <section className="space-y-3">
          <div className="space-y-4 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <div>
              <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                <span>{t("ui.visitas_realizadas")}</span>
                <span>
                  {t("ui.visitas_realizadas_count", {
                    done: completedCount,
                    total: totalCount,
                  })}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-foreground-muted">
                <span>{t("ui.visitas_atrasadas")}</span>
                <span>{lateCount}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-foreground-muted">
                <span>{t("ui.visitas_canceladas")}</span>
                <span>{canceledCount}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-foreground-muted">
                <span>{t("ui.visitas_sugeridas")}</span>
                <span>{suggestedCount}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/calendario/dia")}
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted"
          >
            {t("ui.ir_para_lista_do_dia")}
          </button>
        </section>

      </div>
    </AppShell>
  );
}
