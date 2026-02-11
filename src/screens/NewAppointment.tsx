import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { useAuth } from "../contexts/useAuth";
import { useSchedule } from "../state/useSchedule";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { COMPANY_SELECT, mapCompany } from "../lib/supabase";
import type { Company } from "../lib/types";
import {
  getCompaniesSnapshot,
  savePendingAppointment,
} from "../storage/offlineSchedule";

const buildAddressSnapshot = (company: Company): string | null => {
  if (company.lat == null || company.lng == null) return null;
  const lat = Number(company.lat);
  const lng = Number(company.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `Empresa georreferenciada (lat: ${lat.toFixed(5)}, lng: ${lng.toFixed(5)})`;
};

const generateLocalAppointmentId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function NewAppointment() {
  const { id } = useParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { actions } = useSchedule();

  const [company, setCompany] = useState<Company | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const loadCompany = async () => {
      if (authLoading) return;
      const userEmail = user?.email?.trim();
      if (!userEmail) {
        setError("Usuario nao autenticado.");
        setLoadingCompany(false);
        return;
      }

      if (!id) {
        setError("Empresa nao encontrada.");
        setLoadingCompany(false);
        return;
      }

      const isOffline =
        typeof navigator !== "undefined" && !navigator.onLine;

      if (isOffline) {
        const cached = await getCompaniesSnapshot(userEmail);
        if (!active) return;
        const found =
          cached?.companies.find((item) => item.id === id) ?? null;
        if (!found) {
          setError("Empresa nao encontrada no cache offline.");
          setLoadingCompany(false);
          return;
        }
        setCompany(found);
        setLoadingCompany(false);
        return;
      }

      const { data, error: companyError } = await supabase
        .from("companies")
        .select(COMPANY_SELECT)
        .eq("id", id)
        .eq("email_csa", userEmail)
        .single();

      if (!active) return;

      if (companyError) {
        setError(companyError.message);
        setLoadingCompany(false);
        return;
      }

      setCompany(data ? mapCompany(data) : null);
      setLoadingCompany(false);
    };

    void loadCompany();

    return () => {
      active = false;
    };
  }, [authLoading, id, supabase, user?.email]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!id) {
      setError("Empresa nao encontrada.");
      return;
    }
    if (!company) {
      setError("Empresa nao encontrada.");
      return;
    }

    if (!startsAt || !endsAt) {
      setError("Preencha inicio e fim.");
      return;
    }

    const userEmail = user?.email?.trim();
    if (!userEmail) {
      setError("Email do usuario nao encontrado.");
      return;
    }

    const startsAtDate = new Date(startsAt);
    const endsAtDate = new Date(endsAt);

    if (
      Number.isNaN(startsAtDate.getTime()) ||
      Number.isNaN(endsAtDate.getTime())
    ) {
      setError("Datas invalidas.");
      return;
    }

    if (endsAtDate <= startsAtDate) {
      setError("Fim precisa ser depois do inicio.");
      return;
    }

    setSaving(true);

    const addressSnapshot = buildAddressSnapshot(company);
    const isOffline =
      typeof navigator !== "undefined" && !navigator.onLine;

    if (isOffline) {
      const nowIso = new Date().toISOString();
      await savePendingAppointment(userEmail, {
        id: generateLocalAppointmentId(),
        companyId: id,
        companyName: company.name ?? null,
        appointmentId: null,
        consultantId: user?.id ?? null,
        consultant: userEmail,
        createdBy: userEmail,
        startAt: startsAtDate.toISOString(),
        endAt: endsAtDate.toISOString(),
        status: "scheduled",
        addressSnapshot,
        createdAt: nowIso,
        updatedAt: nowIso,
        pendingSync: true,
        localCreatedAt: Date.now(),
      });
      setSaving(false);
      await actions.refresh();
      navigate("/cronograma/dia", { replace: true });
      return;
    }

    const { error: insertError } = await supabase.from("apontamentos").insert({
      company_id: id,
      starts_at: startsAtDate.toISOString(),
      ends_at: endsAtDate.toISOString(),
      consultant_id: user?.id ?? null,
      consultant_name: userEmail,
      created_by: userEmail,
      status: "scheduled",
      address_snapshot: addressSnapshot,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    await actions.refresh();
    navigate("/cronograma/dia", { replace: true });
  };

  if (loadingCompany) {
    return (
      <AppShell title="Novo apontamento" subtitle="Carregando empresa...">
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-32 animate-pulse rounded-3xl bg-surface-muted" />
        </div>
      </AppShell>
    );
  }

  if (!company) {
    return (
      <AppShell title="Novo apontamento" subtitle="Empresa nao encontrada.">
        <EmptyState
          title="Empresa nao encontrada"
          description={error ?? "Verifique o link ou escolha outra empresa."}
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
    <AppShell title="Novo apontamento" subtitle="Preencha os dados essenciais.">
      <div className="space-y-4">
        <Link
          to="/empresas"
          className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para empresas
        </Link>

        <section className="space-y-2 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title="Empresa" />
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-soft">
              {company.document ?? "Sem documento"}
            </p>
            <p className="text-lg font-semibold text-foreground">
              {company.name}
            </p>
            {company.state ? (
              <p className="text-sm text-foreground-muted">{company.state}</p>
            ) : null}
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-border bg-white p-4 shadow-sm"
        >
          <SectionHeader title="Dados do apontamento" />

          {error ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {/* <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-xs text-foreground-soft">
            Endereco sera registrado automaticamente com base na empresa.
          </div> */}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Inicio</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-normal text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                required
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Fim</span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-normal text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                required
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Salvando..." : "Salvar apontamento"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
