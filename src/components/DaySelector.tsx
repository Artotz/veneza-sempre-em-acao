import type { WeekDay } from "../lib/date";

type DaySelectorProps = {
  days: WeekDay[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export const DaySelector = ({ days, selectedIndex, onSelect }: DaySelectorProps) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
      {days.map((day, index) => {
        const isActive = index === selectedIndex;
        return (
          <button
            key={day.id}
            type="button"
            onClick={() => onSelect(index)}
            className={`shrink-0 rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition ${
              isActive
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border bg-white text-foreground-soft hover:border-accent/40"
            }`}
          >
            <div>{day.short}</div>
            <div className="text-[10px] text-foreground-muted">{day.label}</div>
          </button>
        );
      })}
    </div>
  );
};
