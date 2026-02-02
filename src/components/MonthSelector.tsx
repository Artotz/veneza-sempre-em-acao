import { useEffect, useRef } from "react";
import type { MonthOption } from "../lib/date";

type MonthSelectorProps = {
  months: MonthOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export const MonthSelector = ({
  months,
  selectedIndex,
  onSelect,
}: MonthSelectorProps) => {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const target = buttonRefs.current[selectedIndex];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
      {months.map((month, index) => {
        const isActive = index === selectedIndex;
        return (
          <button
            key={month.id}
            type="button"
            onClick={() => onSelect(index)}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            className={`shrink-0 rounded-2xl border px-4 py-2 text-xs font-semibold transition ${
              isActive
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border bg-white text-foreground-soft hover:border-accent/40"
            }`}
          >
            {month.label}
          </button>
        );
      })}
    </div>
  );
};
