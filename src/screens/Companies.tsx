import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { COMPANY_SELECT, mapCompany } from "../lib/supabase";
import type { Company } from "../lib/types";

export default function Companies() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const trimmed = query.trim();
      let request = supabase
        .from("companies")
        .select(COMPANY_SELECT)
        .order("name", { ascending: true });

      if (trimmed.length) {
        request = request.or(
          `name.ilike.%${trimmed}%,document.ilike.%${trimmed}%`
        );
      }

      const { data, error: requestError } = await request;

      if (!active) return;

      if (requestError) {
        setError(requestError.message);
        setCompanies([]);
        setLoading(false);
        return;
      }

      setCompanies((data ?? []).map(mapCompany));
      setLoading(false);
    }, query.trim().length ? 300 : 0);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, supabase]);

  return (
    <AppShell
      title="Empresas"
      subtitle="Selecione uma empresa para criar apontamentos."
    >
      <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
        <SectionHeader title="Busca rapida" subtitle="Nome ou documento." />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar empresa..."
          className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
        />
      </section>

      <section className="mt-5 space-y-3">
        {loading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          </div>
        ) : error ? (
          <EmptyState
            title="Nao foi possivel carregar"
            description={error}
          />
        ) : companies.length ? (
          companies.map((company) => (
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
                <p className="text-sm text-foreground-muted">
                  {company.state ?? "Estado nao informado"}{" "}
                  {company.csa ? `- CSA ${company.csa}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-foreground-muted">
                {company.clientClass ? (
                  <span className="rounded-full bg-surface-muted px-3 py-1">
                    Classe: {company.clientClass}
                  </span>
                ) : null}
                {company.carteiraDef ? (
                  <span className="rounded-full bg-surface-muted px-3 py-1">
                    Carteira: {company.carteiraDef}
                  </span>
                ) : null}
                {company.carteiraDef2 ? (
                  <span className="rounded-full bg-surface-muted px-3 py-1">
                    Carteira 2: {company.carteiraDef2}
                  </span>
                ) : null}
                {company.validacao ? (
                  <span className="rounded-full bg-surface-muted px-3 py-1">
                    Validacao: {company.validacao}
                  </span>
                ) : null}
              </div>

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
          ))
        ) : (
          <EmptyState
            title="Nenhuma empresa encontrada"
            description="Ajuste a busca ou tente novamente."
          />
        )}
      </section>
    </AppShell>
  );
}
