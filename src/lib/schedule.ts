import type { Appointment, AppointmentStatus } from "./types";
import { formatTime } from "./date";
import { t } from "../i18n";

export const isPending = (appointment: Appointment) =>
  appointment.status
    ? appointment.status === "scheduled"
    : !appointment.checkOutAt && !appointment.absenceReason;

const getTodayStart = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

export const getAppointmentStatus = (
  appointment: Appointment,
): AppointmentStatus => {
  if (appointment.status === "absent" || appointment.absenceReason)
    return "cancelado";
  if (appointment.status === "done" || appointment.checkOutAt)
    return "concluido";
  if (appointment.status === "in_progress" || appointment.checkInAt)
    return "em_execucao";

  if (isPending(appointment)) {
    const startAt = new Date(appointment.startAt);
    if (!Number.isNaN(startAt.getTime()) && startAt < getTodayStart()) {
      return "expirado";
    }
  }

  return "agendado";
};

const normalizeEmail = (value?: string | null) =>
  value?.trim().toLowerCase() ?? "";

export const isSuggested = (
  appointment: Appointment,
  userEmail?: string | null,
) => {
  const createdBy = normalizeEmail(appointment.createdBy);
  const ownerEmail = normalizeEmail(userEmail);
  return createdBy.length > 0 && ownerEmail.length > 0 && createdBy !== ownerEmail;
};

export const sortByStart = (a: Appointment, b: Appointment) =>
  new Date(a.startAt).getTime() - new Date(b.startAt).getTime();

export const getFirstPendingId = (appointments: Appointment[]) => {
  const pending = appointments.find((item) => isPending(item));
  return pending?.id ?? null;
};

export const isBlocked = (
  appointment: Appointment,
  appointments: Appointment[]
) => {
  // Restricao por ordem de horario desativada: check-in/out nao dependem mais
  // do primeiro pendente do dia.
  void appointment;
  void appointments;
  return false;
};

export const formatAppointmentWindow = (appointment: Appointment) => {
  const start = formatTime(new Date(appointment.startAt));
  const end = formatTime(new Date(appointment.endAt));
  return `${start} - ${end}`;
};

export const getAppointmentTitle = (appointment: Appointment) => {
  const explicit = appointment.appointmentTitle?.trim();
  if (explicit) return explicit;
  return t("ui.apontamento_window", {
    window: formatAppointmentWindow(appointment),
  });
};
