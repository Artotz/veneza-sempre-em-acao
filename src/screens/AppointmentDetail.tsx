import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateShort, formatTime, isSameDay } from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentTitle,
  isBlocked,
  sortByStart,
} from "../lib/schedule";
import { useCamera } from "../hooks/useCamera";
import { useGeo } from "../hooks/useGeo";
import { useSchedule } from "../state/useSchedule";
import {
  APPOINTMENT_SELECT,
  COMPANY_SELECT,
  absenceReasonLabels,
  mapAppointment,
  mapCompany,
} from "../lib/supabase";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { Appointment, Company } from "../lib/types";

const absenceOptions = [
  { label: "Cliente solicitou remarcacao", value: "client_requested_reschedule" },
  { label: "Endereco fechado", value: "address_closed" },
  { label: "Equipamento indisponivel", value: "equipment_unavailable" },
  { label: "Outro", value: "other" },
];

export default function AppointmentDetail() {
  const { id } = useParams();
  const { state, selectors, actions } = useSchedule();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const appointmentFromState = id ? selectors.getAppointment(id) : undefined;
  const companyFromState = appointmentFromState
    ? selectors.getCompany(appointmentFromState.companyId)
    : undefined;

  const [appointment, setAppointment] = useState<Appointment | null>(
    appointmentFromState ?? null
  );
  const [company, setCompany] = useState<Company | null>(
    companyFromState ?? null
  );
  const [loading, setLoading] = useState(!appointmentFromState);
  const [error, setError] = useState<string | null>(null);
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceNote, setAbsenceNote] = useState("");

  const geo = useGeo();
  const camera = useCamera();

  useEffect(() => {
    if (appointmentFromState) {
      setAppointment(appointmentFromState);
    }
    if (companyFromState) {
      setCompany(companyFromState);
    }
  }, [appointmentFromState, companyFromState]);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data, error: requestError } = await supabase
      .from("apontamentos")
      .select(`${APPOINTMENT_SELECT}, companies(${COMPANY_SELECT})`)
      .eq("id", id)
      .maybeSingle();

    if (requestError) {
      setError(requestError.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setError("Agendamento nao encontrado.");
      setLoading(false);
      return;
    }

    const mappedAppointment = mapAppointment(data);
    const rawCompany = Array.isArray(data.companies)
      ? data.companies[0]
      : data.companies;
    const mappedCompany = rawCompany ? mapCompany(rawCompany) : null;

    setAppointment(mappedAppointment);
    setCompany(mappedCompany);
    setAbsenceReason(mappedAppointment.absenceReason ?? "");
    setAbsenceNote(mappedAppointment.absenceNote ?? "");
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const dayAppointments = useMemo(() => {
    if (!appointment) return [];
    const target = new Date(appointment.startAt);
    return state.appointments
      .filter((item) => isSameDay(new Date(item.startAt), target))
      .sort(sortByStart);
  }, [appointment, state.appointments]);

  if (!appointment && loading) {
    return (
      <AppShell title="Agendamento" subtitle="Carregando detalhes.">
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-32 animate-pulse rounded-3xl bg-surface-muted" />
        </div>
      </AppShell>
    );
  }

  if (!appointment) {
    return (
      <AppShell title="Agendamento" subtitle="Detalhe do atendimento.">
        <EmptyState
          title="Agendamento nao encontrado"
          description={error ?? "Volte para o dia e selecione outro horario."}
        />
        <Link
          to="/cronograma/dia"
          className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para o dia
        </Link>
      </AppShell>
    );
  }

  const status = getAppointmentStatus(appointment);
  const blocked = isBlocked(appointment, dayAppointments);
  const busy = state.busyIds.includes(appointment.id);
  const dayLabel = formatDateShort(new Date(appointment.startAt));
  const canCheckIn =
    !blocked && (appointment.status ?? "scheduled") === "scheduled";
  const canCheckOut =
    !blocked && (appointment.status ?? "scheduled") === "in_progress";
  const canAbsence =
    !blocked &&
    (appointment.status ?? "scheduled") !== "done" &&
    (appointment.status ?? "scheduled") !== "absent";

  const handleCheckIn = async () => {
    if (!canCheckIn) return;
    try {
      await actions.checkIn(appointment.id);
      await loadDetail();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Nao foi possivel registrar o check-in."
      );
    }
  };

  const handleCheckOut = async () => {
    if (!canCheckOut) return;
    try {
      await actions.checkOut(appointment.id);
      await loadDetail();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Nao foi possivel registrar o check-out."
      );
    }
  };

  const handleAbsence = async () => {
    if (!canAbsence) return;
    const reason = absenceReason.trim() || "other";
    try {
      await actions.justifyAbsence(appointment.id, reason, absenceNote.trim());
      await loadDetail();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Nao foi possivel registrar a ausencia."
      );
    }
  };

  const locationLabel = [company?.city, company?.state].filter(Boolean).join(" - ");

  const absenceLabel =
    absenceReasonLabels[appointment.absenceReason ?? ""] ??
    appointment.absenceReason ??
    "Nenhuma";

  return (
    <AppShell
      title="Detalhe do agendamento"
      subtitle={getAppointmentTitle(appointment)}
    >
      <div className="space-y-4">
        <Link
          to="/cronograma/dia"
          className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para o dia
        </Link>

        {error ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground-soft">
                {dayLabel} - {formatAppointmentWindow(appointment)}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">
                {company?.name ?? "Empresa"}
              </h2>
              {company?.document ? (
                <p className="mt-1 text-sm text-foreground-muted">
                  {company.document}
                </p>
              ) : null}
            </div>
            <StatusBadge status={status} />
          </div>

          <div className="mt-3 space-y-2 text-sm text-foreground-muted">
            <div className="flex items-center justify-between">
              <span>Consultor</span>
              <span className="font-semibold text-foreground">
                {appointment.consultant || "Nao informado"}
              </span>
            </div>
            {locationLabel ? (
              <div className="flex items-center justify-between">
                <span>Local</span>
                <span className="font-semibold text-foreground">
                  {locationLabel}
                </span>
              </div>
            ) : null}
          </div>

          {blocked ? (
            <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              Este agendamento esta bloqueado. Conclua o pendente anterior no
              mesmo dia para liberar as acoes.
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title="Linha do tempo" />
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
              <span className="text-foreground-soft">Check-in</span>
              <span className="font-semibold text-foreground">
                {appointment.checkInAt
                  ? formatTime(new Date(appointment.checkInAt))
                  : "Nao realizado"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
              <span className="text-foreground-soft">Check-out</span>
              <span className="font-semibold text-foreground">
                {appointment.checkOutAt
                  ? formatTime(new Date(appointment.checkOutAt))
                  : "Nao realizado"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-surface-muted px-3 py-2">
              <span className="text-foreground-soft">Ausencia</span>
              <span className="font-semibold text-foreground">
                {absenceLabel}
              </span>
            </div>
            {appointment.absenceNote ? (
              <div className="rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground-muted">
                {appointment.absenceNote}
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title="Acoes" subtitle="Sincroniza com o Supabase." />
          <div className="grid gap-2">
            <button
              type="button"
              disabled={!canCheckIn || busy}
              onClick={handleCheckIn}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                canCheckIn && !busy
                  ? "bg-success text-white"
                  : "cursor-not-allowed bg-surface-muted text-foreground-muted"
              }`}
            >
              Fazer check-in
            </button>
            <button
              type="button"
              disabled={!canCheckOut || busy}
              onClick={handleCheckOut}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                canCheckOut && !busy
                  ? "bg-info text-white"
                  : "cursor-not-allowed bg-surface-muted text-foreground-muted"
              }`}
            >
              Fazer check-out
            </button>
            <div className="rounded-2xl border border-border bg-surface-muted p-3">
              <p className="text-xs font-semibold text-foreground">
                Justificar ausencia
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {absenceOptions.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    onClick={() => setAbsenceReason(reason.value)}
                    className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                      absenceReason === reason.value
                        ? "border-accent bg-white text-foreground"
                        : "border-border bg-white text-foreground-soft"
                    }`}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
              <textarea
                value={absenceNote}
                onChange={(event) => setAbsenceNote(event.target.value)}
                placeholder="Descreva o motivo..."
                className="mt-3 w-full resize-none rounded-2xl border border-border bg-white px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
                rows={3}
              />
              <button
                type="button"
                disabled={!canAbsence || busy}
                onClick={handleAbsence}
                className={`mt-3 w-full rounded-2xl px-4 py-2 text-xs font-semibold transition ${
                  canAbsence && !busy
                    ? "bg-danger text-white"
                    : "cursor-not-allowed bg-white text-foreground-muted"
                }`}
              >
                Registrar ausencia
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title="Recursos (placeholders)" />
          <div className="mt-3 space-y-2 text-xs text-foreground-muted">
            <div className="flex items-center justify-between">
              <span>Geo (mock)</span>
              <span className="font-semibold text-foreground">
                {geo.position.lat.toFixed(2)}, {geo.position.lng.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Camera (mock)</span>
              <span className="font-semibold text-foreground">
                {camera.status}
              </span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
