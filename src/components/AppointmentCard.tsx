import type { Appointment } from "../lib/types";
import { getAppointmentStatus } from "../lib/schedule";
import { StatusBadge } from "./StatusBadge";
import { t } from "../i18n";

type AppointmentCardProps = {
  appointment: Appointment;
  companyName: string;
  blocked: boolean;
  headerLabel: string;
  detailLabel?: string;
  highlight?: boolean;
  onClick?: () => void;
};

export const AppointmentCard = ({
  appointment,
  companyName,
  blocked,
  headerLabel,
  // detailLabel,
  highlight = false,
  onClick,
}: AppointmentCardProps) => {
  const status = getAppointmentStatus(appointment);
  // const resolvedDetailLabel = detailLabel ?? getAppointmentTitle(appointment);
  const highlightClasses = highlight
    ? "border-warning/80 bg-amber-100 ring-1 ring-warning/30"
    : "border-border bg-white";
  const visitMatch = headerLabel.match(/^(#\d+)/);
  const visitSegment = visitMatch?.[1] ?? "";
  const hasVisitSegment = Boolean(visitSegment);
  const labelWithoutVisit = hasVisitSegment
    ? headerLabel
        .slice(visitSegment.length)
        .trim()
        .replace(/^[-\s]+/, "")
    : headerLabel;
  const labelSegments = labelWithoutVisit.split(" - ");
  const headerBadge = hasVisitSegment
    ? visitSegment
    : (labelSegments[0] ?? "");
  const headerTail = hasVisitSegment
    ? labelWithoutVisit
    : labelSegments.slice(1).join(" - ");

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${highlightClasses} ${
        blocked ? "" : "hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground-soft">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {headerBadge}
            </span>
            {headerTail ? (
              <span className="text-xs font-semibold text-foreground-soft">
                {headerTail}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 truncate text-base font-semibold text-foreground">
            {companyName}
          </h3>
          <div className="mt-1 space-y-1 text-sm text-foreground-muted">
            {/* <p>{resolvedDetailLabel}</p> */}
            {appointment.createdBy ? (
              <p className="text-xs text-foreground-soft">
                {t("ui.criado_por_name", { name: appointment.createdBy })}
              </p>
            ) : (
              <p className="text-xs text-foreground-soft">
                {t("ui.sem_criador_definido")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {appointment.pendingSync ? (
            <span className="rounded-full bg-warning/15 px-2 py-1 text-[10px] font-semibold text-warning">
              {t("ui.pendente")}
            </span>
          ) : null}
          <StatusBadge status={status} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end text-xs text-foreground-soft">
        {blocked ? (
          <span className="rounded-full bg-border px-2 py-1 text-[10px] font-semibold text-foreground-muted">
            {t("ui.bloqueado")}
          </span>
        ) : (
          <span className="rounded-full bg-surface-muted px-2 py-1 text-[10px] font-semibold text-foreground-muted">
            {t("ui.toque_para_detalhes")}
          </span>
        )}
      </div>
    </button>
  );
};
