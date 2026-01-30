import { formatWeekRange, type MonthWeek } from "../lib/date";

type WeekSelectorProps = {
  weeks: MonthWeek[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export const WeekSelector = ({ weeks, selectedIndex, onSelect }: WeekSelectorProps) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
      {weeks.map((week, index) => {
        const isActive = index === selectedIndex;
        return (
          <button
            key={week.id}
            type="button"
            onClick={() => onSelect(index)}
            className={`shrink-0 rounded-2xl border px-3 py-2 text-left text-xs font-semibold leading-tight transition ${
              isActive
                ? "border-brand bg-brand/15 text-foreground"
                : "border-border bg-white text-foreground-soft hover:border-brand/40"
            }`}
          >
            <div>{week.label}</div>
            <div className="text-[10px] text-foreground-muted">
              {formatWeekRange(week.startAt, week.endAt)}
            </div>
          </button>
        );
      })}
    </div>
  );
};
