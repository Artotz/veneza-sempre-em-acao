import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusBadge } from "../components/StatusBadge";
import { buildMonthWeeks, formatDateShort, formatMonthYear } from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentTitle,
  isBlocked,
  sortByStart,
} from "../lib/schedule";
import type { Appointment, AppointmentStatus } from "../lib/types";
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
  detailLabel: string;
  blocked: boolean;
  onClick: () => void;
};

const AppointmentListItem = ({
  appointment,
  companyName,
  detailLabel,
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
            {companyName}
          </h3>
          <p className="mt-1 text-sm text-foreground-muted">{detailLabel}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-3 flex items-center justify-end text-xs text-foreground-soft">
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
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(() => [
    "pendente",
    "em_execucao",
    "concluido",
    "ausente",
  ]);

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

  const filteredAppointments = useMemo(() => {
    if (statusFilters.length === 0) return [];
    return orderedAppointments.filter((appointment) =>
      statusFilters.includes(getAppointmentStatus(appointment))
    );
  }, [orderedAppointments, statusFilters]);

  const pillOptions = useMemo(
    () => [
      {
        status: "pendente" as const,
        label: "Pendentes",
        count: summary.pendente,
        baseClass: "bg-warning/15 text-warning",
        ringClass: "ring-warning/30",
      },
      {
        status: "em_execucao" as const,
        label: "Em execucao",
        count: summary.em_execucao,
        baseClass: "bg-info/15 text-info",
        ringClass: "ring-info/30",
      },
      {
        status: "concluido" as const,
        label: "Concluidos",
        count: summary.concluido,
        baseClass: "bg-success/15 text-success",
        ringClass: "ring-success/30",
      },
      {
        status: "ausente" as const,
        label: "Ausentes",
        count: summary.ausente,
        baseClass: "bg-danger/15 text-danger",
        ringClass: "ring-danger/30",
      },
    ],
    [summary]
  );

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
              {pillOptions.map((pill) => {
                const isActive = statusFilters.includes(pill.status);
                return (
                  <button
                    key={pill.status}
                    type="button"
                    onClick={() =>
                      setStatusFilters((current) =>
                        current.includes(pill.status)
                          ? current.filter((status) => status !== pill.status)
                          : [...current, pill.status]
                      )
                    }
                    aria-pressed={isActive}
                    className={`rounded-full px-3 py-1 transition ${
                      pill.baseClass
                    } ${isActive ? `ring-2 ${pill.ringClass}` : ""}`}
                  >
                    {pill.label}: {pill.count}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            {filteredAppointments.length ? (
              filteredAppointments.map((appointment) => {
                const company = selectors.getCompany(appointment.companyId);
                const companyName =
                  appointment.companyName ?? company?.name ?? "Empresa";
                const appointmentDetail = getAppointmentTitle(appointment);
                const snapshot = appointment.addressSnapshot;
                const detailLabel = snapshot
                  ? `${appointmentDetail} - ${snapshot}`
                  : appointmentDetail;
                const key = buildDayKey(new Date(appointment.startAt));
                const dayAppointments = dayGroups.get(key) ?? [];
                const blocked = isBlocked(appointment, dayAppointments);

                return (
                  <AppointmentListItem
                    key={appointment.id}
                    appointment={appointment}
                    companyName={companyName}
                    detailLabel={detailLabel}
                    blocked={blocked}
                    onClick={() => handleOpenAppointment(appointment.id)}
                  />
                );
              })
            ) : (
              <EmptyState
                title="Sem agendamentos"
                description={
                  statusFilters.length === 0
                    ? "Nenhum filtro ativo. Ligue ao menos um status acima."
                    : "Nenhum agendamento encontrado para os filtros ativos."
                }
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
