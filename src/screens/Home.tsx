import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { EmptyState } from "../components/EmptyState";
import { StatusFilters } from "../components/StatusFilters";
import { t } from "../i18n";
import { useAuth } from "../contexts/useAuth";
import { isSameDay, formatDateShort } from "../lib/date";
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
  const { state, selectors } = useSchedule();
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const [statusFilters, setStatusFilters] = useState<
    ReturnType<typeof getAppointmentStatus>[]
  >(() => ["agendado"]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  const showCreateButton = todayAppointments.length === 0;
  const todayLabel = formatDateShort(now);
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
  const suggestionCount = useMemo(
    () =>
      todayAppointments.filter((appointment) =>
        isSuggested(appointment, user?.email),
      ).length,
    [todayAppointments, user?.email],
  );
  const filteredAppointments = useMemo(() => {
    if (statusFilters.length === 0 && !showSuggestions) return [];
    return todayAppointments.filter((appointment) => {
      const matchesStatus = statusFilters.includes(
        getAppointmentStatus(appointment),
      );
      const matchesSuggestion =
        showSuggestions && isSuggested(appointment, user?.email);
      return matchesStatus || matchesSuggestion;
    });
  }, [showSuggestions, statusFilters, todayAppointments, user?.email]);
  const hasDayAppointments = todayAppointments.length > 0;

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
            onClick={() =>
              navigate(`/apontamentos/${focusAppointment.id}`)
            }
          />
        ) : null}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                {t("ui.seus_outros_agendamentos_de_hoje")}
              </p>
              <p className="text-xs text-white/70">
                {t("ui.agendamentos_label_count", {
                  label: todayLabel,
                  count: todayAppointments.length,
                })}
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t("ui.filtros_do_dia")}
                </p>
                <p className="text-xs text-foreground-muted">
                  {t("ui.status_e_sugestoes")}
                </p>
              </div>
              <span className="text-xs font-semibold text-foreground-muted">
                {t("ui.ag_count", {
                  count: filteredAppointments.length,
                })}
              </span>
            </div>
            <StatusFilters
              summary={daySummary}
              statusFilters={statusFilters}
              onChange={setStatusFilters}
              showSuggestions={showSuggestions}
              onToggleSuggestions={() =>
                setShowSuggestions((current) => !current)
              }
              suggestionCount={suggestionCount}
              className="grid grid-cols-3 gap-2 text-[11px] font-semibold"
            />
          </div>

          <div className="space-y-3">
            {filteredAppointments.length ? (
              filteredAppointments.map((appointment, index) => {
                const company =
                  appointment.companyName ??
                  selectors.getCompany(appointment.companyId)?.name ??
                  t("ui.empresa");
                const appointmentDetail = getAppointmentTitle(appointment);
                const snapshot = appointment.addressSnapshot;
                const detailLabel = snapshot
                  ? `${appointmentDetail} - ${snapshot}`
                  : appointmentDetail;
                const blocked = isBlocked(appointment, todayAppointments);
                return (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    companyName={company}
                    blocked={blocked}
                    headerLabel={`#${index + 1} - ${formatAppointmentWindow(
                      appointment,
                    )}`}
                    detailLabel={detailLabel}
                    onClick={() => navigate(`/apontamentos/${appointment.id}`)}
                  />
                );
              })
            ) : (
              <EmptyState
                title={
                  !hasDayAppointments
                    ? t("ui.nao_ha_apontamentos_hoje")
                    : t("ui.sem_agendamentos")
                }
                description={
                  !hasDayAppointments
                    ? t("ui.sem_apontamentos")
                    : statusFilters.length === 0
                      ? t(
                          "ui.nenhum_filtro_ativo_ligue_ao_menos_um_status_acima",
                        )
                      : t(
                          "ui.nenhum_agendamento_encontrado_para_os_filtros_ativos",
                        )
                }
              />
            )}
          </div>
        </section>

        {showCreateButton ? (
          <button
            type="button"
            onClick={() => navigate("/apontamentos/novo")}
            className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-foreground/90"
          >
            {t("ui.novo_apontamento")}
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}
