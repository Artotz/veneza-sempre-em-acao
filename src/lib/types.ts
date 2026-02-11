export type AppointmentStatus =
  | "pendente"
  | "em_execucao"
  | "concluido"
  | "ausente";

export type SupabaseAppointmentStatus =
  | "scheduled"
  | "in_progress"
  | "done"
  | "absent";

export type Appointment = {
  id: string;
  companyId: string;
  companyName?: string | null;
  appointmentId?: string | null;
  consultantId?: string | null;
  consultant: string;
  createdBy?: string | null;
  startAt: string;
  endAt: string;
  status?: SupabaseAppointmentStatus;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkInAccuracyM?: number | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  checkOutAccuracyM?: number | null;
  addressSnapshot?: string | null;
  absenceReason?: string | null;
  absenceNote?: string | null;
  notes?: string | null;
  oportunidades?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  appointmentTitle?: string | null;
  pendingSync?: boolean;
  localCreatedAt?: number | null;
};

export type Company = {
  id: string;
  name: string;
  document?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  csa?: string | null;
  emailCsa?: string | null;
  carteiraDef?: string | null;
  clientClass?: string | null;
  carteiraDef2?: string | null;
  classeCliente?: string | null;
  validacao?: string | null;
  referencia?: string | null;
  createdAt?: string | null;
  segment?: string | null;
};
