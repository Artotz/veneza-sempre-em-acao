import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { useAuth } from "../contexts/useAuth";
import { buildMonthWeeks, formatDateShort, formatMonthYear } from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentTitle,
  isBlocked,
  sortByStart,
} from "../lib/schedule";
import { COMPANY_SELECT, mapCompany } from "../lib/supabase";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { Appointment, Company } from "../lib/types";
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

      const isOffline =
        typeof navigator !== "undefined" && !navigator.onLine;
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

  const companyDisplayName =
    company?.name ??
    orderedAppointments[0]?.companyName ??
    "Empresa";

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
          ) : orderedAppointments.length ? (
            <div className="space-y-3">
              {state.error ? (
                <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
                  {state.error}
                </div>
              ) : null}
              {orderedAppointments.map((appointment) => {
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
                    onClick={() => handleOpenAppointment(appointment.id)}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Sem apontamentos"
              description="Nenhum apontamento encontrado para este mes."
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}
