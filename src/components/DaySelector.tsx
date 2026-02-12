import { isSameDay, type WeekDay } from "../lib/date";

type DaySelectorProps = {
  days: WeekDay[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  today?: Date;
};

export const DaySelector = ({
  days,
  selectedIndex,
  onSelect,
  today,
}: DaySelectorProps) => {
  const referenceToday = today ?? new Date();
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, index) => {
        const isActive = index === selectedIndex;
        const isToday = isSameDay(day.date, referenceToday);
        return (
          <button
            key={day.id}
            type="button"
            onClick={() => onSelect(index)}
            className={`w-full rounded-2xl border px-2 py-2 text-left text-[11px] font-semibold transition ${
              isActive
                ? "border-accent bg-accent/15 text-foreground"
                : isToday
                  ? "border-border bg-accent/10 text-foreground-soft hover:border-accent/40"
                  : "border-border bg-white text-foreground-soft hover:border-accent/40"
            } `}
          >
            <div className="flex items-center justify-between gap-2">
              <span>{day.short}</span>
              {/* {isToday ? (
                <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] font-semibold text-foreground">
                  Hoje
                </span>
              ) : null} */}
            </div>
            <div className="text-[10px] text-foreground-muted">
              {day.date.getDate()}
            </div>
          </button>
        );
      })}
    </div>
  );
};
