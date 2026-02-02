import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { CheckInOutMap } from "../components/CheckInOutMap";
import { DateSelector } from "../components/DateSelector";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import {
  buildMonthOptions,
  buildMonthWeeks,
  formatMonthParam,
  formatMonthYear,
  formatWeekRange,
  isSameDay,
  parseMonthParam,
} from "../lib/date";
import { sortByStart } from "../lib/schedule";
import { useSchedule } from "../state/useSchedule";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export default function WeekView() {
  const { state, actions, selectors } = useSchedule();
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

  const week = weeks[selectedWeekIndex] ?? weeks[0];

  useEffect(() => {
    actions.setRange({ startAt: week.startAt, endAt: week.endAt });
  }, [actions, week.endAt, week.startAt]);

  const dayGroups = useMemo(() => {
    return week.days.map((day) =>
      state.appointments
        .filter((appointment) =>
          isSameDay(new Date(appointment.startAt), day.date),
        )
        .sort(sortByStart),
    );
  }, [state.appointments, week]);

  const weekAppointments = dayGroups.flat();

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  const getMapLabel = useCallback(
    (
      appointment: (typeof weekAppointments)[number],
      kind: "checkin" | "checkout",
    ) => {
      const companyName =
        selectors.getCompany(appointment.companyId)?.name ?? "Empresa";
      return `${companyName} - ${kind === "checkin" ? "Check-in" : "Check-out"}`;
    },
    [selectors],
  );

  return (
    <AppShell
      title="Semana"
      subtitle="Visao simultanea dos 7 dias com cards compactos."
      rightSlot={formatMonthYear(selectedMonth)}
    >
      <div className="space-y-5">
        <section className="space-y-4 rounded-3xl border border-border bg-white p-4 shadow-sm">
          {/* <SectionHeader
            title={week.label}
            subtitle={formatWeekRange(week.startAt, week.endAt)}
            rightSlot={state.loading ? null : `${weekAppointments.length} ag.`}
          /> */}
          <DateSelector
            mode="week-month"
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
          />
        </section>

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
          <>
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
                          dayAppointments.map((appointment) => {
                            const companyName =
                              selectors.getCompany(appointment.companyId)
                                ?.name ?? "Empresa";
                            return (
                              <button
                                key={appointment.id}
                                type="button"
                                onClick={() =>
                                  handleOpenAppointment(appointment.id)
                                }
                                className="min-w-0 rounded-md border border-border bg-white px-1 py-1 text-[9px] font-semibold text-foreground transition hover:border-accent/40"
                              >
                                <span className="block truncate">
                                  {companyName}
                                </span>
                              </button>
                            );
                          })
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

            <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
              <SectionHeader
                title="Mapa da semana"
                subtitle="Check-ins e check-outs registrados na semana."
              />
              <CheckInOutMap
                appointments={weekAppointments}
                getLabel={getMapLabel}
                emptyMessage="Sem check-ins ou check-outs para exibir na semana."
              />
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
