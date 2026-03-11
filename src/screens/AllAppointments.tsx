import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AppointmentFiltersPanel } from "../components/AppointmentFiltersPanel";
import { AppointmentCard } from "../components/AppointmentCard";
import { EmptyState } from "../components/EmptyState";
import { useAuth } from "../contexts/useAuth";
import { formatDateShort, isSameDay, startOfWeekMonday, addDays } from "../lib/date";
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
import {
  getCompaniesSnapshot,
  getScheduleSnapshot,
  getTodayAppointments,
  listPendingActions,
  listPendingAppointments,
} from "../storage/offlineSchedule";
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

const mergeAppointments = (base: Appointment[], extras: Appointment[]) => {
  const map = new Map<string, Appointment>();
  base.forEach((appointment) => map.set(appointment.id, appointment));
  extras.forEach((appointment) => {
    if (!map.has(appointment.id)) {
      map.set(appointment.id, appointment);
    }
  });
  return Array.from(map.values());
};

const filterAppointmentsForDate = (appointments: Appointment[], date: Date) =>
  appointments.filter((appointment) => isSameDay(new Date(appointment.startAt), date));

const filterAppointmentsByRange = (
  appointments: Appointment[],
  range: { startAt: string; endAt: string },
) => {
  const rangeStart = new Date(range.startAt);
  const rangeEnd = new Date(range.endAt);
  return appointments.filter((appointment) => {
    const start = new Date(appointment.startAt);
    const end = new Date(appointment.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }
    return start <= rangeEnd && end >= rangeStart;
  });
};

const toStringValue = (value: unknown) =>
  typeof value === "string" ? value : null;

const toNumberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const applyPendingActionsToAppointments = (
  appointments: Appointment[],
  pendingActions: Awaited<ReturnType<typeof listPendingActions>>,
) => {
  if (!pendingActions.length) return appointments;
  const actionsByAppointment = new Map<string, Awaited<ReturnType<typeof listPendingActions>>>();

  pendingActions.forEach((action) => {
    const list = actionsByAppointment.get(action.appointmentId) ?? [];
    list.push(action);
    actionsByAppointment.set(action.appointmentId, list);
  });

  return appointments.map((appointment) => {
    const actions = actionsByAppointment.get(appointment.id);
    if (!actions?.length) return appointment;

    const sorted = [...actions].sort((a, b) => a.createdAt - b.createdAt);
    const next = sorted.reduce<Appointment>((current, action) => {
      const changes = action.changes ?? {};
      if (action.actionType === "reschedule") {
        const startAt =
          toStringValue(changes.starts_at) ??
          toStringValue(changes.startAt) ??
          current.startAt;
        const endAt =
          toStringValue(changes.ends_at) ??
          toStringValue(changes.endAt) ??
          current.endAt;
        return {
          ...current,
          startAt,
          endAt,
        };
      }
      if (action.actionType === "checkIn") {
        return {
          ...current,
          status:
            (toStringValue(changes.status) as Appointment["status"]) ??
            "in_progress",
          checkInAt: toStringValue(changes.check_in_at) ?? current.checkInAt,
          checkInLat:
            toNumberValue(changes.check_in_lat) ?? current.checkInLat ?? null,
          checkInLng:
            toNumberValue(changes.check_in_lng) ?? current.checkInLng ?? null,
          checkInAccuracyM:
            toNumberValue(changes.check_in_accuracy_m) ??
            current.checkInAccuracyM ??
            null,
        };
      }
      if (action.actionType === "checkOut") {
        const hasNotes = Object.prototype.hasOwnProperty.call(changes, "notes");
        return {
          ...current,
          status:
            (toStringValue(changes.status) as Appointment["status"]) ?? "done",
          checkOutAt: toStringValue(changes.check_out_at) ?? current.checkOutAt,
          checkOutLat:
            toNumberValue(changes.check_out_lat) ?? current.checkOutLat ?? null,
          checkOutLng:
            toNumberValue(changes.check_out_lng) ?? current.checkOutLng ?? null,
          checkOutAccuracyM:
            toNumberValue(changes.check_out_accuracy_m) ??
            current.checkOutAccuracyM ??
            null,
          notes: hasNotes ? toStringValue(changes.notes) : current.notes ?? null,
          oportunidades: Array.isArray(changes.oportunidades)
            ? (changes.oportunidades as string[])
            : current.oportunidades,
        };
      }
      return {
        ...current,
        status:
          (toStringValue(changes.status) as Appointment["status"]) ?? "absent",
        absenceReason:
          toStringValue(changes.absence_reason) ?? current.absenceReason,
        absenceNote: toStringValue(changes.absence_note) ?? current.absenceNote,
      };
    }, appointment);

    return {
      ...next,
      pendingSync: true,
    };
  });
};

const mergeCompanyNames = (
  appointments: Appointment[],
  companies: { id: string; name: string }[],
) => {
  if (!companies.length) return appointments;
  const namesById = new Map(companies.map((company) => [company.id, company.name]));
  return appointments.map((appointment) => {
    if (appointment.companyName !== undefined && appointment.companyName !== null) {
      return appointment;
    }
    const name = namesById.get(appointment.companyId);
    if (!name) return appointment;
    return {
      ...appointment,
      companyName: name,
    };
  });
};

export default function AllAppointments() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [metaAppointments, setMetaAppointments] = useState<Appointment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingPage, setLoadingPage] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [usingCache, setUsingCache] = useState(false);
  const [statusFilters, setStatusFilters] = useState<AppointmentStatus[]>(
    () => [
      "em_execucao",
      "agendado",
      "expirado",
      "concluido",
      "atuado",
      "cancelado",
    ],
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
    const loadFromCache = async () => {
      setLoadingMeta(true);
      setError(null);
      const today = new Date();
      const startAt = startOfWeekMonday(today);
      const endAt = addDays(startAt, 6);
      endAt.setHours(23, 59, 59, 999);
      const range = {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      };

      const [
        todayCache,
        companiesCache,
        pendingAppointments,
        pendingActions,
        scheduleSnapshot,
      ] = await Promise.all([
        getTodayAppointments(userEmail),
        getCompaniesSnapshot(userEmail),
        listPendingAppointments(userEmail),
        listPendingActions(userEmail),
        getScheduleSnapshot(userEmail, range),
      ]);
      if (!active) return false;

      const snapshotAppointments = scheduleSnapshot?.appointments ?? [];
      const snapshotCompanies =
        scheduleSnapshot?.companies ?? companiesCache?.companies ?? [];
      const baseAppointments = snapshotAppointments.length
        ? mergeAppointments(snapshotAppointments, todayCache?.appointments ?? [])
        : todayCache?.appointments ?? [];
      const pendingInRange = scheduleSnapshot
        ? filterAppointmentsByRange(pendingAppointments, scheduleSnapshot.range)
        : filterAppointmentsForDate(pendingAppointments, today);
      const mergedAppointments = mergeAppointments(baseAppointments, pendingInRange);
      const appointmentsWithPending = applyPendingActionsToAppointments(
        mergedAppointments,
        pendingActions,
      );
      const withCompanyNames = mergeCompanyNames(
        appointmentsWithPending,
        snapshotCompanies,
      );

      if (!withCompanyNames.length) {
        setError(t("ui.sem_conexao_e_sem_cache_local"));
        setMetaAppointments([]);
        setAppointments([]);
        setLoadingMeta(false);
        setLoadingPage(false);
        setUsingCache(true);
        return false;
      }

      setMetaAppointments(withCompanyNames);
      setLoadingMeta(false);
      setUsingCache(true);
      return true;
    };
    const fetchMeta = async () => {
      setLoadingMeta(true);
      setError(null);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await loadFromCache();
        return;
      }
      const { data, error: requestError } = await supabase
        .from("apontamentos")
        .select(META_SELECT)
        .eq("consultant_name", userEmail)
        .order("starts_at", { ascending: true });
      if (!active) return;
      if (requestError) {
        const usedCache = await loadFromCache();
        if (!usedCache && active) {
          setError(requestError.message);
          setMetaAppointments([]);
          setAppointments([]);
          setLoadingMeta(false);
          setUsingCache(false);
        }
        return;
      }
      setMetaAppointments((data ?? []).map(mapAppointment));
      setUsingCache(false);
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
      if (!loadingMeta) {
        setAppointments([]);
        setLoadingPage(false);
      }
      return;
    }
    let active = true;
    const fetchPage = async () => {
      setLoadingPage(true);
      setError(null);
      if (usingCache) {
        const byId = new Map(metaAppointments.map((item) => [item.id, item]));
        const ordered = pagedIds
          .map((id) => byId.get(id))
          .filter((item): item is Appointment => Boolean(item));
        if (!active) return;
        setAppointments(ordered);
        setLoadingPage(false);
        return;
      }
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
  }, [metaAppointments, pagedIds, supabase, usingCache]);

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
        atuado: 0,
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

  const displaySummary = loadingMeta
    ? {
        total: 0,
        agendado: 0,
        expirado: 0,
        em_execucao: 0,
        concluido: 0,
        atuado: 0,
        cancelado: 0,
      }
    : summary;
  const displaySuggestionCount = loadingMeta ? 0 : suggestionCount;


  const handleOpenAppointment = (id: string) => {
    navigate(`/apontamentos/${id}`);
  };

  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;
  const showPagination = filteredMeta.length > PAGE_SIZE;

  return (
    <AppShell
      title={t("ui.agenda")}
      subtitle={t(
        "ui.todos_os_agendamentos_em_sequencia_unica_sem_agrupamento_por_data",
      )}
      rightSlot={showPagination ? t("ui.pagina_value", { value: page }) : undefined}
    >
      <div className="space-y-4">
        {error ? (
          <EmptyState
            title={t("ui.nao_foi_possivel_carregar")}
            description={error}
          />
        ) : (
          <div className="space-y-4">
            <AppointmentFiltersPanel
              title={t("ui.filtros")}
              subtitle={t("ui.distribuicao_por_status")}
              summary={displaySummary}
              filteredCount={filteredMeta.length}
              statusFilters={statusFilters}
              onChange={setStatusFilters}
              showSuggestions={showSuggestions}
              onToggleSuggestions={() =>
                setShowSuggestions((current) => !current)
              }
              suggestionCount={displaySuggestionCount}
            />

            <section className="space-y-3">
              {loadingMeta || loadingPage ? (
                <div className="space-y-4">
                  <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
                  <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
                  <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
                </div>
              ) : filteredMeta.length ? (
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

            {!loadingMeta && !loadingPage && showPagination ? (
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
