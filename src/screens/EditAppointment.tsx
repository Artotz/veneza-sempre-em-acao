import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { useAuth } from "../contexts/useAuth";
import { useSchedule } from "../state/useSchedule";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import {
  APPOINTMENT_SELECT,
  COMPANY_SELECT,
  mapAppointment,
  mapCompany,
} from "../lib/supabase";
import type { Appointment, Company } from "../lib/types";
import { isSameDay } from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentWindow,
} from "../lib/schedule";
import { savePendingAction } from "../storage/offlineSchedule";
import { t } from "../i18n";

const toLocalInputValue = (date: Date) => {
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const normalizeDateInput = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function EditAppointment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { user, loading: authLoading } = useAuth();
  const { selectors, state, actions } = useSchedule();
  const appointmentFromState = id ? selectors.getAppointment(id) : undefined;
  const companyFromState = appointmentFromState
    ? selectors.getCompany(appointmentFromState.companyId)
    : undefined;

  const [appointment, setAppointment] = useState<Appointment | null>(
    appointmentFromState ?? null,
  );
  const [company, setCompany] = useState<Company | null>(
    companyFromState ?? null,
  );
  const [loading, setLoading] = useState(!appointmentFromState);
  const [error, setError] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (appointmentFromState) {
      setAppointment(appointmentFromState);
    }
    if (companyFromState) {
      setCompany(companyFromState);
    }
  }, [appointmentFromState, companyFromState]);

  useEffect(() => {
    if (!appointment || initialized) return;
    setStartsAt(toLocalInputValue(new Date(appointment.startAt)));
    setEndsAt(toLocalInputValue(new Date(appointment.endAt)));
    setInitialized(true);
  }, [appointment, initialized]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateStatus = () => setIsOnline(navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    if (authLoading) return;
    if (appointmentFromState) {
      setError(null);
      setAppointment(appointmentFromState);
      if (companyFromState) {
        setCompany(companyFromState);
      }
      setLoading(false);
      return;
    }
    if (state.loading) {
      return;
    }
    if (!isOnline) {
      setError(null);
      setLoading(false);
      return;
    }
    const userEmail = user?.email?.trim();
    if (!userEmail) {
      setError(t("ui.usuario_nao_autenticado"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: requestError } = await supabase
      .from("apontamentos")
      .select(`${APPOINTMENT_SELECT}, companies(${COMPANY_SELECT})`)
      .eq("id", id)
      .eq("consultant_name", userEmail)
      .maybeSingle();

    if (requestError) {
      setError(requestError.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setError(t("ui.agendamento_nao_encontrado_2"));
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
    setLoading(false);
  }, [
    appointmentFromState,
    authLoading,
    companyFromState,
    id,
    isOnline,
    state.loading,
    supabase,
    user?.email,
  ]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (!appointment && loading) {
    return (
      <AppShell
        title={t("ui.editar_visita")}
        subtitle={t("ui.carregando_detalhes")}
      >
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-3xl bg-surface-muted" />
          <div className="h-32 animate-pulse rounded-3xl bg-surface-muted" />
        </div>
      </AppShell>
    );
  }

  if (!appointment) {
    return (
      <AppShell
        title={t("ui.editar_visita")}
        subtitle={t("ui.detalhe_do_atendimento")}
      >
        <EmptyState
          title={t("ui.agendamento_nao_encontrado")}
          description={
            error ?? t("ui.volte_para_o_dia_e_selecione_outro_horario")
          }
        />
      </AppShell>
    );
  }

  const status = getAppointmentStatus(appointment);
  const isEditable = status === "agendado";
  const companyId = appointment.companyId;
  const fallbackCompany: Company | null = companyId
    ? {
        id: companyId,
        name: appointment.companyName ?? t("ui.empresa"),
      }
    : null;
  const selectedCompany =
    company ??
    state.companies.find((item) => item.id === companyId) ??
    fallbackCompany;
  const companyOptions = selectedCompany
    ? [
        selectedCompany,
        ...state.companies.filter((item) => item.id !== selectedCompany.id),
      ]
    : state.companies;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isEditable) {
      setError(t("ui.edicao_disponivel_apenas_para_agendados"));
      return;
    }

    if (!startsAt || !endsAt) {
      setError(t("ui.preencha_inicio_e_fim"));
      return;
    }

    const startsAtDate = normalizeDateInput(startsAt);
    const endsAtDate = normalizeDateInput(endsAt);
    if (!startsAtDate || !endsAtDate) {
      setError(t("ui.datas_invalidas"));
      return;
    }

    if (endsAtDate <= startsAtDate) {
      setError(t("ui.fim_precisa_ser_depois_do_inicio"));
      return;
    }

    const originalDate = new Date(appointment.startAt);
    if (
      !isSameDay(startsAtDate, originalDate) ||
      !isSameDay(endsAtDate, originalDate)
    ) {
      setError(t("ui.edicao_apenas_para_horarios_no_mesmo_dia"));
      return;
    }

    const conflict = state.appointments.find((item) => {
      if (item.id === appointment.id) return false;
      if (
        getAppointmentStatus(item) === "cancelado" ||
        !isSameDay(new Date(item.startAt), startsAtDate)
      ) {
        return false;
      }
      const { start: existingStart, end: existingEnd } =
        getAppointmentWindow(item);
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
        t("ui.conflito_de_horario_ja_existe_um_apontamento_em_window", {
          window: formatAppointmentWindow(conflict),
        }),
      );
      return;
    }

    const userEmail = user?.email?.trim();
    if (!userEmail) {
      setError(t("ui.email_do_usuario_nao_encontrado"));
      return;
    }

    setSaving(true);
    const changes = {
      starts_at: startsAtDate.toISOString(),
      ends_at: endsAtDate.toISOString(),
    };

    await actions.reschedule(appointment.id, {
      startAt: changes.starts_at,
      endAt: changes.ends_at,
    });

    if (!isOnline) {
      await savePendingAction({
        userEmail,
        appointmentId: appointment.id,
        actionType: "reschedule",
        changes,
      });
      actions.setPendingSync(appointment.id, true);
      setSaving(false);
      navigate(`/apontamentos/${appointment.id}`, { replace: true });
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from("apontamentos")
        .update(changes)
        .eq("id", appointment.id)
        .select("id")
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      actions.setPendingSync(appointment.id, false);
      setSaving(false);
      navigate(`/apontamentos/${appointment.id}`, { replace: true });
    } catch (updateError) {
      await savePendingAction({
        userEmail,
        appointmentId: appointment.id,
        actionType: "reschedule",
        changes,
      });
      actions.setPendingSync(appointment.id, true);
      setSaving(false);
      setError(t("ui.alteracao_salva_pendente_para_sincronizar"));
    }
  };

  if (!isEditable) {
    return (
      <AppShell
        title={t("ui.editar_visita")}
        subtitle={t("ui.detalhe_do_atendimento")}
      >
        <EmptyState
          title={t("ui.edicao_disponivel_apenas_para_agendados")}
          description={t("ui.volte_para_o_dia_e_selecione_outro_horario")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("ui.editar_visita")}
      subtitle={t("ui.atualize_os_horarios_do_apontamento")}
    >
      <div className="space-y-4">
        <section className="space-y-2 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title={t("ui.empresa")} />
          <label className="space-y-2 text-sm font-semibold text-foreground">
            <select
              value={companyId}
              disabled
              className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-normal text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10 disabled:opacity-80"
            >
              <option value="" disabled>
                {t("ui.selecione_uma_empresa")}
              </option>
              {companyOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name ?? t("ui.empresa")}
                  {item.document ? ` (${item.document})` : ""}
                </option>
              ))}
            </select>
          </label>
        </section>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-border bg-white p-4 shadow-sm"
        >
          <SectionHeader title={t("ui.dados_do_apontamento")} />

          {error ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {/* <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-xs text-foreground-soft">
            {t("ui.edite_apenas_os_horarios_do_apontamento")}
          </div> */}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>{t("ui.inicio")}</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-normal text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                required
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>{t("ui.fim")}</span>
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
            {saving ? t("ui.salvando") : t("ui.salvar_alteracoes")}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
