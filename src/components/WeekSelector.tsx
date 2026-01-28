import type { MonthWeek } from "../lib/date";

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
            className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
              isActive
                ? "border-brand bg-brand/15 text-foreground"
                : "border-border bg-white text-foreground-soft hover:border-brand/40"
            }`}
          >
            {week.label}
          </button>
        );
      })}
    </div>
  );
};
