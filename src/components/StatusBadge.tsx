import type { AppointmentStatus } from "../lib/types";

const statusCopy: Record<AppointmentStatus, string> = {
  pendente: "Pendente",
  em_execucao: "Em execucao",
  concluido: "Concluido",
  ausente: "Ausente",
};

const statusStyle: Record<AppointmentStatus, string> = {
  pendente: "bg-warning/15 text-warning",
  em_execucao: "bg-info/15 text-info",
  concluido: "bg-success/15 text-success",
  ausente: "bg-danger/15 text-danger",
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
