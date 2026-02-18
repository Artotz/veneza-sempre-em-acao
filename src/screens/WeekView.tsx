import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { CheckInOutMap } from "../components/CheckInOutMap";
import { DateSelector } from "../components/DateSelector";
import { DetailsMapTabs } from "../components/DetailsMapTabs";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import {
  buildMonthOptions,
  buildMonthWeeks,
  formatMonthParam,
  formatMonthYear,
  formatTime,
  isSameDay,
  parseMonthParam,
} from "../lib/date";
import { getAppointmentStatus, sortByStart } from "../lib/schedule";
import type { AppointmentStatus } from "../lib/types";
import { useSchedule } from "../state/useSchedule";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const DEFAULT_MIN_HOUR = 6;
const DEFAULT_MAX_HOUR = 20;
const SLOT_MINUTES = 30;
const HOUR_HEIGHT = 64;

const statusCardStyle: Record<AppointmentStatus, string> = {
  agendado: "border-warning/30 bg-warning/15 text-warning",
  em_execucao: "border-info/30 bg-info/15 text-info",
  concluido: "border-success/30 bg-success/15 text-success",
  cancelado: "border-danger/30 bg-danger/15 text-danger",
};

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
  const [activeTab, setActiveTab] = useState<"details" | "map">("details");

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
  const timeRange = useMemo(() => {
    if (!weekAppointments.length) {
      return { minHour: DEFAULT_MIN_HOUR, maxHour: DEFAULT_MAX_HOUR };
    }
    let minHour = Number.POSITIVE_INFINITY;
    let maxHour = Number.NEGATIVE_INFINITY;
    weekAppointments.forEach((appointment) => {
      const start = new Date(appointment.startAt);
      const end = new Date(appointment.endAt);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        return;
      }
      const startHour = start.getHours() + start.getMinutes() / 60;
      const endHour = end.getHours() + end.getMinutes() / 60;
      minHour = Math.min(minHour, startHour);
      maxHour = Math.max(maxHour, endHour);
    });
    if (!Number.isFinite(minHour) || !Number.isFinite(maxHour)) {
      return { minHour: DEFAULT_MIN_HOUR, maxHour: DEFAULT_MAX_HOUR };
    }
    const computedMin = Math.floor(minHour);
    const computedMax = Math.ceil(maxHour);
    const clampedMin = clamp(
      Math.min(computedMin, DEFAULT_MIN_HOUR),
      0,
      23,
    );
    const clampedMax = clamp(
      Math.max(computedMax, DEFAULT_MAX_HOUR),
      clampedMin + 1,
      24,
    );
    return { minHour: clampedMin, maxHour: clampedMax };
  }, [weekAppointments]);
  const slotMarkers = useMemo(() => {
    const totalMinutes = (timeRange.maxHour - timeRange.minHour) * 60;
    const totalSlots = Math.ceil(totalMinutes / SLOT_MINUTES);
    return Array.from({ length: totalSlots + 1 }).map((_, index) => {
      const minutesFromStart = index * SLOT_MINUTES;
      const absoluteMinutes = timeRange.minHour * 60 + minutesFromStart;
      const hour = Math.floor(absoluteMinutes / 60);
      const minute = absoluteMinutes % 60;
      const isHour = minute === 0;
      return {
        key: `${hour}-${minute}`,
        minutesFromStart,
        isHour,
        label: isHour
          ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
          : "",
      };
    });
  }, [timeRange.maxHour, timeRange.minHour]);
  const gridHeight =
    (timeRange.maxHour - timeRange.minHour) * HOUR_HEIGHT;
  const pixelsPerMinute = HOUR_HEIGHT / 60;
  const getAppointmentStyle = useCallback(
    (appointment: (typeof weekAppointments)[number]) => {
      const start = new Date(appointment.startAt);
      const end = new Date(appointment.endAt);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        return null;
      }
      const rangeStartMinutes = timeRange.minHour * 60;
      const rangeEndMinutes = timeRange.maxHour * 60;
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();
      const clampedStart = Math.max(startMinutes, rangeStartMinutes);
      const clampedEnd = Math.min(endMinutes, rangeEndMinutes);
      if (clampedEnd <= clampedStart) return null;
      const top = (clampedStart - rangeStartMinutes) * pixelsPerMinute;
      const height = Math.max(
        (clampedEnd - clampedStart) * pixelsPerMinute,
        18,
      );
      return { top, height };
    },
    [pixelsPerMinute, timeRange.maxHour, timeRange.minHour],
  );

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  const getMapLabel = useCallback(
    (
      appointment: (typeof weekAppointments)[number],
      kind: "checkin" | "checkout",
    ) => {
      const companyName =
        appointment.companyName ??
        selectors.getCompany(appointment.companyId)?.name ??
        "Empresa";
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
          <DetailsMapTabs value={activeTab} onChange={setActiveTab} />
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
            {activeTab === "details" ? (
              <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
                <SectionHeader
                  title="Agenda da semana"
                  subtitle="Dias lado a lado com escala horaria."
                />
                <div className="overflow-hidden rounded-2xl border border-border">
                  <div className="max-h-[70vh] overflow-auto">
                    <div className="min-w-[900px]">
                      <div className="sticky top-0 z-10 grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-border/60 bg-surface-muted/90 text-[10px] font-semibold uppercase text-foreground-muted backdrop-blur">
                        <div className="flex items-center justify-center border-r border-border/60 px-2 py-2">
                          Hora
                        </div>
                        {week.days.map((day) => {
                          const isToday = isSameDay(day.date, today);
                          return (
                            <div
                              key={day.id}
                              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 ${
                                isToday
                                  ? "bg-accent/15 text-foreground"
                                  : "text-foreground-muted"
                              }`}
                            >
                              <span className="text-[10px]">
                                {day.short.toLowerCase()}
                              </span>
                              <span className="text-[11px] font-semibold text-foreground">
                                {day.date.getDate()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
                        <div
                          className="relative border-r border-border/60 bg-surface-muted/40"
                          style={{ height: gridHeight }}
                        >
                          {slotMarkers.map((slot) => (
                            <div
                              key={slot.key}
                              className={`absolute left-0 right-0 ${
                                slot.isHour
                                  ? "border-t border-border/60"
                                  : "border-t border-border/20"
                              }`}
                              style={{
                                top: slot.minutesFromStart * pixelsPerMinute,
                              }}
                            >
                              {slot.isHour ? (
                                <span className="absolute -top-2 right-2 bg-surface-muted/80 px-1 text-[10px] font-semibold text-foreground-muted">
                                  {slot.label}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        {week.days.map((day, dayIndex) => {
                          const dayAppointments = dayGroups[dayIndex] ?? [];
                          const isToday = isSameDay(day.date, today);
                          return (
                            <div
                              key={day.id}
                              className={`relative border-r border-border/40 ${
                                isToday ? "bg-accent/5" : "bg-white"
                              }`}
                              style={{ height: gridHeight }}
                            >
                              {slotMarkers.map((slot) => (
                                <div
                                  key={`${day.id}-${slot.key}`}
                                  className={`absolute left-0 right-0 ${
                                    slot.isHour
                                      ? "border-t border-border/50"
                                      : "border-t border-border/15"
                                  }`}
                                  style={{
                                    top:
                                      slot.minutesFromStart * pixelsPerMinute,
                                  }}
                                />
                              ))}
                              {dayAppointments.map((appointment) => {
                                const companyName =
                                  appointment.companyName ??
                                  selectors.getCompany(appointment.companyId)
                                    ?.name ??
                                  "Empresa";
                                const status = getAppointmentStatus(appointment);
                                const style = getAppointmentStyle(appointment);
                                if (!style) return null;
                                return (
                                  <button
                                    key={appointment.id}
                                    type="button"
                                    onClick={() =>
                                      handleOpenAppointment(appointment.id)
                                    }
                                    className={`absolute left-1 right-1 flex flex-col gap-1 overflow-hidden rounded-md border px-2 py-1 text-left text-[10px] font-semibold transition hover:shadow-sm ${statusCardStyle[status]}`}
                                    style={style}
                                  >
                                    <span className="text-[9px] uppercase tracking-[0.08em]">
                                      {formatTime(
                                        new Date(appointment.startAt),
                                      )}{" "}
                                      -{" "}
                                      {formatTime(
                                        new Date(appointment.endAt),
                                      )}
                                    </span>
                                    <span
                                      className="text-[10px] leading-tight"
                                      style={{
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                      }}
                                    >
                                      {companyName}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
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
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
