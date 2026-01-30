import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { MonthSelector } from "../components/MonthSelector";
import { SectionHeader } from "../components/SectionHeader";
import {
  buildMonthOptions,
  buildMonthWeeks,
  formatMonthYear,
  formatMonthParam,
  isSameDay,
  parseMonthParam,
  WEEK_DAYS,
} from "../lib/date";
import { useSchedule } from "../state/useSchedule";

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export default function MonthView() {
  const { state, actions } = useSchedule();
  const [searchParams] = useSearchParams();
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
  const monthLabel = formatMonthYear(selectedMonth);
  const monthRange = useMemo(() => {
    const startAt = weeks[0]?.startAt ?? new Date();
    const endAt = weeks[weeks.length - 1]?.endAt ?? new Date();
    return { startAt, endAt };
  }, [weeks]);

  useEffect(() => {
    const monthParam = parseMonthParam(searchParams.get("month"));
    if (monthParam) {
      setSelectedMonth(monthParam);
    }
  }, [searchParams]);

  useEffect(() => {
    actions.setRange({ startAt: monthRange.startAt, endAt: monthRange.endAt });
  }, [actions, monthRange.endAt, monthRange.startAt]);

  const appointmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    state.appointments.forEach((appointment) => {
      const date = new Date(appointment.startAt);
      const key = getDateKey(date);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [state.appointments]);

  return (
    <AppShell
      title="Visao mensal"
      subtitle="Grade mensal em 7 colunas, com acesso rapido por dia."
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
          <section className="space-y-4 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader
              title="Grade do mes"
              subtitle="Todos os dias do mes em 7 colunas."
            />
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
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-foreground-muted">
              {WEEK_DAYS.map((day) => (
                <div key={day.id} className="rounded-lg bg-surface-muted py-2">
                  {day.short}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weeks.flatMap((week, weekIndex) =>
                week.days.map((day) => {
                  const dayKey = getDateKey(day.date);
                  const count = appointmentCounts.get(dayKey) ?? 0;
                  const isCurrentMonth =
                    day.date.getMonth() === selectedMonth.getMonth() &&
                    day.date.getFullYear() === selectedMonth.getFullYear();
                  const isToday = isSameDay(day.date, today);
                  const borderClass = isToday ? "border-accent" : "border-border";
                  const backgroundClass = isToday
                    ? "bg-white"
                    : isCurrentMonth
                      ? "bg-surface-muted"
                      : "bg-surface-strong";
                  const textClass = isCurrentMonth
                    ? "text-foreground"
                    : "text-foreground-muted";
                  return (
                    <Link
                      key={`${week.id}-${day.date.getTime()}`}
                      to={`/cronograma/dia?month=${formatMonthParam(
                        selectedMonth
                      )}&week=${weekIndex + 1}&day=${day.index}`}
                      aria-label={`${day.label} com ${count} agendamentos`}
                      className={`group flex min-h-[76px] flex-col justify-between rounded-xl border p-2 text-left transition hover:border-accent/40 hover:bg-white ${borderClass} ${backgroundClass} ${textClass}`}
                    >
                      <span className={`text-xs font-semibold ${textClass}`}>
                        {day.date.getDate()}
                      </span>
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          count
                            ? "bg-white text-foreground"
                            : "bg-surface-muted text-foreground-muted"
                        }`}
                      >
                        {count}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
