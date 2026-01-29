import type { Appointment, Company, SupabaseAppointmentStatus } from "./types";

type CompanyRow = {
  id: string;
  document?: string | null;
  name: string;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  csa?: string | null;
  carteira_def?: string | null;
  client_class?: string | null;
  carteira_def2?: string | null;
  classe_cliente?: string | null;
  validacao?: string | null;
  referencia?: string | null;
  created_at?: string | null;
};

type AppointmentRow = {
  id: string;
  company_id: string;
  appointment_id?: string | null;
  consultant_id?: string | null;
  consultant_name?: string | null;
  starts_at: string;
  ends_at: string;
  status?: SupabaseAppointmentStatus | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  check_in_lat?: number | null;
  check_in_lng?: number | null;
  check_in_accuracy_m?: number | null;
  check_out_lat?: number | null;
  check_out_lng?: number | null;
  check_out_accuracy_m?: number | null;
  address_snapshot?: string | null;
  absence_reason?: string | null;
  absence_note?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  appointments?: { title?: string | null } | { title?: string | null }[] | null;
};

export const COMPANY_SELECT =
  "id, document, name, state, lat, lng, csa, carteira_def, client_class, carteira_def2, classe_cliente, validacao, referencia, created_at";

export const APPOINTMENT_SELECT =
  "id, company_id, appointment_id, consultant_id, consultant_name, starts_at, ends_at, status, check_in_at, check_out_at, check_in_lat, check_in_lng, check_in_accuracy_m, check_out_lat, check_out_lng, check_out_accuracy_m, address_snapshot, absence_reason, absence_note, notes, created_at, updated_at";

export const mapCompany = (row: CompanyRow): Company => ({
  id: row.id,
  name: row.name,
  document: row.document ?? null,
  state: row.state ?? null,
  lat: row.lat ?? null,
  lng: row.lng ?? null,
  csa: row.csa ?? null,
  carteiraDef: row.carteira_def ?? null,
  clientClass: row.client_class ?? null,
  carteiraDef2: row.carteira_def2 ?? null,
  classeCliente: row.classe_cliente ?? null,
  validacao: row.validacao ?? null,
  referencia: row.referencia ?? null,
  createdAt: row.created_at ?? null,
});

const getAppointmentTitle = (row: AppointmentRow) => {
  if (!row.appointments) return null;
  if (Array.isArray(row.appointments)) {
    return row.appointments[0]?.title ?? null;
  }
  return row.appointments.title ?? null;
};

export const mapAppointment = (row: AppointmentRow): Appointment => ({
  id: row.id,
  companyId: row.company_id,
  appointmentId: row.appointment_id ?? null,
  consultantId: row.consultant_id ?? null,
  consultant: row.consultant_name ?? "",
  startAt: row.starts_at,
  endAt: row.ends_at,
  status: row.status ?? "scheduled",
  checkInAt: row.check_in_at ?? null,
  checkOutAt: row.check_out_at ?? null,
  checkInLat: row.check_in_lat ?? null,
  checkInLng: row.check_in_lng ?? null,
  checkInAccuracyM: row.check_in_accuracy_m ?? null,
  checkOutLat: row.check_out_lat ?? null,
  checkOutLng: row.check_out_lng ?? null,
  checkOutAccuracyM: row.check_out_accuracy_m ?? null,
  addressSnapshot: row.address_snapshot ?? null,
  absenceReason: row.absence_reason ?? null,
  absenceNote: row.absence_note ?? null,
  notes: row.notes ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
  appointmentTitle: getAppointmentTitle(row),
});

export const absenceReasonLabels: Record<string, string> = {
  client_requested_reschedule: "Cliente solicitou remarcacao",
  address_closed: "Endereco fechado",
  equipment_unavailable: "Equipamento indisponivel",
  other: "Outro",
};
