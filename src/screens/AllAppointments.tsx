import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusBadge } from "../components/StatusBadge";
import { buildMonthWeeks, formatDateShort, formatMonthYear } from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  isBlocked,
  sortByStart,
} from "../lib/schedule";
import type { Appointment } from "../lib/types";
import { useSchedule } from "../state/useSchedule";

const buildDayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const buildDayGroups = (appointments: Appointment[]) => {
  const groups = new Map<string, Appointment[]>();
  appointments.forEach((appointment) => {
    const key = buildDayKey(new Date(appointment.startAt));
    const list = groups.get(key) ?? [];
    list.push(appointment);
    groups.set(key, list);
  });
  groups.forEach((list) => list.sort(sortByStart));
  return groups;
};

type AppointmentListItemProps = {
  appointment: Appointment;
  companyName: string;
  blocked: boolean;
  onClick: () => void;
};

const AppointmentListItem = ({
  appointment,
  companyName,
  blocked,
  onClick,
}: AppointmentListItemProps) => {
  const status = getAppointmentStatus(appointment);
  const dayLabel = formatDateShort(new Date(appointment.startAt));

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border border-border bg-white p-4 text-left shadow-sm transition ${
        blocked ? "opacity-70" : "hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground-soft">
            {dayLabel} - {formatAppointmentWindow(appointment)}
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            {appointment.title}
          </h3>
          <p className="mt-1 text-sm text-foreground-muted">
            {companyName} - {appointment.city}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-foreground-soft">
        <span>{appointment.address}</span>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
            blocked
              ? "bg-border text-foreground-muted"
              : "bg-surface-muted text-foreground-muted"
          }`}
        >
          {blocked ? "Bloqueado" : "Toque para detalhes"}
        </span>
      </div>
    </button>
  );
};

export default function AllAppointments() {
  const { state, selectors, actions } = useSchedule();
  const navigate = useNavigate();

  const weeks = useMemo(() => buildMonthWeeks(new Date()), []);
  const monthRange = useMemo(() => {
    const startAt = weeks[0]?.startAt ?? new Date();
    const endAt = weeks[weeks.length - 1]?.endAt ?? new Date();
    return { startAt, endAt };
  }, [weeks]);

  useEffect(() => {
    actions.setRange({ startAt: monthRange.startAt, endAt: monthRange.endAt });
  }, [actions, monthRange.endAt, monthRange.startAt]);

  const orderedAppointments = useMemo(
    () => [...state.appointments].sort(sortByStart),
    [state.appointments]
  );
  const dayGroups = useMemo(
    () => buildDayGroups(state.appointments),
    [state.appointments]
  );

  const summary = useMemo(() => {
    return state.appointments.reduce(
      (acc, appointment) => {
        acc[getAppointmentStatus(appointment)] += 1;
        return acc;
      },
      {
        total: state.appointments.length,
        pendente: 0,
        em_execucao: 0,
        concluido: 0,
        ausente: 0,
      }
    );
  }, [state.appointments]);

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  return (
    <AppShell
      title="Lista geral"
      subtitle="Todos os agendamentos em sequencia unica, sem agrupamento por data."
      rightSlot={formatMonthYear(new Date())}
    >
      {state.loading ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
        </div>
      ) : state.error ? (
        <EmptyState
          title="Nao foi possivel carregar"
          description={state.error}
        />
      ) : (
        <div className="space-y-4">
          <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
            <SectionHeader
              title="Resumo geral"
              subtitle="Distribuicao por status."
              rightSlot={`${summary.total} ag.`}
            />
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-warning/15 px-3 py-1 text-warning">
                Pendentes: {summary.pendente}
              </span>
              <span className="rounded-full bg-info/15 px-3 py-1 text-info">
                Em execucao: {summary.em_execucao}
              </span>
              <span className="rounded-full bg-success/15 px-3 py-1 text-success">
                Concluidos: {summary.concluido}
              </span>
              <span className="rounded-full bg-danger/15 px-3 py-1 text-danger">
                Ausentes: {summary.ausente}
              </span>
            </div>
          </section>

          <section className="space-y-3">
            {orderedAppointments.length ? (
              orderedAppointments.map((appointment) => {
                const company =
                  selectors.getCompany(appointment.companyId)?.name ?? "Empresa";
                const key = buildDayKey(new Date(appointment.startAt));
                const dayAppointments = dayGroups.get(key) ?? [];
                const blocked = isBlocked(appointment, dayAppointments);

                return (
                  <AppointmentListItem
                    key={appointment.id}
                    appointment={appointment}
                    companyName={company}
                    blocked={blocked}
                    onClick={() => handleOpenAppointment(appointment.id)}
                  />
                );
              })
            ) : (
              <EmptyState
                title="Sem agendamentos"
                description="Nenhum agendamento cadastrado nesta janela."
              />
            )}
          </section>

          <div className="rounded-2xl border border-border bg-surface-muted p-3 text-xs text-foreground-muted">
            Regra ativa: somente o primeiro agendamento pendente do dia pode
            ser acionado. Os demais ficam bloqueados ate a conclusao ou
            ausencia do anterior.
          </div>
        </div>
      )}
    </AppShell>
  );
}
