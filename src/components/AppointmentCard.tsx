import type { Appointment } from "../lib/types";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentTitle,
} from "../lib/schedule";
import { StatusBadge } from "./StatusBadge";

type AppointmentCardProps = {
  appointment: Appointment;
  companyName: string;
  blocked: boolean;
  order: number;
  onClick?: () => void;
};

export const AppointmentCard = ({
  appointment,
  companyName,
  blocked,
  order,
  onClick,
}: AppointmentCardProps) => {
  const status = getAppointmentStatus(appointment);

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
            #{order} - {formatAppointmentWindow(appointment)}
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            {companyName}
          </h3>
          <p className="mt-1 text-sm text-foreground-muted">
            {getAppointmentTitle(appointment)}
          </p>
          {appointment.createdBy ? (
            <p className="mt-1 text-xs text-foreground-soft">
              Criado por {appointment.createdBy}
            </p>
          ) : null}
        </div>
        <StatusBadge status={status} />
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
