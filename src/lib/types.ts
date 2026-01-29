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
  appointmentId?: string | null;
  consultantId?: string | null;
  consultant: string;
  startAt: string;
  endAt: string;
  status?: SupabaseAppointmentStatus;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  absenceReason?: string | null;
  absenceNote?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  appointmentTitle?: string | null;
};

export type Company = {
  id: string;
  name: string;
  document?: string | null;
  state?: string | null;
  csa?: string | null;
  carteiraDef?: string | null;
  clientClass?: string | null;
  carteiraDef2?: string | null;
  classeCliente?: string | null;
  validacao?: string | null;
  referencia?: string | null;
  createdAt?: string | null;
  segment?: string | null;
  city?: string | null;
};
