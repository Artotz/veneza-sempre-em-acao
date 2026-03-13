import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentFiltersPanel } from "../components/AppointmentFiltersPanel";
import { CalendarTabs } from "../components/CalendarTabs";
import { CheckInOutMap } from "../components/CheckInOutMap";
import { DateSelector } from "../components/DateSelector";
import { DetailsMapTabs } from "../components/DetailsMapTabs";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { useAuth } from "../contexts/useAuth";
import {
  buildMonthOptions,
  buildMonthWeeks,
  formatMonthParam,
  formatMonthYear,
  isSameDay,
  parseMonthParam,
} from "../lib/date";
import {
  getAppointmentStatus,
  getAppointmentWindow,
  isSuggested,
  sortByStart,
} from "../lib/schedule";
import type { AppointmentStatus } from "../lib/types";
import { useSchedule } from "../state/useSchedule";
import { t } from "../i18n";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const DEFAULT_MIN_HOUR = 8;
const DEFAULT_MAX_HOUR = 18;
const SLOT_MINUTES = 30;
const HOUR_HEIGHT = 28;
const GRID_PADDING = 8;

const statusCardStyle: Record<AppointmentStatus, string> = {
  agendado: "border-warning/30 bg-warning/15 text-warning",
  expirado: "border-foreground/20 bg-foreground/10 text-foreground-muted",
  em_execucao: "border-info/30 bg-info/15 text-info",
  concluido: "border-success/30 bg-success/15 text-success",
  atuado: "border-violet-300 bg-violet-50 text-violet-900",
  cancelado: "border-danger/30 bg-danger/15 text-danger",
};

export default function WeekView() {
  const { state, actions, selectors } = useSchedule();
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
  const [activeTab, setActiveTab] = useState<"details" | "map">("details");
  const [now, setNow] = useState(() => new Date());
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(() => [
    "em_execucao",
    "agendado",
    "expirado",
    "concluido",
    "atuado",
  ]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const interval = setInterval(tick, 60_000);
    return () => clearInterval(interval);
  }, []);

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

  const weekAppointments = useMemo(() => {
    return state.appointments
      .filter((appointment) => {
        const { start, end } = getAppointmentWindow(appointment);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return false;
        }
        return start <= week.endAt && end >= week.startAt;
      })
      .sort(sortByStart);
  }, [state.appointments, week.endAt, week.startAt]);
  const weekSummary = useMemo(() => {
    return weekAppointments.reduce(
      (acc, appointment) => {
        acc[getAppointmentStatus(appointment)] += 1;
        return acc;
      },
      {
        agendado: 0,
        expirado: 0,
        em_execucao: 0,
        concluido: 0,
        atuado: 0,
        cancelado: 0,
      },
    );
  }, [weekAppointments]);
  const suggestionCount = useMemo(
    () =>
      weekAppointments.filter((appointment) =>
        isSuggested(appointment, user?.email),
      ).length,
    [user?.email, weekAppointments],
  );
  const filteredWeekAppointments = useMemo(() => {
    if (statusFilters.length === 0 && !showSuggestions) return [];
    return weekAppointments.filter((appointment) => {
      const matchesStatus = statusFilters.includes(
        getAppointmentStatus(appointment),
      );
      const matchesSuggestion =
        showSuggestions && isSuggested(appointment, user?.email);
      return matchesStatus || matchesSuggestion;
    });
  }, [showSuggestions, statusFilters, user?.email, weekAppointments]);
  const dayGroups = useMemo(() => {
    return week.days.map((day) => {
      const dayStart = new Date(day.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const items = filteredWeekAppointments.flatMap((appointment) => {
        const { start, end } = getAppointmentWindow(appointment);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return [];
        }
        if (end <= dayStart || start >= dayEnd) return [];
        const segmentStart = start > dayStart ? start : dayStart;
        const segmentEnd = end < dayEnd ? end : dayEnd;
        if (segmentEnd <= segmentStart) return [];
        return [
          {
            appointment,
            segmentStart,
            segmentEnd,
            endsAtDayEnd: segmentEnd.getTime() === dayEnd.getTime(),
          },
        ];
      });

      items.sort(
        (a, b) => a.segmentStart.getTime() - b.segmentStart.getTime(),
      );
      return items;
    });
  }, [filteredWeekAppointments, week]);
  const hasWeekAppointments = weekAppointments.length > 0;

  const timeRange = useMemo(() => {
    let minHour = DEFAULT_MIN_HOUR;
    let maxHour = DEFAULT_MAX_HOUR;
    dayGroups.forEach((dayAppointments) => {
      dayAppointments.forEach(({ segmentStart, segmentEnd, endsAtDayEnd }) => {
        const startHour =
          segmentStart.getHours() + segmentStart.getMinutes() / 60;
        minHour = Math.min(minHour, Math.floor(startHour));

        if (endsAtDayEnd) {
          maxHour = Math.max(maxHour, 24);
          return;
        }

        const endHour =
          segmentEnd.getHours() + segmentEnd.getMinutes() / 60;
        maxHour = Math.max(maxHour, Math.ceil(endHour));
      });
    });
    minHour = Math.max(0, minHour);
    maxHour = Math.min(24, maxHour);
    if (maxHour <= minHour) {
      return { minHour: DEFAULT_MIN_HOUR, maxHour: DEFAULT_MAX_HOUR };
    }
    return { minHour, maxHour };
  }, [dayGroups]);
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
    (timeRange.maxHour - timeRange.minHour) * HOUR_HEIGHT + GRID_PADDING * 2;
  const pixelsPerMinute = HOUR_HEIGHT / 60;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTop =
    GRID_PADDING +
    (currentMinutes - timeRange.minHour * 60) * pixelsPerMinute;
  const isCurrentTimeVisible =
    currentMinutes >= timeRange.minHour * 60 &&
    currentMinutes <= timeRange.maxHour * 60;
  const getAppointmentStyle = useCallback(
    (
      segment: (typeof dayGroups)[number][number],
    ) => {
      const rangeStartMinutes = timeRange.minHour * 60;
      const rangeEndMinutes = timeRange.maxHour * 60;
      const startMinutes =
        segment.segmentStart.getHours() * 60 +
        segment.segmentStart.getMinutes();
      const endMinutes = segment.endsAtDayEnd
        ? 24 * 60
        : segment.segmentEnd.getHours() * 60 +
          segment.segmentEnd.getMinutes();
      const clampedStart = Math.max(startMinutes, rangeStartMinutes);
      const clampedEnd = Math.min(endMinutes, rangeEndMinutes);
      if (clampedEnd <= clampedStart) return null;
      const top =
        GRID_PADDING +
        (clampedStart - rangeStartMinutes) * pixelsPerMinute;
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
        t("ui.empresa");
      return `${companyName} - ${
        kind === "checkin" ? t("ui.check_in") : t("ui.check_out")
      }`;
    },
    [selectors],
  );

  return (
    <AppShell
      title={t("ui.semana")}
      subtitle={t("ui.visao_simultanea_dos_7_dias_com_cards_compactos")}
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
            title={t("ui.nao_foi_possivel_carregar")}
            description={state.error}
          />
        ) : (
          <>
            {activeTab === "details" ? (
              <>
                <AppointmentFiltersPanel
                  title={t("ui.filtros")}
                  subtitle={t("ui.status_e_sugestoes")}
                  summary={weekSummary}
                  filteredCount={filteredWeekAppointments.length}
                  statusFilters={statusFilters}
                  onChange={setStatusFilters}
                  showSuggestions={showSuggestions}
                  onToggleSuggestions={() =>
                    setShowSuggestions((current) => !current)
                  }
                  suggestionCount={suggestionCount}
                />
                <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
                <SectionHeader
                  title={t("ui.agenda_da_semana")}
                  subtitle={t("ui.dias_lado_a_lado_com_escala_horaria")}
                />
                {filteredWeekAppointments.length ? (
                  <div className="overflow-hidden rounded-2xl border border-border">
                    <div className="overflow-hidden">
                      <div className="min-w-0">
                        <div className="sticky top-0 z-10 grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-border/60 bg-surface-muted/90 text-[9px] font-semibold uppercase text-foreground-muted backdrop-blur">
                          <div className="flex items-center justify-center border-r border-border/60 px-1 py-1.5">
                            {t("ui.hora")}
                          </div>
                          {week.days.map((day) => {
                            const isToday = isSameDay(day.date, now);
                            return (
                              <div
                                key={day.id}
                                className={`flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 ${
                                  isToday
                                    ? "bg-accent/15 text-foreground"
                                    : "text-foreground-muted"
                                }`}
                              >
                                <span className="text-[9px]">
                                  {day.short.toLowerCase()}
                                </span>
                                <span className="text-[10px] font-semibold text-foreground">
                                  {day.date.getDate()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))]">
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
                                  top:
                                    GRID_PADDING +
                                    slot.minutesFromStart * pixelsPerMinute,
                                }}
                              >
                                {slot.isHour ? (
                                  <span className="absolute -top-2 right-1 bg-surface-muted/80 px-1 text-[9px] font-semibold text-foreground-muted">
                                    {slot.label}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                          {week.days.map((day, dayIndex) => {
                            const dayAppointments = dayGroups[dayIndex] ?? [];
                            const isToday = isSameDay(day.date, now);
                            return (
                              <div
                                key={day.id}
                                className={`relative border-r border-border/40 ${
                                  isToday ? "bg-accent/5" : "bg-white"
                                }`}
                                style={{ height: gridHeight }}
                              >
                                {isToday && isCurrentTimeVisible ? (
                                  <div
                                    className="absolute left-0 right-0 z-10 border-t-2 border-accent"
                                    style={{ top: currentTop }}
                                  />
                                ) : null}
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
                                        GRID_PADDING +
                                        slot.minutesFromStart * pixelsPerMinute,
                                    }}
                                  />
                                ))}
                                {dayAppointments.map((segment) => {
                                  const appointment = segment.appointment;
                                  const companyName =
                                    appointment.companyName ??
                                    selectors.getCompany(appointment.companyId)
                                      ?.name ??
                                    t("ui.empresa");
                                  const status =
                                    getAppointmentStatus(appointment);
                                  const style = getAppointmentStyle(segment);
                                  if (!style) return null;
                                  return (
                                    <button
                                      key={appointment.id}
                                      type="button"
                                      onClick={() =>
                                        handleOpenAppointment(appointment.id)
                                      }
                                      className={`absolute left-0.5 right-0.5 flex flex-col gap-0.5 overflow-hidden rounded-md border px-1 py-0.5 text-left text-[9px] font-semibold transition hover:shadow-sm ${statusCardStyle[status]}`}
                                      style={style}
                                    >
                                      <span
                                        className="text-[9px] leading-tight"
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
                ) : (
                  <EmptyState
                    title={t("ui.sem_agendamentos")}
                    description={
                      !hasWeekAppointments
                        ? t("ui.nenhum_agendamento_na_semana")
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
                </section>
              </>
            ) : (
              <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
                <SectionHeader
                  title={t("ui.mapa_da_semana")}
                  subtitle={t("ui.check_ins_e_check_outs_registrados_na_semana")}
                />
                <CheckInOutMap
                  appointments={weekAppointments}
                  getLabel={getMapLabel}
                  emptyMessage={t(
                    "ui.sem_check_ins_ou_check_outs_para_exibir_na_semana",
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
