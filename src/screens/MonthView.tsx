import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import {
  buildMonthWeeks,
  formatMonthYear,
  formatWeekRange,
  isSameDay,
} from "../lib/date";
import { sortByStart } from "../lib/schedule";
import { useSchedule } from "../state/ScheduleContext";

export default function MonthView() {
  const { state } = useSchedule();
  const weeks = useMemo(() => buildMonthWeeks(new Date()), []);
  const monthLabel = formatMonthYear(new Date());

  return (
    <AppShell
      title="Visao mensal"
      subtitle="Resumo simples do mes com acesso rapido por semana."
      rightSlot={monthLabel}
    >
      {state.loading ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
        </div>
      ) : state.error ? (
        <EmptyState
          title="Nao foi possivel carregar"
          description={state.error}
        />
      ) : (
        <div className="space-y-4">
          {weeks.map((week, weekIndex) => {
            const weekGroups = week.days.map((day) =>
              state.appointments
                .filter((appointment) =>
                  isSameDay(new Date(appointment.startAt), day.date)
                )
                .sort(sortByStart)
            );
            const weekCount = weekGroups.flat().length;

            return (
              <section
                key={week.id}
                className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm"
              >
                <SectionHeader
                  title={week.label}
                  subtitle={formatWeekRange(week.startAt, week.endAt)}
                  rightSlot={`${weekCount} ag.`}
                />
                <div className="space-y-2">
                  {week.days.map((day, dayIndex) => {
                    const dayAppointments = weekGroups[dayIndex] ?? [];
                    return (
                      <Link
                        key={day.id}
                        to={`/cronograma/semana?week=${weekIndex + 1}&day=${dayIndex}`}
                        className="block rounded-2xl border border-border bg-surface-muted px-3 py-3 text-sm transition hover:border-accent/40 hover:bg-white"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-foreground">
                              {day.short} · {day.label}
                            </p>
                            <p className="mt-1 text-xs text-foreground-muted">
                              {dayAppointments.length
                                ? dayAppointments
                                    .slice(0, 2)
                                    .map((appointment) => appointment.title)
                                    .join(" · ")
                                : "Sem agendamentos"}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-foreground-muted">
                            {dayAppointments.length}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
