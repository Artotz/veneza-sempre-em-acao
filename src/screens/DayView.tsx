import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { CalendarTabs } from "../components/CalendarTabs";
import { CheckInOutMap } from "../components/CheckInOutMap";
import { DateSelector } from "../components/DateSelector";
import { DetailsMapTabs } from "../components/DetailsMapTabs";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusFilters } from "../components/StatusFilters";
import { useAuth } from "../contexts/useAuth";
import {
  buildMonthOptions,
  buildMonthWeeks,
  formatMonthParam,
  formatMonthYear,
  getDayIndexMonday,
  isSameDay,
  parseMonthParam,
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
import type { AppointmentStatus } from "../lib/types";
import { useSchedule } from "../state/useSchedule";
import { t } from "../i18n";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export default function DayView() {
  const { state, selectors, actions } = useSchedule();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const today = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const monthParam = parseMonthParam(searchParams.get("month"));
    const baseDate = monthParam ?? today;
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  });
  const monthOptions = useMemo(
    () => buildMonthOptions(selectedMonth),
    [selectedMonth],
  );
  const selectedMonthIndex = useMemo(() => {
    const selectedId = formatMonthParam(selectedMonth);
    const index = monthOptions.findIndex((option) => option.id === selectedId);
    return index === -1 ? 0 : index;
  }, [monthOptions, selectedMonth]);
  const weeks = useMemo(() => buildMonthWeeks(selectedMonth), [selectedMonth]);
  const fallbackWeekIndex = useMemo(() => {
    if (
      today.getFullYear() !== selectedMonth.getFullYear() ||
      today.getMonth() !== selectedMonth.getMonth()
    ) {
      return 0;
    }
    return Math.max(
      0,
      weeks.findIndex((week) => today >= week.startAt && today <= week.endAt),
    );
  }, [selectedMonth, today, weeks]);

  const [selectedWeekIndex, setSelectedWeekIndex] = useState(fallbackWeekIndex);
  const [selectedDayIndex, setSelectedDayIndex] = useState(
    getDayIndexMonday(today),
  );
  const [activeTab, setActiveTab] = useState<"details" | "map">("details");
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(
    () => ["em_execucao", "agendado"],
  );
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const monthParam = parseMonthParam(searchParams.get("month"));
    if (monthParam) {
      setSelectedMonth(monthParam);
      return;
    }
    setSelectedMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }, [searchParams, today]);

  useEffect(() => {
    const weekParamText = searchParams.get("week");
    if (weekParamText !== null) {
      const weekParam = Number(weekParamText);
      if (!Number.isNaN(weekParam)) {
        setSelectedWeekIndex(clamp(weekParam - 1, 0, weeks.length - 1));
        return;
      }
    }
    setSelectedWeekIndex(fallbackWeekIndex);
  }, [fallbackWeekIndex, searchParams, weeks.length]);

  useEffect(() => {
    setSelectedWeekIndex((current) => clamp(current, 0, weeks.length - 1));
  }, [weeks.length]);

  useEffect(() => {
    const dayParamText = searchParams.get("day");
    if (dayParamText !== null) {
      const dayParam = Number(dayParamText);
      if (!Number.isNaN(dayParam)) {
        setSelectedDayIndex(clamp(dayParam, 0, 6));
        return;
      }
    }
    if (
      selectedMonth.getFullYear() === today.getFullYear() &&
      selectedMonth.getMonth() === today.getMonth() &&
      selectedWeekIndex === fallbackWeekIndex
    ) {
      setSelectedDayIndex(getDayIndexMonday(today));
    }
  }, [
    fallbackWeekIndex,
    searchParams,
    selectedMonth,
    selectedWeekIndex,
    today,
  ]);

  const week = weeks[selectedWeekIndex] ?? weeks[0];

  useEffect(() => {
    actions.setRange({ startAt: week.startAt, endAt: week.endAt });
  }, [actions, week.endAt, week.startAt]);

  const dayGroups = useMemo(() => {
    return week.days.map((day) => {
      const items = state.appointments.filter((appointment) =>
        isSameDay(new Date(appointment.startAt), day.date),
      );
      return items.sort(sortByStart);
    });
  }, [state.appointments, week]);

  const weekAppointments = dayGroups.flat();
  const pendingWeekCount = weekAppointments.filter((item) =>
    isPending(item),
  ).length;
  const activeDayAppointments = dayGroups[selectedDayIndex] ?? [];
  const activeDay = week.days[selectedDayIndex] ?? week.days[0];
  const isActiveDayToday = isSameDay(activeDay.date, today);
  const daySummary = useMemo(() => {
    return activeDayAppointments.reduce(
      (acc, appointment) => {
        acc[getAppointmentStatus(appointment)] += 1;
        return acc;
      },
      {
        total: activeDayAppointments.length,
        agendado: 0,
        expirado: 0,
        em_execucao: 0,
        concluido: 0,
        cancelado: 0,
      },
    );
  }, [activeDayAppointments]);
  const suggestionCount = useMemo(
    () =>
      activeDayAppointments.filter((appointment) =>
        isSuggested(appointment, user?.email),
      ).length,
    [activeDayAppointments, user?.email],
  );
  const filteredAppointments = useMemo(() => {
    if (statusFilters.length === 0 && !showSuggestions) return [];
    return activeDayAppointments.filter((appointment) => {
      const matchesStatus = statusFilters.includes(
        getAppointmentStatus(appointment),
      );
      const matchesSuggestion =
        showSuggestions && isSuggested(appointment, user?.email);
      return matchesStatus || matchesSuggestion;
    });
  }, [activeDayAppointments, showSuggestions, statusFilters, user?.email]);
  const hasDayAppointments = activeDayAppointments.length > 0;
  // const firstPendingId = getFirstPendingId(activeDayAppointments);

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  const getMapLabel = useCallback(
    (
      appointment: (typeof activeDayAppointments)[number],
      kind: "checkin" | "checkout",
    ) => {
      const companyName =
        appointment.companyName ??
        selectors.getCompany(appointment.companyId)?.name ??
        t("ui.empresa");
      return `${companyName} - ${
        kind === "checkin" ? t("ui.check_in") : t("ui.check_out")
      }`;
    },
    [selectors],
  );

  return (
    <AppShell
      title={t("ui.dia")}
      subtitle={t(
        "ui.agendamentos_do_dia_selecionado_ordenados_por_horario",
      )}
      rightSlot={formatMonthYear(selectedMonth)}
    >
      <div className="space-y-5">
        <section className="space-y-4 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <CalendarTabs />
          {/* <SectionHeader
            title={week.label}
            subtitle={formatWeekRange(week.startAt, week.endAt)}
            rightSlot={state.loading ? null : `${weekAppointments.length} ag.`}
          /> */}
          <DateSelector
            mode="day-week-month"
            months={monthOptions}
            selectedMonthIndex={selectedMonthIndex}
            onSelectMonth={(index) => {
              const nextMonth = monthOptions[index];
              if (nextMonth) {
                setSelectedMonth(nextMonth.date);
              }
            }}
            weeks={weeks}
            selectedWeekIndex={selectedWeekIndex}
            onSelectWeek={setSelectedWeekIndex}
            days={week.days}
            selectedDayIndex={selectedDayIndex}
            onSelectDay={setSelectedDayIndex}
            dayRightSlot={
              state.loading
                ? null
                : t("ui.pendentes_na_semana_count", {
                    count: pendingWeekCount,
                  })
            }
            today={today}
          />
          <DetailsMapTabs value={activeTab} onChange={setActiveTab} />
        </section>

        {state.loading ? (
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-20 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-40 animate-pulse rounded-3xl bg-surface-muted" />
          </div>
        ) : state.error ? (
          <EmptyState
            title={t("ui.nao_foi_possivel_carregar")}
            description={state.error}
          />
        ) : (
          <>
            {activeTab === "details" ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {activeDay.full}
                      </p>
                      {isActiveDayToday ? (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                          {t("ui.hoje")}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {t("ui.agendamentos_label_count", {
                        label: activeDay.label,
                        count: activeDayAppointments.length,
                      })}
                    </p>
                  </div>
                  {/* {firstPendingId ? (
                    <span className="rounded-full bg-surface-muted px-3 py-1 text-[10px] font-semibold text-foreground-muted">
                      1o pendente liberado
                    </span>
                  ) : null} */}
                </div>

                <div className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
                  <SectionHeader
                    title={t("ui.filtros_do_dia")}
                    subtitle={t("ui.status_e_sugestoes")}
                    rightSlot={t("ui.ag_count", {
                      count: filteredAppointments.length,
                    })}
                  />
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
                      const appointmentDetail =
                        getAppointmentTitle(appointment);
                      const snapshot = appointment.addressSnapshot;
                      const detailLabel = snapshot
                        ? `${appointmentDetail} - ${snapshot}`
                        : appointmentDetail;
                      const blocked = isBlocked(
                        appointment,
                        activeDayAppointments,
                      );
                      const isSuggestion = isSuggested(
                        appointment,
                        user?.email,
                      );
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
                          highlight={isSuggestion}
                          onClick={() => handleOpenAppointment(appointment.id)}
                        />
                      );
                    })
                  ) : (
                    <EmptyState
                      title={t("ui.sem_agendamentos")}
                      description={
                        !hasDayAppointments
                          ? t("ui.selecione_outro_dia_para_ver_a_agenda")
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

                {/* <div className="rounded-2xl border border-border bg-surface-muted p-3 text-xs text-foreground-muted">
                  Regra ativa: somente o primeiro agendamento pendente do dia pode
                  ser acionado. Os demais ficam bloqueados ate a conclusao ou
                  ausencia do anterior.
                </div> */}
              </section>
            ) : (
              <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
                <SectionHeader
                  title={t("ui.mapa_do_dia")}
                  subtitle={t(
                    "ui.check_ins_e_check_outs_registrados_no_dia_selecionado",
                  )}
                />
                <CheckInOutMap
                  appointments={activeDayAppointments}
                  getLabel={getMapLabel}
                  emptyMessage={t(
                    "ui.sem_check_ins_ou_check_outs_para_exibir_no_dia",
                  )}
                />
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
