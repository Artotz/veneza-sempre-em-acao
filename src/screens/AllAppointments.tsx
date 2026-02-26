import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentCard } from "../components/AppointmentCard";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusFilters } from "../components/StatusFilters";
import { useAuth } from "../contexts/useAuth";
import { formatDateShort } from "../lib/date";
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
import { APPOINTMENT_LIST_SELECT, mapAppointment } from "../lib/supabase";
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

const PAGE_SIZE = 20;
const META_SELECT =
  "id, company_id, consultant_name, created_by, starts_at, ends_at, status, check_in_at, check_out_at, absence_reason";

export default function AllAppointments() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [metaAppointments, setMetaAppointments] = useState<Appointment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(
    () => ["em_execucao", "agendado"],
  );
  const [showSuggestions, setShowSuggestions] = useState(false);

  const userEmail = user?.email?.trim() ?? null;

  useEffect(() => {
    setPage(1);
  }, [showSuggestions, statusFilters, userEmail]);

  useEffect(() => {
    if (authLoading) return;
    if (!userEmail) {
      setMetaAppointments([]);
      setAppointments([]);
      setError(t("ui.email_do_usuario_nao_encontrado"));
      return;
    }
    let active = true;
    const fetchMeta = async () => {
      setLoadingMeta(true);
      setError(null);
      const { data, error: requestError } = await supabase
        .from("apontamentos")
        .select(META_SELECT)
        .eq("consultant_name", userEmail)
        .order("starts_at", { ascending: true });
      if (!active) return;
      if (requestError) {
        setError(requestError.message);
        setMetaAppointments([]);
        setAppointments([]);
        setLoadingMeta(false);
        return;
      }
      setMetaAppointments((data ?? []).map(mapAppointment));
      setLoadingMeta(false);
    };
    void fetchMeta();
    return () => {
      active = false;
    };
  }, [authLoading, supabase, userEmail]);

  const orderedMeta = useMemo(
    () => [...metaAppointments].sort(sortByStart),
    [metaAppointments],
  );

  const filteredMeta = useMemo(() => {
    if (statusFilters.length === 0 && !showSuggestions) return [];
    return orderedMeta.filter((appointment) => {
      const matchesStatus = statusFilters.includes(
        getAppointmentStatus(appointment),
      );
      const matchesSuggestion =
        showSuggestions && isSuggested(appointment, user?.email);
      return matchesStatus || matchesSuggestion;
    });
  }, [orderedMeta, showSuggestions, statusFilters, user?.email]);

  const totalPages = Math.max(1, Math.ceil(filteredMeta.length / PAGE_SIZE));
  const pagedIds = useMemo(() => {
    if (filteredMeta.length <= PAGE_SIZE) {
      return filteredMeta.map((appointment) => appointment.id);
    }
    const start = (page - 1) * PAGE_SIZE;
    return filteredMeta
      .slice(start, start + PAGE_SIZE)
      .map((appointment) => appointment.id);
  }, [filteredMeta, page]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!pagedIds.length) {
      setAppointments([]);
      return;
    }
    let active = true;
    const fetchPage = async () => {
      setLoadingPage(true);
      setError(null);
      const { data, error: requestError } = await supabase
        .from("apontamentos")
        .select(`${APPOINTMENT_LIST_SELECT}, companies(name)`)
        .in("id", pagedIds)
        .order("starts_at", { ascending: true });
      if (!active) return;
      if (requestError) {
        setError(requestError.message);
        setAppointments([]);
        setLoadingPage(false);
        return;
      }
      const mapped = (data ?? []).map(mapAppointment);
      const byId = new Map(mapped.map((item) => [item.id, item]));
      const ordered = pagedIds
        .map((id) => byId.get(id))
        .filter((item): item is Appointment => Boolean(item));
      setAppointments(ordered);
      setLoadingPage(false);
    };
    void fetchPage();
    return () => {
      active = false;
    };
  }, [pagedIds, supabase]);

  const dayGroups = useMemo(
    () => buildDayGroups(appointments),
    [appointments],
  );

  const summary = useMemo(() => {
    return metaAppointments.reduce(
      (acc, appointment) => {
        acc[getAppointmentStatus(appointment)] += 1;
        return acc;
      },
      {
        total: metaAppointments.length,
        agendado: 0,
        expirado: 0,
        em_execucao: 0,
        concluido: 0,
        cancelado: 0,
      },
    );
  }, [metaAppointments]);

  const suggestionCount = useMemo(
    () =>
      metaAppointments.filter((appointment) =>
        isSuggested(appointment, user?.email),
      ).length,
    [metaAppointments, user?.email],
  );

  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;
  const showPagination = filteredMeta.length > PAGE_SIZE;
  const isLoading = loadingMeta || loadingPage;

  return (
    <AppShell
      title={t("ui.agenda")}
      subtitle={t(
        "ui.todos_os_agendamentos_em_sequencia_unica_sem_agrupamento_por_data",
      )}
      rightSlot={showPagination ? t("ui.pagina_value", { value: page }) : undefined}
    >
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          </div>
        ) : error ? (
          <EmptyState
            title={t("ui.nao_foi_possivel_carregar")}
            description={error}
          />
        ) : (
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
              {filteredMeta.length ? (
                appointments.map((appointment) => {
                  const companyName =
                    appointment.companyName ?? t("ui.empresa");
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

            {showPagination ? (
              <section className="flex items-center justify-between rounded-3xl border border-border bg-white p-4 shadow-sm">
                <button
                  type="button"
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!canGoPrev}
                >
                  {t("ui.pagina_anterior")}
                </button>
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("ui.paginacao_label", { current: page, total: totalPages })}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!canGoNext}
                >
                  {t("ui.proxima_pagina")}
                </button>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}
