import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { DetailsMapTabs } from "../components/DetailsMapTabs";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { useAuth } from "../contexts/useAuth";
import { buildMonthWeeks, formatDateShort, formatMonthYear } from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentTitle,
  isBlocked,
  isSuggested,
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

export default function AllAppointments() {
  const { state, selectors, actions } = useSchedule();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"details" | "map">("details");
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(
    () => ["agendado", "em_execucao"],
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [companyQuery, setCompanyQuery] = useState("");

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
    [state.appointments],
  );
  const dayGroups = useMemo(
    () => buildDayGroups(state.appointments),
    [state.appointments],
  );

  const summary = useMemo(() => {
    return state.appointments.reduce(
      (acc, appointment) => {
        acc[getAppointmentStatus(appointment)] += 1;
        return acc;
      },
      {
        total: state.appointments.length,
        agendado: 0,
        em_execucao: 0,
        concluido: 0,
        cancelado: 0,
      },
    );
  }, [state.appointments]);

  const suggestionCount = useMemo(
    () =>
      orderedAppointments.filter((appointment) =>
        isSuggested(appointment, user?.email),
      ).length,
    [orderedAppointments, user?.email],
  );

  const filteredAppointments = useMemo(() => {
    if (statusFilters.length === 0 && !showSuggestions) return [];
    return orderedAppointments.filter((appointment) => {
      const matchesStatus = statusFilters.includes(
        getAppointmentStatus(appointment),
      );
      const matchesSuggestion =
        showSuggestions && isSuggested(appointment, user?.email);
      return matchesStatus || matchesSuggestion;
    });
  }, [orderedAppointments, showSuggestions, statusFilters, user?.email]);

  const filteredCompanies = useMemo(() => {
    const trimmed = companyQuery.trim().toLowerCase();
    if (!trimmed) return state.companies;
    return state.companies.filter((company) => {
      const name = company.name?.toLowerCase() ?? "";
      const document = company.document?.toLowerCase() ?? "";
      return name.includes(trimmed) || document.includes(trimmed);
    });
  }, [companyQuery, state.companies]);

  const pillOptions = useMemo(
    () => [
      {
        status: "agendado" as const,
        label: "Agendados",
        count: summary.agendado,
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
        status: "cancelado" as const,
        label: "Cancelados",
        count: summary.cancelado,
        baseClass: "bg-danger/15 text-danger",
        ringClass: "ring-danger/30",
      },
    ],
    [summary],
  );

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  const handleOpenCompany = (id: string) => {
    navigate(`/empresas/${id}`);
  };

  return (
    <AppShell
      title="Lista geral"
      subtitle="Todos os agendamentos em sequencia unica, sem agrupamento por data."
      rightSlot={formatMonthYear(new Date())}
    >
      <div className="space-y-4">
        <DetailsMapTabs
          value={activeTab}
          onChange={setActiveTab}
          detailsLabel="Agendamentos"
          mapLabel="Empresas"
        />
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
        ) : activeTab === "details" ? (
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
                            : [...current, pill.status],
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
                <button
                  type="button"
                  onClick={() => setShowSuggestions((current) => !current)}
                  aria-pressed={showSuggestions}
                  className={`rounded-full px-3 py-1 transition bg-accent/10 text-foreground ${
                    showSuggestions ? "ring-2 ring-accent/30" : ""
                  }`}
                >
                  Sugestoes: {suggestionCount}
                </button>
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
                  const dayLabel = formatDateShort(
                    new Date(appointment.startAt),
                  );
                  const key = buildDayKey(new Date(appointment.startAt));
                  const dayAppointments = dayGroups.get(key) ?? [];
                  const blocked = isBlocked(appointment, dayAppointments);
                  const isSuggestion = isSuggested(appointment, user?.email);

                  return (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      companyName={companyName}
                      headerLabel={`${dayLabel} - ${formatAppointmentWindow(
                        appointment,
                      )}`}
                      detailLabel={detailLabel}
                      blocked={blocked}
                      highlight={isSuggestion}
                      onClick={() => handleOpenAppointment(appointment.id)}
                    />
                  );
                })
              ) : (
                <EmptyState
                  title="Sem agendamentos"
                  description={
                    statusFilters.length === 0 && !showSuggestions
                      ? "Nenhum filtro ativo. Ligue ao menos um status acima."
                      : "Nenhum agendamento encontrado para os filtros ativos."
                  }
                />
              )}
            </section>

            {/* <div className="rounded-2xl border border-border bg-surface-muted p-3 text-xs text-foreground-muted">
              Regra ativa: somente o primeiro agendamento pendente do dia pode
              ser acionado. Os demais ficam bloqueados ate a conclusao ou
              ausencia do anterior.
            </div> */}
          </div>
        ) : (
          <div className="space-y-4">
            <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
              <SectionHeader
                title="Busca rapida"
                subtitle="Nome ou documento."
                rightSlot={`${filteredCompanies.length} emp.`}
              />
              <input
                value={companyQuery}
                onChange={(event) => setCompanyQuery(event.target.value)}
                placeholder="Buscar empresa..."
                className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
              />
            </section>

            <section className="space-y-3">
              {filteredCompanies.length ? (
                filteredCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm"
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                        {company.document ?? "Sem documento"}
                      </p>
                      <h3 className="text-lg font-semibold text-foreground">
                        {company.name}
                      </h3>
                      {[company.state, company.csa ? `CSA ${company.csa}` : null].filter(Boolean)
                        .length ? (
                        <p className="text-sm text-foreground-muted">
                          {[company.state, company.csa ? `CSA ${company.csa}` : null]
                            .filter(Boolean)
                            .join(" - ")}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => handleOpenCompany(company.id)}
                        className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted"
                      >
                        Ver empresa
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/empresas/${company.id}/novo-apontamento`)
                        }
                        className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-foreground/90"
                      >
                        Criar apontamento
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="Nenhuma empresa encontrada"
                  description="Ajuste a busca ou tente novamente."
                />
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
