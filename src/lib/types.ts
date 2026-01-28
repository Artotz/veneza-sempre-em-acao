export type AppointmentStatus =
  | "pendente"
  | "em_execucao"
  | "concluido"
  | "ausente";

export type Appointment = {
  id: string;
  companyId: string;
  title: string;
  consultant: string;
  address: string;
  city: string;
  startAt: string;
  endAt: string;
  checkInAt?: string;
  checkOutAt?: string;
  absenceReason?: string;
  notes?: string;
};

export type Company = {
  id: string;
  name: string;
  segment: string;
  city: string;
};
