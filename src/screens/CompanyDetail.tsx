import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusFilters } from "../components/StatusFilters";
import { useAuth } from "../contexts/useAuth";
import { buildMonthWeeks, formatDateShort, formatMonthYear } from "../lib/date";
import { formatCurrencyBRL, formatQuantity } from "../lib/format";
import { buildDocumentVariants, splitProtheusSeries } from "../lib/protheus";
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
import { t } from "../i18n";

const buildDayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

type CompanyTab = "agendamentos" | "oportunidades";
type OpportunityTab = "cotacoes" | "preventivas" | "reconexoes";
type OpportunityItem = {
  id: string;
  title: string;
  detail?: string;
  createdAt?: string;
};

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
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(
    () => ["em_execucao", "agendado"],
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [companyTab, setCompanyTab] = useState<CompanyTab>("agendamentos");
  const [opportunityTab, setOpportunityTab] =
    useState<OpportunityTab>("cotacoes");
  const [protheusSeries, setProtheusSeries] = useState<{
    preventivas: string[];
    reconexoes: string[];
  }>({ preventivas: [], reconexoes: [] });

  const opportunities = useMemo(() => {
    const cotacoes: OpportunityItem[] = [
      {
        id: "cotacao-valor",
        title: t("ui.valor_cot_1m"),
        detail: formatCurrencyBRL(company?.vlrUltimos3Meses),
      },
      {
        id: "cotacao-qtd",
        title: t("ui.qtd_cot_1m"),
        detail: formatQuantity(company?.qtdUltimos3Meses),
      },
    ];

    const preventivas: OpportunityItem[] = protheusSeries.preventivas.map(
      (serie, index) => ({
        id: `preventiva-${serie}-${index}`,
        title: serie,
      }),
    );

    const reconexoes: OpportunityItem[] = protheusSeries.reconexoes.map(
      (serie, index) => ({
        id: `reconexao-${serie}-${index}`,
        title: serie,
      }),
    );

    return {
      cotacoes,
      preventivas,
      reconexoes,
    } satisfies Record<OpportunityTab, OpportunityItem[]>;
  }, [
    company?.qtdUltimos3Meses,
    company?.vlrUltimos3Meses,
    protheusSeries,
    t,
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

  useEffect(() => {
    let active = true;

    const loadCompany = async () => {
      if (authLoading) return;
      if (!id) {
        setCompanyError(t("ui.empresa_nao_encontrada_2"));
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
        setCompanyError(t("ui.usuario_nao_autenticado"));
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
        setCompanyError(t("ui.sem_conexao_e_sem_cache_local"));
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
        setCompanyError(t("ui.empresa_nao_encontrada_2"));
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

  useEffect(() => {
    let active = true;

    const loadProtheus = async () => {
      const document = company?.document?.trim();
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      if (!document || isOffline) {
        setProtheusSeries({ preventivas: [], reconexoes: [] });
        return;
      }

      const variants = buildDocumentVariants(document);
      if (!variants.length) {
        setProtheusSeries({ preventivas: [], reconexoes: [] });
        return;
      }

      const { data, error: requestError } = await supabase
        .from("base_protheus")
        .select("serie, tipo_lead")
        .in("a1_cgc", variants);

      if (!active) return;

      if (requestError) {
        setProtheusSeries({ preventivas: [], reconexoes: [] });
        return;
      }

      const series = splitProtheusSeries(data ?? []);
      setProtheusSeries(series);
    };

    void loadProtheus();

    return () => {
      active = false;
    };
  }, [company?.document, supabase]);

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
        expirado: 0,
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

  const companyDisplayName =
    company?.name ?? orderedAppointments[0]?.companyName ?? t("ui.empresa");

  const handleOpenAppointment = (appointmentId: string) => {
    navigate(`/apontamentos/${appointmentId}`);
  };

  const activeOpportunities = opportunities[opportunityTab];

  if (!id) {
    return (
      <AppShell
        title={t("ui.empresa")}
        subtitle={t("ui.empresa_nao_encontrada_2")}
      >
        <EmptyState
          title={t("ui.empresa_nao_encontrada")}
          description={t("ui.verifique_o_link_ou_escolha_outra_empresa")}
        />
        {/* <Link
          to="/empresas"
          className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para empresas
        </Link> */}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={companyDisplayName}
      subtitle={t("ui.detalhes_da_empresa_e_apontamentos_do_mes")}
      rightSlot={formatMonthYear(new Date())}
    >
      <div className="space-y-4">
        {/* <Link
          to="/empresas"
          className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para empresas
        </Link> */}

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title={t("ui.dados_da_empresa")} />
          {companyLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded-full bg-surface-muted" />
              <div className="h-6 w-3/4 animate-pulse rounded-full bg-surface-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-muted" />
            </div>
          ) : companyError ? (
            <EmptyState
              title={t("ui.nao_foi_possivel_carregar")}
              description={companyError}
            />
          ) : company ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                  {company.document ?? t("ui.sem_documento")}
                </p>
                <p className="text-lg font-semibold text-foreground">
                  {company.name}
                </p>
                {[
                  company.state,
                  company.csa
                    ? t("ui.csa_csa", { csa: company.csa })
                    : null,
                  company.segment
                    ? t("ui.segmento_segment", { segment: company.segment })
                    : null,
                ].filter(Boolean).length ? (
                  <p className="text-sm text-foreground-muted">
                    {[
                      company.state,
                      company.csa
                        ? t("ui.csa_csa", { csa: company.csa })
                        : null,
                      company.segment
                        ? t("ui.segmento_segment", {
                            segment: company.segment,
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-semibold text-foreground">
                {company.clientClass ? (
                  <span className="rounded-full border border-border bg-surface-muted px-3 py-1">
                    {company.clientClass}
                  </span>
                ) : null}
                {company.carteiraDef ? (
                  <span className="rounded-full border border-border bg-surface-muted px-3 py-1">
                    {company.carteiraDef}
                  </span>
                ) : null}
                {company.carteiraDef2 ? (
                  <span className="rounded-full border border-border bg-surface-muted px-3 py-1">
                    {company.carteiraDef2}
                  </span>
                ) : null}
              </div>
              {company.validacao ? (
                <p className="text-sm text-foreground-muted">
                  {t("ui.validacao_value", { value: company.validacao })}
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title={t("ui.empresa_nao_encontrada")}
              description={t("ui.verifique_o_link_ou_escolha_outra_empresa")}
            />
          )}
        </section>

        <button
          type="button"
          onClick={() => navigate(`/empresas/${id}/novo-apontamento`)}
          className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-foreground/90"
        >
          {t("ui.criar_apontamento")}
        </button>

        <div
          className="rounded-2xl border border-border bg-surface-muted p-1"
          role="tablist"
          aria-label={t("ui.alternar_secoes_empresa")}
        >
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={companyTab === "agendamentos"}
              onClick={() => setCompanyTab("agendamentos")}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                companyTab === "agendamentos"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-foreground-soft hover:bg-white/60"
              }`}
            >
              {t("ui.agendamentos")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={companyTab === "oportunidades"}
              onClick={() => setCompanyTab("oportunidades")}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                companyTab === "oportunidades"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-foreground-soft hover:bg-white/60"
              }`}
            >
              {t("ui.oportunidades")}
            </button>
          </div>
        </div>

        {companyTab === "agendamentos" ? (
          <section className="space-y-3">
            <SectionHeader
              title={t("ui.apontamentos")}
              rightSlot={t("ui.ag_count", { count: orderedAppointments.length })}
            />

            {state.loading ? (
              <div className="space-y-3">
                <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
                <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
              </div>
            ) : state.error && orderedAppointments.length === 0 ? (
              <EmptyState
                title={t("ui.nao_foi_possivel_carregar")}
                description={state.error}
              />
            ) : (
              <div className="space-y-3">
                <div className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
                  <SectionHeader
                    title={t("ui.filtros_do_mes")}
                    subtitle={t("ui.status_e_sugestoes")}
                    rightSlot={t("ui.ag_count", {
                      count: filteredAppointments.length,
                    })}
                  />
                  <StatusFilters
                    summary={summary}
                    statusFilters={statusFilters}
                    onChange={setStatusFilters}
                    showSuggestions={showSuggestions}
                    onToggleSuggestions={() =>
                      setShowSuggestions((current) => !current)
                    }
                    suggestionCount={suggestionCount}
                    className="grid grid-cols-3 gap-2 text-[11px] font-semibold"
                  />
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
                    title={t("ui.sem_apontamentos")}
                    description={
                      orderedAppointments.length === 0
                        ? t("ui.nenhum_apontamento_encontrado_para_este_mes")
                        : statusFilters.length === 0 && !showSuggestions
                          ? t(
                              "ui.nenhum_filtro_ativo_ligue_ao_menos_um_status_acima",
                            )
                          : t(
                              "ui.nenhum_apontamento_encontrado_para_os_filtros_ativos",
                            )
                    }
                  />
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-3">
            <SectionHeader
              title={t("ui.oportunidades")}
              rightSlot={t("ui.op_count", {
                count: activeOpportunities.length,
              })}
            />

            <div
              className="rounded-2xl border border-border bg-surface-muted p-1"
              role="tablist"
              aria-label={t("ui.alternar_tipos_de_oportunidade")}
            >
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  role="tab"
                  aria-selected={opportunityTab === "cotacoes"}
                  onClick={() => setOpportunityTab("cotacoes")}
                  className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition ${
                    opportunityTab === "cotacoes"
                      ? "bg-white text-foreground shadow-sm"
                      : "text-foreground-soft hover:bg-white/60"
                  }`}
                >
                  {t("ui.cotacoes")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={opportunityTab === "preventivas"}
                  onClick={() => setOpportunityTab("preventivas")}
                  className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition ${
                    opportunityTab === "preventivas"
                      ? "bg-white text-foreground shadow-sm"
                      : "text-foreground-soft hover:bg-white/60"
                  }`}
                >
                  {t("ui.preventivas")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={opportunityTab === "reconexoes"}
                  onClick={() => setOpportunityTab("reconexoes")}
                  className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition ${
                    opportunityTab === "reconexoes"
                      ? "bg-white text-foreground shadow-sm"
                      : "text-foreground-soft hover:bg-white/60"
                  }`}
                >
                  {t("ui.reconexoes")}
                </button>
              </div>
            </div>

            {activeOpportunities.length ? (
              <div className="space-y-3">
                {activeOpportunities.map((item) => (
                  <div
                    key={item.id}
                    className="space-y-1 rounded-3xl border border-border bg-white p-4 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    {item.detail ? (
                      <p className="text-xs text-foreground-muted">
                        {item.detail}
                      </p>
                    ) : null}
                    {item.createdAt ? (
                      <p className="text-[11px] text-foreground-soft">
                        {formatDateShort(new Date(item.createdAt))}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title={t("ui.nenhuma_oportunidade_encontrada")}
                description={t("ui.nenhuma_oportunidade_disponivel_no_momento")}
              />
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
