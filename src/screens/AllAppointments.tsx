import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { DetailsMapTabs } from "../components/DetailsMapTabs";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusFilters } from "../components/StatusFilters";
import { useAuth } from "../contexts/useAuth";
import { buildMonthWeeks, formatDateShort, formatMonthYear } from "../lib/date";
import { formatCurrencyBRL, formatQuantity } from "../lib/format";
import {
  buildProtheusCounts,
  buildDocumentVariants,
  chunkArray,
  getProtheusKey,
  mergeProtheusCounts,
  type ProtheusCountMap,
} from "../lib/protheus";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentTitle,
  isBlocked,
  isSuggested,
  sortByStart,
} from "../lib/schedule";
import type { Appointment, AppointmentStatus } from "../lib/types";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { useSchedule } from "../state/useSchedule";
import { t } from "../i18n";

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
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"details" | "map">(() =>
    searchParams.get("tab") === "empresas" ? "map" : "details",
  );
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(
    () => ["em_execucao", "agendado"],
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companySortBy, setCompanySortBy] = useState<
    "valor" | "quantidade" | "preventivas" | "reconexoes"
  >("valor");
  const [protheusCounts, setProtheusCounts] = useState<ProtheusCountMap>({});

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
    setActiveTab(searchParams.get("tab") === "empresas" ? "map" : "details");
  }, [searchParams]);

  useEffect(() => {
    let active = true;

    const loadProtheusCounts = async () => {
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      if (isOffline) {
        setProtheusCounts({});
        return;
      }

      const documents = Array.from(
        new Set(
          state.companies.flatMap((company) =>
            buildDocumentVariants(company.document),
          ),
        ),
      );

      if (!documents.length) {
        setProtheusCounts({});
        return;
      }

      let aggregated: ProtheusCountMap = {};
      for (const chunk of chunkArray(documents, 200)) {
        const { data, error: requestError } = await supabase
          .from("base_protheus")
          .select("a1_cgc, tipo_lead")
          .in("a1_cgc", chunk);

        if (!active) return;

        if (requestError) {
          setProtheusCounts({});
          return;
        }

        aggregated = mergeProtheusCounts(
          aggregated,
          buildProtheusCounts(data ?? []),
        );
      }

      if (!active) return;
      setProtheusCounts(aggregated);
    };

    void loadProtheusCounts();

    return () => {
      active = false;
    };
  }, [state.companies, supabase]);

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
        expirado: 0,
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
    const base = trimmed
      ? state.companies.filter((company) => {
          const name = company.name?.toLowerCase() ?? "";
          const document = company.document?.toLowerCase() ?? "";
          return name.includes(trimmed) || document.includes(trimmed);
        })
      : state.companies;

    const items = [...base];
    const getMetric = (company: (typeof items)[number]) =>
      companySortBy === "valor"
        ? (company.vlrUltimos3Meses ?? 0)
        : companySortBy === "quantidade"
          ? (company.qtdUltimos3Meses ?? 0)
          : companySortBy === "preventivas"
            ? (protheusCounts[getProtheusKey(company.document)]?.preventivas ??
                0)
            : (protheusCounts[getProtheusKey(company.document)]?.reconexoes ??
                0);
    items.sort((a, b) => {
      const diff = getMetric(b) - getMetric(a);
      if (diff !== 0) return diff;
      return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
    });
    return items;
  }, [companyQuery, companySortBy, protheusCounts, state.companies]);

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  const handleOpenCompany = (id: string) => {
    navigate(`/empresas/${id}`);
  };

  const handleTabChange = (tab: "details" | "map") => {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    if (tab === "map") {
      nextParams.set("tab", "empresas");
    } else {
      nextParams.delete("tab");
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <AppShell
      title={t("ui.lista")}
      subtitle={t(
        "ui.todos_os_agendamentos_em_sequencia_unica_sem_agrupamento_por_data",
      )}
      rightSlot={formatMonthYear(new Date())}
    >
      <div className="space-y-4">
        <DetailsMapTabs
          value={activeTab}
          onChange={handleTabChange}
          detailsLabel={t("ui.agendamentos")}
          mapLabel={t("ui.empresas")}
        />
        {state.loading ? (
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          </div>
        ) : state.error ? (
          <EmptyState
            title={t("ui.nao_foi_possivel_carregar")}
            description={state.error}
          />
        ) : activeTab === "details" ? (
          <div className="space-y-4">
            <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
              <SectionHeader
                title={t("ui.resumo_geral")}
                subtitle={t("ui.distribuicao_por_status")}
                rightSlot={t("ui.ag_count", { count: summary.total })}
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
            </section>

            <section className="space-y-3">
              {filteredAppointments.length ? (
                filteredAppointments.map((appointment) => {
                  const company = selectors.getCompany(appointment.companyId);
                  const companyName =
                    appointment.companyName ?? company?.name ?? t("ui.empresa");
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
                  title={t("ui.sem_agendamentos")}
                  description={
                    statusFilters.length === 0 && !showSuggestions
                      ? t("ui.nenhum_filtro_ativo_ligue_ao_menos_um_status_acima")
                      : t(
                          "ui.nenhum_agendamento_encontrado_para_os_filtros_ativos",
                        )
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
                title={t("ui.busca_rapida")}
                subtitle={t("ui.nome_ou_documento")}
                rightSlot={t("ui.emp_count", {
                  count: filteredCompanies.length,
                })}
              />
              <input
                value={companyQuery}
                onChange={(event) => setCompanyQuery(event.target.value)}
                placeholder={t("ui.buscar_empresa")}
                className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
              />
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-foreground-soft">{t("ui.ordenar_por")}</span>
                <select
                  value={companySortBy}
                  onChange={(event) =>
                    setCompanySortBy(
                      event.target.value as
                        | "valor"
                        | "quantidade"
                        | "preventivas"
                        | "reconexoes",
                    )
                  }
                  className="flex-1 rounded-2xl border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground shadow-sm outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                >
                  <option value="valor">{t("ui.valor_cot_1m")}</option>
                  <option value="quantidade">{t("ui.quantidade_cot_1m")}</option>
                  <option value="preventivas">{t("ui.qtd_preventivas")}</option>
                  <option value="reconexoes">{t("ui.qtd_reconexoes")}</option>
                </select>
              </div>
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
                        {company.document ?? t("ui.sem_documento")}
                      </p>
                      <h3 className="text-lg font-semibold text-foreground">
                        {company.name}
                      </h3>
                      {[
                        company.state,
                        company.csa
                          ? t("ui.csa_csa", { csa: company.csa })
                          : null,
                      ].filter(Boolean).length ? (
                        <p className="text-sm text-foreground-muted">
                          {[
                            company.state,
                            company.csa
                              ? t("ui.csa_csa", { csa: company.csa })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                        {companySortBy === "valor"
                          ? t("ui.valor_cot_1m")
                          : companySortBy === "quantidade"
                            ? t("ui.qtd_cot_1m")
                            : companySortBy === "preventivas"
                              ? t("ui.qtd_preventivas")
                              : t("ui.qtd_reconexoes")}
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {companySortBy === "valor"
                          ? formatCurrencyBRL(company.vlrUltimos3Meses)
                          : companySortBy === "quantidade"
                            ? formatQuantity(company.qtdUltimos3Meses)
                            : companySortBy === "preventivas"
                              ? formatQuantity(
                                  protheusCounts[
                                    getProtheusKey(company.document)
                                  ]?.preventivas ?? 0,
                                )
                              : formatQuantity(
                                  protheusCounts[
                                    getProtheusKey(company.document)
                                  ]?.reconexoes ?? 0,
                                )}
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => handleOpenCompany(company.id)}
                        className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted"
                      >
                        {t("ui.ver_empresa")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/empresas/${company.id}/novo-apontamento`)
                        }
                        className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-foreground/90"
                      >
                        {t("ui.criar_apontamento")}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  title={t("ui.nenhuma_empresa_encontrada")}
                  description={t("ui.ajuste_a_busca_ou_tente_novamente")}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
