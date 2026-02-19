import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { useAuth } from "../contexts/useAuth";
import { formatCurrencyBRL, formatQuantity } from "../lib/format";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { COMPANY_SELECT, mapCompany } from "../lib/supabase";
import type { Company } from "../lib/types";
import {
  getCompaniesSnapshot,
  saveCompaniesSnapshot,
} from "../storage/offlineSchedule";
import { t } from "../i18n";

export default function Companies() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"valor" | "quantidade">("valor");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterCompanies = (items: Company[], term: string) => {
    const trimmed = term.trim().toLowerCase();
    if (!trimmed) return items;
    return items.filter((company) => {
      const name = company.name?.toLowerCase() ?? "";
      const document = company.document?.toLowerCase() ?? "";
      return name.includes(trimmed) || document.includes(trimmed);
    });
  };

  useEffect(() => {
    let active = true;
    let handle: ReturnType<typeof setTimeout> | undefined;

    if (authLoading) {
      setLoading(true);
      return () => {
        active = false;
        if (handle) clearTimeout(handle);
      };
    }

    const userEmail = user?.email?.trim();
    if (!userEmail) {
      setCompanies([]);
      setError(t("ui.usuario_nao_autenticado"));
      setLoading(false);
      return () => {
        active = false;
        if (handle) clearTimeout(handle);
      };
    }

    handle = setTimeout(
      async () => {
        setLoading(true);
        setError(null);
        const trimmed = query.trim();
        const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

        if (isOffline) {
          const cached = await getCompaniesSnapshot(userEmail);
          if (!active) return;
          if (!cached) {
            setCompanies([]);
            setError(t("ui.sem_conexao_e_sem_cache_local"));
            setLoading(false);
            return;
          }
          setCompanies(filterCompanies(cached.companies, trimmed));
          setLoading(false);
          return;
        }
        let request = supabase
          .from("companies")
          .select(COMPANY_SELECT)
          .eq("email_csa", userEmail)
          .order("name", { ascending: true });

        if (trimmed.length) {
          request = request.or(
            `name.ilike.%${trimmed}%,document.ilike.%${trimmed}%`,
          );
        }

        const { data, error: requestError } = await request;

        if (!active) return;

        if (requestError) {
          const cached = await getCompaniesSnapshot(userEmail);
          if (!active) return;
          if (cached) {
            setCompanies(filterCompanies(cached.companies, trimmed));
            setLoading(false);
            return;
          }
          setError(requestError.message);
          setCompanies([]);
          setLoading(false);
          return;
        }

        const mapped = (data ?? []).map(mapCompany);
        setCompanies(filterCompanies(mapped, trimmed));
        await saveCompaniesSnapshot(userEmail, mapped);
        setLoading(false);
      },
      query.trim().length ? 300 : 0,
    );

    return () => {
      active = false;
      if (handle) clearTimeout(handle);
    };
  }, [authLoading, query, supabase, user?.email]);

  const sortedCompanies = useMemo(() => {
    const items = [...companies];
    const getMetric = (company: Company) =>
      sortBy === "valor"
        ? (company.vlrUltimos3Meses ?? 0)
        : (company.qtdUltimos3Meses ?? 0);
    items.sort((a, b) => {
      const diff = getMetric(b) - getMetric(a);
      if (diff !== 0) return diff;
      return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
    });
    return items;
  }, [companies, sortBy]);

  return (
    <AppShell
      title={t("ui.empresas")}
      subtitle={t("ui.selecione_uma_empresa_para_criar_apontamentos")}
    >
      <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
        <SectionHeader
          title={t("ui.busca_rapida")}
          subtitle={t("ui.nome_ou_documento")}
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("ui.buscar_empresa")}
          className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="text-foreground-soft">{t("ui.ordenar_por")}</span>
          <button
            type="button"
            onClick={() => setSortBy("valor")}
            aria-pressed={sortBy === "valor"}
            className={`rounded-full px-3 py-1 transition ${
              sortBy === "valor"
                ? "bg-foreground text-white"
                : "bg-surface-muted text-foreground-soft"
            }`}
          >
            {t("ui.valor_cot_3m")}
          </button>
          <button
            type="button"
            onClick={() => setSortBy("quantidade")}
            aria-pressed={sortBy === "quantidade"}
            className={`rounded-full px-3 py-1 transition ${
              sortBy === "quantidade"
                ? "bg-foreground text-white"
                : "bg-surface-muted text-foreground-soft"
            }`}
          >
            {t("ui.quantidade_cot_3m")}
          </button>
        </div>
      </section>

      <section className="mt-5 space-y-3">
        {loading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          </div>
        ) : error ? (
          <EmptyState title={t("ui.nao_foi_possivel_carregar")} description={error} />
        ) : sortedCompanies.length ? (
          sortedCompanies.map((company) => (
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
                  company.csa ? t("ui.csa_csa", { csa: company.csa }) : null,
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

              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                    {t("ui.valor_cot_3m")}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrencyBRL(company.vlrUltimos3Meses)}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                    {t("ui.qtd_cot_3m")}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatQuantity(company.qtdUltimos3Meses)}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate(`/empresas/${company.id}`)}
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
    </AppShell>
  );
}
