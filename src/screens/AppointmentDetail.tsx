import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { StatusBadge } from "../components/StatusBadge";
import {
  formatDateShort,
  formatTime,
  isSameDay,
} from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  isBlocked,
  isPending,
  sortByStart,
} from "../lib/schedule";
import { useCamera } from "../hooks/useCamera";
import { useGeo } from "../hooks/useGeo";
import { useSchedule } from "../state/ScheduleContext";

const quickReasons = [
  "Cliente solicitou remarcacao",
  "Endereco fechado",
  "Equipamento indisponivel",
];

export default function AppointmentDetail() {
  const { id } = useParams();
  const { state, selectors, actions } = useSchedule();
  const appointment = id ? selectors.getAppointment(id) : undefined;
  const company = appointment
    ? selectors.getCompany(appointment.companyId)
    : undefined;

  const geo = useGeo();
  const camera = useCamera();

  const [absenceReason, setAbsenceReason] = useState("");

  const dayAppointments = useMemo(() => {
    if (!appointment) return [];
    const target = new Date(appointment.startAt);
    return state.appointments
      .filter((item) => isSameDay(new Date(item.startAt), target))
      .sort(sortByStart);
  }, [appointment, state.appointments]);

  if (!appointment) {
    return (
      <AppShell title="Agendamento" subtitle="Detalhe do atendimento.">
        <EmptyState
          title="Agendamento nao encontrado"
          description="Volte para o dia e selecione outro horario."
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
    !blocked &&
    isPending(appointment) &&
    !appointment.checkInAt &&
    !appointment.absenceReason;
  const canCheckOut =
    !blocked &&
    isPending(appointment) &&
    !!appointment.checkInAt &&
    !appointment.absenceReason;
  const canAbsence =
    !blocked && !appointment.checkOutAt && !appointment.absenceReason;

  const handleCheckIn = async () => {
    if (!canCheckIn) return;
    await actions.checkIn(appointment.id);
  };

  const handleCheckOut = async () => {
    if (!canCheckOut) return;
    await actions.checkOut(appointment.id);
  };

  const handleAbsence = async () => {
    if (!canAbsence) return;
    const reason = absenceReason.trim() || "Ausencia nao informada";
    await actions.justifyAbsence(appointment.id, reason);
    setAbsenceReason("");
  };

  return (
    <AppShell title="Detalhe do agendamento" subtitle="Acoes mockadas no dispositivo.">
      <div className="space-y-4">
        <Link
          to="/cronograma/dia"
          className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-soft"
        >
          ← Voltar para o dia
        </Link>

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground-soft">
                {dayLabel} · {formatAppointmentWindow(appointment)}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">
                {appointment.title}
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">
                {company?.name ?? "Empresa"} · {appointment.city}
              </p>
            </div>
            <StatusBadge status={status} />
          </div>

          <div className="mt-3 space-y-2 text-sm text-foreground-muted">
            <div className="flex items-center justify-between">
              <span>Consultor</span>
              <span className="font-semibold text-foreground">
                {appointment.consultant}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Endereco</span>
              <span className="font-semibold text-foreground">
                {appointment.address}
              </span>
            </div>
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
                {appointment.absenceReason ?? "Nenhuma"}
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title="Acoes" subtitle="Disponiveis apenas em memoria." />
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
                {quickReasons.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setAbsenceReason(reason)}
                    className="rounded-full border border-border bg-white px-3 py-1 text-[10px] font-semibold text-foreground-soft"
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <textarea
                value={absenceReason}
                onChange={(event) => setAbsenceReason(event.target.value)}
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
          <SectionHeader title="Recursos mockados" />
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

