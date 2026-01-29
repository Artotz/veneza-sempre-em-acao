import type { Appointment, Company } from "../lib/types";
import { addDays, addMinutes, buildMonthWeeks, setTime } from "../lib/date";

type AppointmentTemplate = {
  id: string;
  week: number;
  day: number;
  time: string;
  durationMinutes: number;
  title: string;
  companyId: string;
  consultant: string;
  status?: "done" | "inProgress" | "absent";
};

const companies: Company[] = [
  {
    id: "co-vale",
    name: "Construtora Vale",
    segment: "Construcao pesada",
    state: "CE",
  },
  {
    id: "co-minas",
    name: "Mineradora Azul",
    segment: "Mineracao",
    state: "CE",
  },
  {
    id: "co-delta",
    name: "Construtora Delta",
    segment: "Infraestrutura",
    state: "CE",
  },
  {
    id: "co-logistica",
    name: "Logistica Norte",
    segment: "Logistica",
    state: "CE",
  },
  {
    id: "co-agro",
    name: "Agro Campo",
    segment: "Agro",
    state: "CE",
  },
  {
    id: "co-porto",
    name: "Porto Seco",
    segment: "Porto e terminais",
    state: "CE",
  },
  {
    id: "co-rodovias",
    name: "Rodovias Minas",
    segment: "Rodovias",
    state: "CE",
  },
  {
    id: "co-rural",
    name: "Rural Terra",
    segment: "Agro",
    state: "CE",
  },
];

const templates: AppointmentTemplate[] = [
  {
    id: "wk1-mon-1",
    week: 0,
    day: 0,
    time: "08:00",
    durationMinutes: 90,
    title: "Inspecao preventiva - D8T",
    companyId: "co-vale",
    consultant: "Carlos Lima",
    status: "done",
  },
  {
    id: "wk1-mon-2",
    week: 0,
    day: 0,
    time: "10:30",
    durationMinutes: 60,
    title: "Revisao de garantia - 320GX",
    companyId: "co-minas",
    consultant: "Marina Souza",
  },
  {
    id: "wk1-mon-3",
    week: 0,
    day: 0,
    time: "14:00",
    durationMinutes: 120,
    title: "Entrega de laudo - 140K",
    companyId: "co-logistica",
    consultant: "Carlos Lima",
  },
  {
    id: "wk1-tue-1",
    week: 0,
    day: 1,
    time: "09:00",
    durationMinutes: 120,
    title: "Manutencao programada - 938K",
    companyId: "co-delta",
    consultant: "Paulo Reis",
  },
  {
    id: "wk1-tue-2",
    week: 0,
    day: 1,
    time: "13:30",
    durationMinutes: 60,
    title: "Visita comercial - Frota CAT",
    companyId: "co-agro",
    consultant: "Ana Cruz",
  },
  {
    id: "wk1-wed-1",
    week: 0,
    day: 2,
    time: "07:30",
    durationMinutes: 60,
    title: "Checklist de entrega - 320",
    companyId: "co-vale",
    consultant: "Juliana Prado",
    status: "inProgress",
  },
  {
    id: "wk1-wed-2",
    week: 0,
    day: 2,
    time: "09:30",
    durationMinutes: 90,
    title: "Treinamento operador - 950L",
    companyId: "co-rodovias",
    consultant: "Rafael Dias",
  },
  {
    id: "wk1-wed-3",
    week: 0,
    day: 2,
    time: "13:00",
    durationMinutes: 120,
    title: "Inspecao de seguranca - 336",
    companyId: "co-porto",
    consultant: "Juliana Prado",
  },
  {
    id: "wk1-thu-1",
    week: 0,
    day: 3,
    time: "08:30",
    durationMinutes: 60,
    title: "Instalacao telemetria - D6R",
    companyId: "co-vale",
    consultant: "Carlos Lima",
    status: "done",
  },
  {
    id: "wk1-thu-2",
    week: 0,
    day: 3,
    time: "15:30",
    durationMinutes: 90,
    title: "Manutencao emergencia - 988H",
    companyId: "co-porto",
    consultant: "Paulo Reis",
  },
  {
    id: "wk1-fri-1",
    week: 0,
    day: 4,
    time: "08:00",
    durationMinutes: 60,
    title: "Revisao trimestral - 140M",
    companyId: "co-minas",
    consultant: "Marina Souza",
    status: "done",
  },
  {
    id: "wk1-fri-2",
    week: 0,
    day: 4,
    time: "11:00",
    durationMinutes: 120,
    title: "Inspecao preventiva - 950H",
    companyId: "co-rodovias",
    consultant: "Ana Cruz",
  },
  {
    id: "wk2-mon-1",
    week: 1,
    day: 0,
    time: "08:20",
    durationMinutes: 80,
    title: "Auditoria de frota - 336",
    companyId: "co-vale",
    consultant: "Rafael Dias",
    status: "done",
  },
  {
    id: "wk2-mon-2",
    week: 1,
    day: 0,
    time: "11:10",
    durationMinutes: 90,
    title: "Visita tecnica - 330",
    companyId: "co-delta",
    consultant: "Rafael Dias",
  },
  {
    id: "wk2-tue-1",
    week: 1,
    day: 1,
    time: "09:00",
    durationMinutes: 120,
    title: "Revisao pos-venda - 416F",
    companyId: "co-agro",
    consultant: "Marina Souza",
    status: "absent",
  },
  {
    id: "wk2-tue-2",
    week: 1,
    day: 1,
    time: "13:40",
    durationMinutes: 70,
    title: "Treinamento frota - 950K",
    companyId: "co-logistica",
    consultant: "Paulo Reis",
  },
  {
    id: "wk2-wed-1",
    week: 1,
    day: 2,
    time: "08:15",
    durationMinutes: 75,
    title: "Entrega de checklist - 320",
    companyId: "co-vale",
    consultant: "Carlos Lima",
  },
  {
    id: "wk2-wed-2",
    week: 1,
    day: 2,
    time: "11:50",
    durationMinutes: 110,
    title: "Instalacao de sensor - D7",
    companyId: "co-porto",
    consultant: "Juliana Prado",
  },
  {
    id: "wk2-thu-1",
    week: 1,
    day: 3,
    time: "07:40",
    durationMinutes: 60,
    title: "Manutencao leve - 420F",
    companyId: "co-rodovias",
    consultant: "Ana Cruz",
  },
  {
    id: "wk2-thu-2",
    week: 1,
    day: 3,
    time: "10:30",
    durationMinutes: 90,
    title: "Visita de follow-up - 312D",
    companyId: "co-rural",
    consultant: "Ana Cruz",
  },
  {
    id: "wk3-mon-1",
    week: 2,
    day: 0,
    time: "09:10",
    durationMinutes: 100,
    title: "Inspecao de seguranca - 336",
    companyId: "co-porto",
    consultant: "Juliana Prado",
  },
  {
    id: "wk3-mon-2",
    week: 2,
    day: 0,
    time: "13:20",
    durationMinutes: 80,
    title: "Revisao de garantia - 320GX",
    companyId: "co-minas",
    consultant: "Marina Souza",
  },
  {
    id: "wk3-wed-1",
    week: 2,
    day: 2,
    time: "08:45",
    durationMinutes: 95,
    title: "Treinamento operador - 950L",
    companyId: "co-rodovias",
    consultant: "Rafael Dias",
  },
  {
    id: "wk3-fri-1",
    week: 2,
    day: 4,
    time: "10:00",
    durationMinutes: 120,
    title: "Instalacao telemetria - D6R",
    companyId: "co-vale",
    consultant: "Carlos Lima",
  },
  {
    id: "wk4-tue-1",
    week: 3,
    day: 1,
    time: "08:00",
    durationMinutes: 90,
    title: "Entrega de laudo - 140K",
    companyId: "co-logistica",
    consultant: "Carlos Lima",
  },
  {
    id: "wk4-tue-2",
    week: 3,
    day: 1,
    time: "11:30",
    durationMinutes: 60,
    title: "Visita comercial - Frota CAT",
    companyId: "co-rural",
    consultant: "Ana Cruz",
  },
  {
    id: "wk4-thu-1",
    week: 3,
    day: 3,
    time: "09:15",
    durationMinutes: 100,
    title: "Revisao pos-venda - 416F",
    companyId: "co-agro",
    consultant: "Marina Souza",
  },
  {
    id: "wk4-fri-1",
    week: 3,
    day: 4,
    time: "14:00",
    durationMinutes: 80,
    title: "Treinamento frota - 950K",
    companyId: "co-delta",
    consultant: "Paulo Reis",
  },
];

const parseTime = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return { hours, minutes };
};

const buildAppointments = () => {
  const referenceDate = new Date();
  const weeks = buildMonthWeeks(referenceDate);

  return templates.map((template) => {
    const weekStart = weeks[template.week]?.startAt ?? weeks[0].startAt;
    const { hours, minutes } = parseTime(template.time);
    const date = addDays(weekStart, template.day);
    const startAt = setTime(date, hours, minutes);
    const endAt = addMinutes(startAt, template.durationMinutes);

    const base: Appointment = {
      id: template.id,
      companyId: template.companyId,
      consultant: template.consultant,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      appointmentTitle: template.title,
    };

    if (template.status === "done") {
      return {
        ...base,
        checkInAt: addMinutes(startAt, -5).toISOString(),
        checkOutAt: endAt.toISOString(),
      };
    }

    if (template.status === "inProgress") {
      return {
        ...base,
        checkInAt: addMinutes(startAt, -3).toISOString(),
      };
    }

    if (template.status === "absent") {
      return {
        ...base,
        absenceReason: "Cliente pediu remarcacao.",
      };
    }

    return base;
  });
};

const delay = (ms = 400) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const fetchSchedule = async () => {
  await delay(250);
  return {
    companies,
    appointments: buildAppointments(),
  };
};

export const mockCheckIn = async () => {
  await delay(300);
  return { checkInAt: new Date().toISOString() };
};

export const mockCheckOut = async () => {
  await delay(300);
  return { checkOutAt: new Date().toISOString() };
};

export const mockAbsence = async (reason: string) => {
  await delay(300);
  return { absenceReason: reason };
};
