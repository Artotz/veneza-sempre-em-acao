import type { AppointmentStatus } from "../lib/types";

const statusCopy: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  em_execucao: "Em execucao",
  concluido: "Concluido",
  cancelado: "Cancelado",
};

const statusStyle: Record<AppointmentStatus, string> = {
  agendado: "bg-warning/15 text-warning",
  em_execucao: "bg-info/15 text-info",
  concluido: "bg-success/15 text-success",
  cancelado: "bg-danger/15 text-danger",
};

export const StatusBadge = ({ status }: { status: AppointmentStatus }) => {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusStyle[status]}`}
    >
      {statusCopy[status]}
    </span>
  );
};
