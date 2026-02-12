import type { Appointment } from "../lib/types";
import { getAppointmentStatus, getAppointmentTitle } from "../lib/schedule";
import { StatusBadge } from "./StatusBadge";

type AppointmentCardProps = {
  appointment: Appointment;
  companyName: string;
  blocked: boolean;
  headerLabel: string;
  detailLabel?: string;
  onClick?: () => void;
};

export const AppointmentCard = ({
  appointment,
  companyName,
  blocked,
  headerLabel,
  detailLabel,
  onClick,
}: AppointmentCardProps) => {
  const status = getAppointmentStatus(appointment);
  const resolvedDetailLabel = detailLabel ?? getAppointmentTitle(appointment);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border border-border bg-white p-4 text-left shadow-sm transition ${
        blocked ? "opacity-70" : "hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground-soft">
            {headerLabel}
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            {companyName}
          </h3>
          <div className="mt-1 space-y-1 text-sm text-foreground-muted">
            <p>{resolvedDetailLabel}</p>
            {appointment.createdBy ? (
              <p className="text-xs text-foreground-soft">
                Criado por {appointment.createdBy}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {appointment.pendingSync ? (
            <span className="rounded-full bg-warning/15 px-2 py-1 text-[10px] font-semibold text-warning">
              Pendente
            </span>
          ) : null}
          <StatusBadge status={status} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end text-xs text-foreground-soft">
        {blocked ? (
          <span className="rounded-full bg-border px-2 py-1 text-[10px] font-semibold text-foreground-muted">
            Bloqueado
          </span>
        ) : (
          <span className="rounded-full bg-surface-muted px-2 py-1 text-[10px] font-semibold text-foreground-muted">
            Toque para detalhes
          </span>
        )}
      </div>
    </button>
  );
};
