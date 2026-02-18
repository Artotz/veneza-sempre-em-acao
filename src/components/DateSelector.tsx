import type { ReactNode } from "react";
import type { MonthOption, MonthWeek, WeekDay } from "../lib/date";
import { DaySelector } from "./DaySelector";
import { MonthSelector } from "./MonthSelector";
import { WeekSelector } from "./WeekSelector";
import { t } from "../i18n";

type BaseProps = {
  months: MonthOption[];
  selectedMonthIndex: number;
  onSelectMonth: (index: number) => void;
};

type MonthOnlyProps = BaseProps & {
  mode: "month";
};

type WeekMonthProps = BaseProps & {
  mode: "week-month";
  weeks: MonthWeek[];
  selectedWeekIndex: number;
  onSelectWeek: (index: number) => void;
};

type DayWeekMonthProps = BaseProps & {
  mode: "day-week-month";
  weeks: MonthWeek[];
  selectedWeekIndex: number;
  onSelectWeek: (index: number) => void;
  days: WeekDay[];
  selectedDayIndex: number;
  onSelectDay: (index: number) => void;
  dayRightSlot?: ReactNode;
  today?: Date;
};

type DateSelectorProps = MonthOnlyProps | WeekMonthProps | DayWeekMonthProps;

export const DateSelector = (props: DateSelectorProps) => {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
          {t("Mes")}
        </div>
        <MonthSelector
          months={props.months}
          selectedIndex={props.selectedMonthIndex}
          onSelect={props.onSelectMonth}
        />
      </div>

      {props.mode !== "month" ? (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
            {t("Semana")}
          </div>
          <WeekSelector
            weeks={props.weeks}
            selectedIndex={props.selectedWeekIndex}
            onSelect={props.onSelectWeek}
          />
        </div>
      ) : null}

      {props.mode === "day-week-month" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
            <span>{t("Dia")}</span>
            {/* {props.dayRightSlot ? (
              <span className="normal-case tracking-normal text-foreground-muted">
                {props.dayRightSlot}
              </span>
            ) : null} */}
          </div>
          <DaySelector
            days={props.days}
            selectedIndex={props.selectedDayIndex}
            onSelect={props.onSelectDay}
            today={props.today}
          />
        </div>
      ) : null}
    </div>
  );
};
