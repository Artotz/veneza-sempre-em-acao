import type { AppointmentStatus } from "../lib/types";
import { t } from "../i18n";

type StatusSummary = {
  agendado: number;
  expirado: number;
  em_execucao: number;
  concluido: number;
  cancelado: number;
};

type StatusFiltersProps = {
  summary: StatusSummary;
  statusFilters: AppointmentStatus[];
  onChange: (next: AppointmentStatus[]) => void;
  showSuggestions: boolean;
  onToggleSuggestions: () => void;
  suggestionCount: number;
  className?: string;
};

export function StatusFilters({
  summary,
  statusFilters,
  onChange,
  showSuggestions,
  onToggleSuggestions,
  suggestionCount,
  className,
}: StatusFiltersProps) {
  const options = [
    {
      status: "em_execucao" as const,
      label: t("ui.em_execucao"),
      count: summary.em_execucao,
      baseClass: "bg-info/15 text-info",
      ringClass: "ring-info/30",
    },
    {
      status: "agendado" as const,
      label: t("ui.agendados"),
      count: summary.agendado,
      baseClass: "bg-warning/15 text-warning",
      ringClass: "ring-warning/30",
    },
    {
      status: "expirado" as const,
      label: t("ui.expirados"),
      count: summary.expirado,
      baseClass: "bg-foreground/10 text-foreground-muted",
      ringClass: "ring-foreground/20",
    },
    {
      status: "concluido" as const,
      label: t("ui.concluidos"),
      count: summary.concluido,
      baseClass: "bg-success/15 text-success",
      ringClass: "ring-success/30",
    },
    {
      status: "cancelado" as const,
      label: t("ui.cancelados"),
      count: summary.cancelado,
      baseClass: "bg-danger/15 text-danger",
      ringClass: "ring-danger/30",
    },
  ];

  const handleToggleStatus = (status: AppointmentStatus) => {
    onChange(
      statusFilters.includes(status)
        ? statusFilters.filter((item) => item !== status)
        : [...statusFilters, status],
    );
  };

  const firstGroup = options.slice(0, 3);
  const lastGroup = options.slice(3);

  return (
    <div className={className}>
      {firstGroup.map((pill) => {
        const isActive = statusFilters.includes(pill.status);
        return (
          <button
            key={pill.status}
            type="button"
            onClick={() => handleToggleStatus(pill.status)}
            aria-pressed={isActive}
            className={`flex w-full items-center justify-between gap-2 rounded-full px-3 py-1 transition ${pill.baseClass} ${
              isActive ? `ring-2 ${pill.ringClass}` : ""
            }`}
          >
            <span className="min-w-0 truncate">{pill.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {pill.count}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onToggleSuggestions}
        aria-pressed={showSuggestions}
        className={`flex w-full items-center justify-between gap-2 rounded-full px-3 py-1 transition bg-accent/10 text-foreground ${
          showSuggestions ? "ring-2 ring-accent/30" : ""
        }`}
      >
        <span className="min-w-0 truncate">{t("ui.sugestoes")}</span>
        <span className="shrink-0 font-semibold tabular-nums">
          {suggestionCount}
        </span>
      </button>
      {lastGroup.map((pill) => {
        const isActive = statusFilters.includes(pill.status);
        return (
          <button
            key={pill.status}
            type="button"
            onClick={() => handleToggleStatus(pill.status)}
            aria-pressed={isActive}
            className={`flex w-full items-center justify-between gap-2 rounded-full px-3 py-1 transition ${pill.baseClass} ${
              isActive ? `ring-2 ${pill.ringClass}` : ""
            }`}
          >
            <span className="min-w-0 truncate">{pill.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {pill.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
