import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusFilters } from "../components/StatusFilters";
import { useAuth } from "../contexts/useAuth";
import { buildMonthWeeks, formatDateShort, formatMonthYear } from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentTitle,
  isBlocked,
  isSuggested,
  sortByStart,
} from "../lib/schedule";
import type { Appointment, AppointmentStatus } from "../lib/types";
import { useSchedule } from "../state/useSchedule";
import { t } from "../i18n";

const buildDayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const buildDayGroups = (appointments: Appointment[]) => {
  const groups = new Map<string, Appointment[]>();
  appointments.forEach((appointment) => {
    const key = buildDayKey(new Date(appointment.startAt));
    const list = groups.get(key) ?? [];
    list.push(appointment);
    groups.set(key, list);
  });
  groups.forEach((list) => list.sort(sortByStart));
  return groups;
};

export default function AllAppointments() {
  const { state, selectors, actions } = useSchedule();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(
    () => ["em_execucao", "agendado"],
  );
  const [showSuggestions, setShowSuggestions] = useState(false);

  const weeks = useMemo(() => buildMonthWeeks(new Date()), []);
  const monthRange = useMemo(() => {
    const startAt = weeks[0]?.startAt ?? new Date();
    const endAt = weeks[weeks.length - 1]?.endAt ?? new Date();
    return { startAt, endAt };
  }, [weeks]);

  useEffect(() => {
    actions.setRange({ startAt: monthRange.startAt, endAt: monthRange.endAt });
  }, [actions, monthRange.endAt, monthRange.startAt]);

  const orderedAppointments = useMemo(
    () => [...state.appointments].sort(sortByStart),
    [state.appointments],
  );
  const dayGroups = useMemo(
    () => buildDayGroups(state.appointments),
    [state.appointments],
  );

  const summary = useMemo(() => {
    return state.appointments.reduce(
      (acc, appointment) => {
        acc[getAppointmentStatus(appointment)] += 1;
        return acc;
      },
      {
        total: state.appointments.length,
        agendado: 0,
        expirado: 0,
        em_execucao: 0,
        concluido: 0,
        cancelado: 0,
      },
    );
  }, [state.appointments]);

  const suggestionCount = useMemo(
    () =>
      orderedAppointments.filter((appointment) =>
        isSuggested(appointment, user?.email),
      ).length,
    [orderedAppointments, user?.email],
  );

  const filteredAppointments = useMemo(() => {
    if (statusFilters.length === 0 && !showSuggestions) return [];
    return orderedAppointments.filter((appointment) => {
      const matchesStatus = statusFilters.includes(
        getAppointmentStatus(appointment),
      );
      const matchesSuggestion =
        showSuggestions && isSuggested(appointment, user?.email);
      return matchesStatus || matchesSuggestion;
    });
  }, [orderedAppointments, showSuggestions, statusFilters, user?.email]);

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  return (
    <AppShell
      title={t("ui.agenda")}
      subtitle={t(
        "ui.todos_os_agendamentos_em_sequencia_unica_sem_agrupamento_por_data",
      )}
      rightSlot={formatMonthYear(new Date())}
    >
      <div className="space-y-4">
        {state.loading ? (
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          </div>
        ) : state.error ? (
          <EmptyState
            title={t("ui.nao_foi_possivel_carregar")}
            description={state.error}
          />
        ) : (
          <div className="space-y-4">
            <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
              <SectionHeader
                title={t("ui.resumo_geral")}
                subtitle={t("ui.distribuicao_por_status")}
                rightSlot={t("ui.ag_count", { count: summary.total })}
              />
              <StatusFilters
                summary={summary}
                statusFilters={statusFilters}
                onChange={setStatusFilters}
                showSuggestions={showSuggestions}
                onToggleSuggestions={() =>
                  setShowSuggestions((current) => !current)
                }
                suggestionCount={suggestionCount}
                className="grid grid-cols-3 gap-2 text-[11px] font-semibold"
              />
            </section>

            <section className="space-y-3">
              {filteredAppointments.length ? (
                filteredAppointments.map((appointment) => {
                  const company = selectors.getCompany(appointment.companyId);
                  const companyName =
                    appointment.companyName ?? company?.name ?? t("ui.empresa");
                  const appointmentDetail = getAppointmentTitle(appointment);
                  const snapshot = appointment.addressSnapshot;
                  const detailLabel = snapshot
                    ? `${appointmentDetail} - ${snapshot}`
                    : appointmentDetail;
                  const dayLabel = formatDateShort(
                    new Date(appointment.startAt),
                  );
                  const key = buildDayKey(new Date(appointment.startAt));
                  const dayAppointments = dayGroups.get(key) ?? [];
                  const blocked = isBlocked(appointment, dayAppointments);
                  const isSuggestion = isSuggested(appointment, user?.email);

                  return (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      companyName={companyName}
                      headerLabel={`${dayLabel} - ${formatAppointmentWindow(
                        appointment,
                      )}`}
                      detailLabel={detailLabel}
                      blocked={blocked}
                      highlight={isSuggestion}
                      onClick={() => handleOpenAppointment(appointment.id)}
                    />
                  );
                })
              ) : (
                <EmptyState
                  title={t("ui.sem_agendamentos")}
                  description={
                    statusFilters.length === 0 && !showSuggestions
                      ? t("ui.nenhum_filtro_ativo_ligue_ao_menos_um_status_acima")
                      : t(
                          "ui.nenhum_agendamento_encontrado_para_os_filtros_ativos",
                        )
                  }
                />
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
