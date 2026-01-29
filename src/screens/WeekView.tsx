import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { WeekSelector } from "../components/WeekSelector";
import {
  buildMonthWeeks,
  formatMonthYear,
  formatWeekRange,
  isSameDay,
} from "../lib/date";
import { getAppointmentTitle, sortByStart } from "../lib/schedule";
import { useSchedule } from "../state/useSchedule";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export default function WeekView() {
  const { state, actions } = useSchedule();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const weeks = useMemo(() => buildMonthWeeks(new Date()), []);
  const today = new Date();
  const fallbackWeekIndex = Math.max(
    0,
    weeks.findIndex((week) => today >= week.startAt && today <= week.endAt)
  );

  const [selectedWeekIndex, setSelectedWeekIndex] = useState(fallbackWeekIndex);

  useEffect(() => {
    const weekParam = Number(searchParams.get("week"));
    if (!Number.isNaN(weekParam)) {
      setSelectedWeekIndex(clamp(weekParam - 1, 0, weeks.length - 1));
    }
  }, [searchParams, weeks.length]);

  const week = weeks[selectedWeekIndex] ?? weeks[0];

  useEffect(() => {
    actions.setRange({ startAt: week.startAt, endAt: week.endAt });
  }, [actions, week.endAt, week.startAt]);

  const dayGroups = useMemo(() => {
    return week.days.map((day) =>
      state.appointments
        .filter((appointment) =>
          isSameDay(new Date(appointment.startAt), day.date)
        )
        .sort(sortByStart)
    );
  }, [state.appointments, week]);

  const weekAppointments = dayGroups.flat();

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  return (
    <AppShell
      title="Semana"
      subtitle="Visao simultanea dos 7 dias com cards compactos."
      rightSlot={formatMonthYear(week.startAt)}
    >
      {state.loading ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
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
              title="Agenda da semana"
              subtitle="Dias lado a lado, ordenados por horario."
            />
            <div className="grid grid-cols-7 gap-1">
              {week.days.map((day, dayIndex) => {
                const dayAppointments = dayGroups[dayIndex] ?? [];
                return (
                  <div
                    key={day.id}
                    className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface-muted p-1"
                  >
                    <div className="rounded-lg bg-white px-1 py-1 text-center text-[9px] font-semibold text-foreground">
                      {day.short} {day.label}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      {dayAppointments.length ? (
                        dayAppointments.map((appointment) => (
                          <button
                            key={appointment.id}
                            type="button"
                            onClick={() => handleOpenAppointment(appointment.id)}
                            className="min-w-0 rounded-md border border-border bg-white px-1 py-1 text-[9px] font-semibold text-foreground transition hover:border-accent/40"
                          >
                            <span className="block truncate">
                              {getAppointmentTitle(appointment)}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="rounded-md border border-dashed border-border px-1 py-1 text-center text-[9px] text-foreground-muted">
                          Sem
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
