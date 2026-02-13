import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { useAuth } from "../contexts/useAuth";
import { buildMonthWeeks, formatDateShort, formatMonthYear } from "../lib/date";
import { formatCurrencyBRL, formatQuantity } from "../lib/format";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentTitle,
  isBlocked,
  isSuggested,
  sortByStart,
} from "../lib/schedule";
import { COMPANY_SELECT, mapCompany } from "../lib/supabase";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { Appointment, AppointmentStatus, Company } from "../lib/types";
import { useSchedule } from "../state/useSchedule";
import {
  getCompaniesSnapshot,
  saveCompaniesSnapshot,
} from "../storage/offlineSchedule";

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

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { state, selectors, actions } = useSchedule();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [company, setCompany] = useState<Company | null>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(() => [
    "agendado",
    "em_execucao",
  ]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const weeks = useMemo(() => buildMonthWeeks(new Date()), []);
  const monthRange = useMemo(() => {
    const startAt = weeks[0]?.startAt ?? new Date();
    const endAt = weeks[weeks.length - 1]?.endAt ?? new Date();
    return { startAt, endAt };
  }, [weeks]);

  useEffect(() => {
    actions.setRange({ startAt: monthRange.startAt, endAt: monthRange.endAt });
  }, [actions, monthRange.endAt, monthRange.startAt]);

  useEffect(() => {
    let active = true;

    const loadCompany = async () => {
      if (authLoading) return;
      if (!id) {
        setCompanyError("Empresa nao encontrada.");
        setCompanyLoading(false);
        return;
      }

      const fromState = selectors.getCompany(id);
      if (fromState) {
        setCompany(fromState);
        setCompanyError(null);
        setCompanyLoading(false);
        return;
      }

      const userEmail = user?.email?.trim();
      if (!userEmail) {
        setCompanyError("Usuario nao autenticado.");
        setCompanyLoading(false);
        return;
      }

      const cached = await getCompaniesSnapshot(userEmail);
      const cachedCompany =
        cached?.companies.find((item) => item.id === id) ?? null;

      if (!active) return;

      if (cachedCompany) {
        setCompany(cachedCompany);
        setCompanyError(null);
        setCompanyLoading(false);
        return;
      }

      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      if (isOffline) {
        setCompanyError("Sem conexao e sem cache local.");
        setCompanyLoading(false);
        return;
      }

      setCompanyLoading(true);
      setCompanyError(null);

      const { data, error: requestError } = await supabase
        .from("companies")
        .select(COMPANY_SELECT)
        .eq("id", id)
        .eq("email_csa", userEmail)
        .maybeSingle();

      if (!active) return;

      if (requestError) {
        setCompanyError(requestError.message);
        setCompanyLoading(false);
        return;
      }

      if (!data) {
        setCompanyError("Empresa nao encontrada.");
        setCompanyLoading(false);
        return;
      }

      const mapped = mapCompany(data);
      setCompany(mapped);
      setCompanyLoading(false);

      const baseCompanies = cached?.companies ?? state.companies;
      const nextCompanies = baseCompanies.some((item) => item.id === mapped.id)
        ? baseCompanies.map((item) => (item.id === mapped.id ? mapped : item))
        : [...baseCompanies, mapped];
      await saveCompaniesSnapshot(userEmail, nextCompanies);
    };

    void loadCompany();

    return () => {
      active = false;
    };
  }, [authLoading, id, selectors, state.companies, supabase, user?.email]);

  const orderedAppointments = useMemo(() => {
    if (!id) return [];
    return state.appointments
      .filter((appointment) => appointment.companyId === id)
      .sort(sortByStart);
  }, [id, state.appointments]);

  const dayGroups = useMemo(
    () => buildDayGroups(orderedAppointments),
    [orderedAppointments],
  );

  const summary = useMemo(() => {
    return orderedAppointments.reduce(
      (acc, appointment) => {
        acc[getAppointmentStatus(appointment)] += 1;
        return acc;
      },
      {
        total: orderedAppointments.length,
        agendado: 0,
        em_execucao: 0,
        concluido: 0,
        cancelado: 0,
      },
    );
  }, [orderedAppointments]);

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

  const companyDisplayName =
    company?.name ?? orderedAppointments[0]?.companyName ?? "Empresa";

  const handleOpenAppointment = (appointmentId: string) => {
    navigate(`/apontamentos/${appointmentId}`);
  };

  if (!id) {
    return (
      <AppShell title="Empresa" subtitle="Empresa nao encontrada.">
        <EmptyState
          title="Empresa nao encontrada"
          description="Verifique o link ou escolha outra empresa."
        />
        <Link
          to="/empresas"
          className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para empresas
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={companyDisplayName}
      subtitle="Detalhes da empresa e apontamentos do mes."
      rightSlot={formatMonthYear(new Date())}
    >
      <div className="space-y-4">
        <Link
          to="/empresas"
          className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para empresas
        </Link>

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title="Dados da empresa" />
          {companyLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded-full bg-surface-muted" />
              <div className="h-6 w-3/4 animate-pulse rounded-full bg-surface-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-muted" />
            </div>
          ) : companyError ? (
            <EmptyState
              title="Nao foi possivel carregar"
              description={companyError}
            />
          ) : company ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                  {company.document ?? "Sem documento"}
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {company.name}
                </p>
                {[
                  company.state,
                  company.csa ? `CSA ${company.csa}` : null,
                  company.segment ? `Segmento ${company.segment}` : null,
                ].filter(Boolean).length ? (
                  <p className="text-sm text-foreground-muted">
                    {[
                      company.state,
                      company.csa ? `CSA ${company.csa}` : null,
                      company.segment ? `Segmento ${company.segment}` : null,
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1 text-sm text-foreground-muted">
                {company.clientClass ? (
                  <p>Classe: {company.clientClass}</p>
                ) : null}
                {company.carteiraDef ? (
                  <p>Carteira: {company.carteiraDef}</p>
                ) : null}
                {company.carteiraDef2 ? (
                  <p>Carteira 2: {company.carteiraDef2}</p>
                ) : null}
                {company.validacao ? (
                  <p>Validacao: {company.validacao}</p>
                ) : null}
              </div>

              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                    Valor Cot (3m)
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrencyBRL(company.vlrUltimos3Meses)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                    Qtd Cot (3m)
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatQuantity(company.qtdUltimos3Meses)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Empresa nao encontrada"
              description="Verifique o link ou escolha outra empresa."
            />
          )}
        </section>

        <button
          type="button"
          onClick={() => navigate(`/empresas/${id}/novo-apontamento`)}
          className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-foreground/90"
        >
          Criar apontamento
        </button>

        <section className="space-y-3">
          <SectionHeader
            title="Apontamentos"
            rightSlot={`${orderedAppointments.length} ag.`}
          />

          {state.loading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
              <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            </div>
          ) : state.error && orderedAppointments.length === 0 ? (
            <EmptyState
              title="Nao foi possivel carregar"
              description={state.error}
            />
          ) : (
            <div className="space-y-3">
              <div className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
                <SectionHeader
                  title="Filtros do mes"
                  subtitle="Status e sugestoes."
                  rightSlot={`${filteredAppointments.length} ag.`}
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
                        className={`rounded-full px-3 py-1 transition ${pill.baseClass} ${
                          isActive ? `ring-2 ${pill.ringClass}` : ""
                        }`}
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
              </div>

              {state.error ? (
                <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
                  {state.error}
                </div>
              ) : null}
              {filteredAppointments.length ? (
                filteredAppointments.map((appointment) => {
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
                      companyName={companyDisplayName}
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
                  title="Sem apontamentos"
                  description={
                    orderedAppointments.length === 0
                      ? "Nenhum apontamento encontrado para este mes."
                      : statusFilters.length === 0 && !showSuggestions
                        ? "Nenhum filtro ativo. Ligue ao menos um status acima."
                        : "Nenhum apontamento encontrado para os filtros ativos."
                  }
                />
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
