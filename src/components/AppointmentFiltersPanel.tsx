import { useState } from "react";
import { t } from "../i18n";
import type { AppointmentStatus } from "../lib/types";
import { SectionHeader } from "./SectionHeader";
import { StatusFilters, type StatusSummary } from "./StatusFilters";

type AppointmentFiltersPanelProps = {
  title: string;
  subtitle?: string;
  summary: StatusSummary;
  filteredCount: number;
  statusFilters: AppointmentStatus[];
  onChange: (next: AppointmentStatus[]) => void;
  showSuggestions: boolean;
  onToggleSuggestions: () => void;
  suggestionCount: number;
  defaultCollapsed?: boolean;
  className?: string;
  filtersClassName?: string;
};

export function AppointmentFiltersPanel({
  title,
  subtitle,
  summary,
  filteredCount,
  statusFilters,
  onChange,
  showSuggestions,
  onToggleSuggestions,
  suggestionCount,
  defaultCollapsed = true,
  className = "space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm",
  filtersClassName = "grid grid-cols-3 gap-2 text-[11px] font-semibold",
}: AppointmentFiltersPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className={className}>
      <SectionHeader
        title={title}
        subtitle={subtitle}
        rightSlotWrapped={false}
        rightSlot={
          <div className="inline-flex items-center gap-2">
            <span className="rounded-full bg-surface-muted px-3 py-1 text-[10px] font-semibold text-foreground-muted">
              {t("ui.ag_count", { count: filteredCount })}
            </span>
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-semibold text-foreground transition hover:bg-surface-muted"
            >
              {collapsed ? t("ui.expandir_filtros") : t("ui.colapsar_filtros")}
            </button>
          </div>
        }
      />
      {!collapsed ? (
        <StatusFilters
          summary={summary}
          statusFilters={statusFilters}
          onChange={onChange}
          showSuggestions={showSuggestions}
          onToggleSuggestions={onToggleSuggestions}
          suggestionCount={suggestionCount}
          className={filtersClassName}
        />
      ) : null}
    </section>
  );
}
