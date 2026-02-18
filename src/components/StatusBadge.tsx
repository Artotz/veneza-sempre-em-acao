import type { AppointmentStatus } from "../lib/types";
import { t } from "../i18n";

const statusCopy: Record<AppointmentStatus, string> = {
  agendado: t("Agendado"),
  em_execucao: t("Em execucao"),
  concluido: t("Concluido"),
  cancelado: t("Cancelado"),
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
