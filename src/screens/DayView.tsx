import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { DaySelector } from "../components/DaySelector";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { WeekSelector } from "../components/WeekSelector";
import {
  buildMonthWeeks,
  formatMonthYear,
  formatWeekRange,
  getDayIndexMonday,
  isSameDay,
} from "../lib/date";
import { getFirstPendingId, isBlocked, isPending, sortByStart } from "../lib/schedule";
import { useSchedule } from "../state/useSchedule";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export default function DayView() {
  const { state, selectors, actions } = useSchedule();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const weeks = useMemo(() => buildMonthWeeks(new Date()), []);
  const today = new Date();
  const fallbackWeekIndex = Math.max(
    0,
    weeks.findIndex(
      (week) => today >= week.startAt && today <= week.endAt
    )
  );

  const [selectedWeekIndex, setSelectedWeekIndex] = useState(fallbackWeekIndex);
  const [selectedDayIndex, setSelectedDayIndex] = useState(
    getDayIndexMonday(today)
  );

  useEffect(() => {
    const weekParam = Number(searchParams.get("week"));
    if (!Number.isNaN(weekParam)) {
      setSelectedWeekIndex(clamp(weekParam - 1, 0, weeks.length - 1));
    }
    const dayParam = Number(searchParams.get("day"));
    if (!Number.isNaN(dayParam)) {
      setSelectedDayIndex(clamp(dayParam, 0, 6));
    }
  }, [searchParams, weeks.length]);

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

  return (
    <AppShell
      title="Dia ativo"
      subtitle="Agendamentos do dia selecionado, ordenados por horario."
      rightSlot={formatMonthYear(week.startAt)}
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
          <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader
              title={week.label}
              subtitle={formatWeekRange(week.startAt, week.endAt)}
              rightSlot={`${weekAppointments.length} ag.`}
            />
            <WeekSelector
              weeks={weeks}
              selectedIndex={selectedWeekIndex}
              onSelect={setSelectedWeekIndex}
            />
          </section>

          <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader
              title="Selecione o dia"
              subtitle={`Pendentes na semana: ${pendingWeekCount}`}
            />
            <DaySelector
              days={week.days}
              selectedIndex={selectedDayIndex}
              onSelect={setSelectedDayIndex}
            />
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
        </div>
      )}
    </AppShell>
  );
}
