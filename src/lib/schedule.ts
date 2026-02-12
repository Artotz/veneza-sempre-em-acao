import type { Appointment, AppointmentStatus } from "./types";
import { formatTime } from "./date";

export const getAppointmentStatus = (
  appointment: Appointment
): AppointmentStatus => {
  if (appointment.status === "absent" || appointment.absenceReason)
    return "cancelado";
  if (appointment.status === "done" || appointment.checkOutAt)
    return "concluido";
  if (appointment.status === "in_progress" || appointment.checkInAt)
    return "em_execucao";
  return "agendado";
};

export const isPending = (appointment: Appointment) =>
  appointment.status
    ? appointment.status === "scheduled"
    : !appointment.checkOutAt && !appointment.absenceReason;

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
  const firstPendingId = getFirstPendingId(appointments);
  if (!firstPendingId) return false;
  return isPending(appointment) && appointment.id !== firstPendingId;
};

export const formatAppointmentWindow = (appointment: Appointment) => {
  const start = formatTime(new Date(appointment.startAt));
  const end = formatTime(new Date(appointment.endAt));
  return `${start} - ${end}`;
};

export const getAppointmentTitle = (appointment: Appointment) => {
  const explicit = appointment.appointmentTitle?.trim();
  if (explicit) return explicit;
  return `Apontamento - ${formatAppointmentWindow(appointment)}`;
};
