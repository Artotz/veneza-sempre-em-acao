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
  saveCompaniesSnapshot,
  savePendingAppointment,
} from "../storage/offlineSchedule";
import { formatDateShort, isSameDay } from "../lib/date";
import { formatAppointmentWindow, getAppointmentStatus } from "../lib/schedule";
import { t } from "../i18n";

const buildAddressSnapshot = (company: Company): string | null => {
  if (company.lat == null || company.lng == null) return null;
  const lat = Number(company.lat);
  const lng = Number(company.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return t("Empresa georreferenciada (lat: {{lat}}, lng: {{lng}})", {
    lat: lat.toFixed(5),
    lng: lng.toFixed(5),
  });
};

const generateLocalAppointmentId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toLocalInputValue = (date: Date) => {
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function NewAppointment() {
  const { id } = useParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { actions, state } = useSchedule();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(id ?? "");
  const [error, setError] = useState<string | null>(null);

  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const loadCompanies = async () => {
      if (authLoading) return;
      setCompaniesLoading(true);
      setCompaniesError(null);
      const userEmail = user?.email?.trim();
      if (!userEmail) {
        setCompaniesError(t("Usuario nao autenticado."));
        setCompaniesLoading(false);
        return;
      }

      if (state.companies.length) {
        setCompanies(state.companies);
        setCompaniesLoading(false);
        setCompaniesError(null);
        return;
      }

      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

      if (isOffline) {
        const cached = await getCompaniesSnapshot(userEmail);
        if (!active) return;
        if (!cached) {
          setCompaniesError(t("Sem conexao e sem cache local."));
          setCompaniesLoading(false);
          return;
        }
        setCompanies(cached.companies);
        setCompaniesLoading(false);
        return;
      }

      const { data, error: companyError } = await supabase
        .from("companies")
        .select(COMPANY_SELECT)
        .eq("email_csa", userEmail)
        .order("name", { ascending: true });

      if (!active) return;

      if (companyError) {
        const cached = await getCompaniesSnapshot(userEmail);
        if (!active) return;
        if (cached) {
          setCompanies(cached.companies);
          setCompaniesLoading(false);
          return;
        }
        setCompaniesError(companyError.message);
        setCompaniesLoading(false);
        return;
      }

      const mapped = (data ?? []).map(mapCompany);
      setCompanies(mapped);
      setCompaniesLoading(false);
      await saveCompaniesSnapshot(userEmail, mapped);
    };

    void loadCompanies();

    return () => {
      active = false;
    };
  }, [authLoading, state.companies, supabase, user?.email]);

  useEffect(() => {
    if (id) {
      setSelectedCompanyId(id);
    }
  }, [id]);

  useEffect(() => {
    if (startsAt || endsAt) return;
    const now = new Date();
    const startValue = toLocalInputValue(now);
    const endValue = toLocalInputValue(
      new Date(now.getTime() + 60 * 60 * 1000),
    );
    setStartsAt(startValue);
    setEndsAt(endValue);
  }, [startsAt, endsAt]);

  const company =
    companies.find((item) => item.id === selectedCompanyId) ?? null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!selectedCompanyId) {
      setError(t("Empresa nao encontrada."));
      return;
    }
    if (!company) {
      setError(t("Empresa nao encontrada."));
      return;
    }

    if (!startsAt || !endsAt) {
      setError(t("Preencha inicio e fim."));
      return;
    }

    const userEmail = user?.email?.trim();
    if (!userEmail) {
      setError(t("Email do usuario nao encontrado."));
      return;
    }

    const startsAtDate = new Date(startsAt);
    const endsAtDate = new Date(endsAt);

    if (
      Number.isNaN(startsAtDate.getTime()) ||
      Number.isNaN(endsAtDate.getTime())
    ) {
      setError(t("Datas invalidas."));
      return;
    }

    if (endsAtDate <= startsAtDate) {
      setError(t("Fim precisa ser depois do inicio."));
      return;
    }

    const now = new Date();
    if (startsAtDate < now) {
      setError(t("Inicio nao pode ser menor que agora."));
      return;
    }

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (isOffline) {
      const isTodayStart = isSameDay(startsAtDate, now);
      const isTodayEnd = isSameDay(endsAtDate, now);
      if (!isTodayStart || !isTodayEnd) {
        setError(
          t(
            "Sem conexao: so e possivel criar apontamentos para hoje ({{date}}).",
            { date: formatDateShort(now) },
          ),
        );
        return;
      }
    }

    const conflict = state.appointments.find((appointment) => {
      if (
        getAppointmentStatus(appointment) === "cancelado" ||
        !isSameDay(new Date(appointment.startAt), startsAtDate)
      ) {
        return false;
      }
      const existingStart = new Date(appointment.startAt);
      const existingEnd = new Date(appointment.endAt);
      if (
        Number.isNaN(existingStart.getTime()) ||
        Number.isNaN(existingEnd.getTime())
      ) {
        return false;
      }
      return startsAtDate < existingEnd && endsAtDate > existingStart;
    });

    if (conflict) {
      setError(
        t(
          "Conflito de horario: ja existe um apontamento em {{window}}.",
          { window: formatAppointmentWindow(conflict) },
        ),
      );
      return;
    }

    setSaving(true);
    const addressSnapshot = buildAddressSnapshot(company);

    if (isOffline) {
      const nowIso = new Date().toISOString();
      await savePendingAppointment(userEmail, {
        id: generateLocalAppointmentId(),
        companyId: selectedCompanyId,
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
      company_id: selectedCompanyId,
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

  if (companiesLoading) {
    return (
      <AppShell
        title={t("Novo apontamento")}
        subtitle={t("Carregando empresa...")}
      >
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-32 animate-pulse rounded-3xl bg-surface-muted" />
        </div>
      </AppShell>
    );
  }

  if (!companies.length) {
    return (
      <AppShell
        title={t("Novo apontamento")}
        subtitle={t("Empresa nao encontrada.")}
      >
        <EmptyState
          title={t("Empresa nao encontrada")}
          description={
            companiesError ?? t("Verifique o link ou escolha outra empresa.")
          }
        />
        {/* <Link
          to="/cronograma/lista?tab=empresas"
          className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para empresas
        </Link> */}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("Novo apontamento")}
      subtitle={t("Preencha os dados essenciais.")}
    >
      <div className="space-y-4">
        {/* <Link
          to="/cronograma/lista?tab=empresas"
          className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para empresas
        </Link> */}

        <section className="space-y-2 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title={t("Empresa")} />
          {companiesError ? (
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
              {companiesError}
            </div>
          ) : null}
          <label className="space-y-2 text-sm font-semibold text-foreground">
            {/* <span>Empresa</span> */}
            <select
              value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-normal text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
            >
              <option value="" disabled>
                {t("Selecione uma empresa")}
              </option>
              {companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name ?? t("Empresa")}
                  {item.document ? ` (${item.document})` : ""}
                </option>
              ))}
            </select>
          </label>
          {/* {company ? (
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
          ) : (
            <div className="rounded-2xl border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-soft">
              Selecione uma empresa para continuar.
            </div>
          )} */}
        </section>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-border bg-white p-4 shadow-sm"
        >
          <SectionHeader title={t("Dados do apontamento")} />

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
              <span>{t("Inicio")}</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-normal text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                required
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>{t("Fim")}</span>
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
            {saving ? t("Salvando...") : t("Salvar apontamento")}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
