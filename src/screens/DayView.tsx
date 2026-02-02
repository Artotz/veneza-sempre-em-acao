import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { CheckInOutMap } from "../components/CheckInOutMap";
import { DaySelector } from "../components/DaySelector";
import { EmptyState } from "../components/EmptyState";
import { MonthSelector } from "../components/MonthSelector";
import { SectionHeader } from "../components/SectionHeader";
import { WeekSelector } from "../components/WeekSelector";
import {
  buildMonthOptions,
  buildMonthWeeks,
  formatMonthParam,
  formatMonthYear,
  formatWeekRange,
  getDayIndexMonday,
  isSameDay,
  parseMonthParam,
} from "../lib/date";
import { getFirstPendingId, isBlocked, isPending, sortByStart } from "../lib/schedule";
import { useSchedule } from "../state/useSchedule";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export default function DayView() {
  const { state, selectors, actions } = useSchedule();
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
    [selectedMonth]
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
      weeks.findIndex((week) => today >= week.startAt && today <= week.endAt)
    );
  }, [selectedMonth, today, weeks]);

  const [selectedWeekIndex, setSelectedWeekIndex] = useState(fallbackWeekIndex);
  const [selectedDayIndex, setSelectedDayIndex] = useState(
    getDayIndexMonday(today)
  );

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
        isSameDay(new Date(appointment.startAt), day.date)
      );
      return items.sort(sortByStart);
    });
  }, [state.appointments, week]);

  const weekAppointments = dayGroups.flat();
  const pendingWeekCount = weekAppointments.filter((item) => isPending(item)).length;
  const activeDayAppointments = dayGroups[selectedDayIndex] ?? [];
  const activeDay = week.days[selectedDayIndex] ?? week.days[0];
  const firstPendingId = getFirstPendingId(activeDayAppointments);

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  const getMapLabel = useCallback(
    (appointment: (typeof activeDayAppointments)[number], kind: "checkin" | "checkout") => {
      const companyName =
        selectors.getCompany(appointment.companyId)?.name ?? "Empresa";
      return `${companyName} - ${kind === "checkin" ? "Check-in" : "Check-out"}`;
    },
    [selectors]
  );

  return (
    <AppShell
      title="Dia ativo"
      subtitle="Agendamentos do dia selecionado, ordenados por horario."
      rightSlot={formatMonthYear(selectedMonth)}
    >
      {state.loading ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-20 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-40 animate-pulse rounded-3xl bg-surface-muted" />
        </div>
      ) : state.error ? (
        <EmptyState
          title="Nao foi possivel carregar"
          description={state.error}
        />
      ) : (
        <div className="space-y-5">
          <section className="space-y-4 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader
              title={week.label}
              subtitle={formatWeekRange(week.startAt, week.endAt)}
              rightSlot={`${weekAppointments.length} ag.`}
            />
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                  Mes
                </div>
                <MonthSelector
                  months={monthOptions}
                  selectedIndex={selectedMonthIndex}
                  onSelect={(index) => {
                    const nextMonth = monthOptions[index];
                    if (nextMonth) {
                      setSelectedMonth(nextMonth.date);
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                  Semana
                </div>
                <WeekSelector
                  weeks={weeks}
                  selectedIndex={selectedWeekIndex}
                  onSelect={setSelectedWeekIndex}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                  <span>Dia</span>
                  <span className="normal-case tracking-normal text-foreground-muted">
                    Pendentes na semana: {pendingWeekCount}
                  </span>
                </div>
                <DaySelector
                  days={week.days}
                  selectedIndex={selectedDayIndex}
                  onSelect={setSelectedDayIndex}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {activeDay.full}
                </p>
                <p className="text-xs text-foreground-muted">
                  {activeDay.label} - {activeDayAppointments.length} agendamentos
                </p>
              </div>
              {firstPendingId ? (
                <span className="rounded-full bg-surface-muted px-3 py-1 text-[10px] font-semibold text-foreground-muted">
                  1o pendente liberado
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              {activeDayAppointments.length ? (
                activeDayAppointments.map((appointment, index) => {
                  const company =
                    selectors.getCompany(appointment.companyId)?.name ??
                    "Empresa";
                  const blocked = isBlocked(appointment, activeDayAppointments);
                  return (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      companyName={company}
                      blocked={blocked}
                      order={index + 1}
                      onClick={() => handleOpenAppointment(appointment.id)}
                    />
                  );
                })
              ) : (
                <EmptyState
                  title="Sem agendamentos"
                  description="Selecione outro dia para ver a agenda."
                />
              )}
            </div>

            <div className="rounded-2xl border border-border bg-surface-muted p-3 text-xs text-foreground-muted">
              Regra ativa: somente o primeiro agendamento pendente do dia pode
              ser acionado. Os demais ficam bloqueados ate a conclusao ou
              ausencia do anterior.
            </div>
          </section>

          <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader
              title="Mapa do dia"
              subtitle="Check-ins e check-outs registrados no dia selecionado."
            />
            <CheckInOutMap
              appointments={activeDayAppointments}
              getLabel={getMapLabel}
              emptyMessage="Sem check-ins ou check-outs para exibir no dia."
            />
          </section>
        </div>
      )}
    </AppShell>
  );
}
