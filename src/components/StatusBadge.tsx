import type { AppointmentStatus } from "../lib/types";
import { t } from "../i18n";

const statusCopy: Record<AppointmentStatus, string> = {
  agendado: t("ui.agendado"),
  expirado: t("ui.expirado"),
  em_execucao: t("ui.em_execucao"),
  concluido: t("ui.concluido"),
  atuado: t("ui.atuado"),
  cancelado: t("ui.cancelado"),
};

const statusStyle: Record<AppointmentStatus, string> = {
  agendado: "bg-warning/15 text-warning",
  expirado: "bg-foreground/10 text-foreground-muted",
  em_execucao: "bg-info/15 text-info",
  concluido: "bg-success/15 text-success",
  atuado: "bg-primary/15 text-primary",
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
