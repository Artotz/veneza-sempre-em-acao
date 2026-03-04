import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { SectionHeader } from "../components/SectionHeader";
import { useAuth } from "../contexts/useAuth";
import { useSchedule } from "../state/useSchedule";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { COMPANY_LIST_SELECT, mapCompany } from "../lib/supabase";
import type { Company } from "../lib/types";
import {
  getCompaniesSnapshot,
  saveCompaniesSnapshot,
  savePendingAppointment,
} from "../storage/offlineSchedule";
import { formatDateShort, isSameDay } from "../lib/date";
import {
  formatAppointmentWindow,
  getAppointmentStatus,
  getAppointmentWindow,
} from "../lib/schedule";
import { t } from "../i18n";

const buildAddressSnapshot = (company: Company): string | null => {
  if (company.lat == null || company.lng == null) return null;
  const lat = Number(company.lat);
  const lng = Number(company.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return t("ui.empresa_georreferenciada_lat_lng_lat_lng", {
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

const sanitizeDurationInput = (value: string) => value.replace(/[^\d]/g, "");

const parseDurationMinutes = (value: string) => {
  const trimmed = sanitizeDurationInput(value);
  if (!trimmed) return null;
  const minutes = Number(trimmed);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
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
  const [companyQuery, setCompanyQuery] = useState("");
  const [debouncedCompanyQuery, setDebouncedCompanyQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isForaCarteira, setIsForaCarteira] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");

  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const loadCompanies = async () => {
      if (authLoading) return;
      setCompaniesLoading(true);
      setCompaniesError(null);
      const userEmail = user?.email?.trim();
      if (!userEmail) {
        setCompaniesError(t("ui.usuario_nao_autenticado"));
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
          setCompaniesError(t("ui.sem_conexao_e_sem_cache_local"));
          setCompaniesLoading(false);
          return;
        }
        setCompanies(cached.companies);
        setCompaniesLoading(false);
        return;
      }

      const { data, error: companyError } = await supabase
        .from("companies")
        .select(COMPANY_LIST_SELECT)
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
    if (startsAt) return;
    const now = new Date();
    const startValue = toLocalInputValue(now);
    setStartsAt(startValue);
    setDurationMinutes("60");
  }, [startsAt]);

  const filterCompanies = (
    items: Company[],
    term: string,
    shouldUseForaCarteira: boolean,
  ) => {
    const trimmed = term.trim().toLowerCase();
    const scoped = items.filter(
      (item) => Boolean(item.foraCarteira) === shouldUseForaCarteira,
    );
    if (!trimmed) return scoped;
    return items.filter((item) => {
      if (Boolean(item.foraCarteira) !== shouldUseForaCarteira) return false;
      const name = item.name?.toLowerCase() ?? "";
      const document = item.document?.toLowerCase() ?? "";
      return name.includes(trimmed) || document.includes(trimmed);
    });
  };

  const company =
    companies.find((item) => item.id === selectedCompanyId) ?? null;

  const filteredCompanies = useMemo(() => {
    const filtered = filterCompanies(
      companies,
      debouncedCompanyQuery,
      isForaCarteira,
    );
    if (!company || filtered.some((item) => item.id === company.id)) {
      return filtered;
    }
    return [company, ...filtered];
  }, [companies, company, debouncedCompanyQuery, isForaCarteira]);

  useEffect(() => {
    const handle = setTimeout(
      () => {
        setDebouncedCompanyQuery(companyQuery);
      },
      companyQuery.trim().length ? 300 : 0,
    );
    return () => clearTimeout(handle);
  }, [companyQuery]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    if (companiesLoading) return;
    const stillVisible = filteredCompanies.some(
      (item) => item.id === selectedCompanyId,
    );
    if (!stillVisible) {
      setSelectedCompanyId("");
    }
  }, [companiesLoading, filteredCompanies, selectedCompanyId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const normalizedNewCompanyName = newCompanyName.trim();
    const shouldCreateCompany =
      isForaCarteira && normalizedNewCompanyName.length > 0;

    if (isForaCarteira && !selectedCompanyId && !shouldCreateCompany) {
      setError(t("ui.selecione_ou_informe_empresa_fora_carteira"));
      return;
    }
    if (!isForaCarteira && !selectedCompanyId) {
      setError(t("ui.empresa_nao_encontrada_2"));
      return;
    }
    if (!isForaCarteira && !company) {
      setError(t("ui.empresa_nao_encontrada_2"));
      return;
    }

    if (!startsAt) {
      setError(t("ui.preencha_inicio"));
      return;
    }

    const userEmail = user?.email?.trim();
    if (!userEmail) {
      setError(t("ui.email_do_usuario_nao_encontrado"));
      return;
    }

    const parsedDuration = parseDurationMinutes(durationMinutes);
    if (!parsedDuration) {
      setError(t("ui.duracao_precisa_ser_maior_que_zero"));
      return;
    }

    const startsAtDate = new Date(startsAt);
    const endsAtDate = new Date(
      startsAtDate.getTime() + parsedDuration * 60 * 1000,
    );

    if (
      Number.isNaN(startsAtDate.getTime()) ||
      Number.isNaN(endsAtDate.getTime())
    ) {
      setError(t("ui.datas_invalidas"));
      return;
    }

    if (!isSameDay(startsAtDate, endsAtDate)) {
      setError(t("ui.inicio_e_fim_precisam_ser_no_mesmo_dia"));
      return;
    }

    const now = new Date();
    const nowMs = now.getTime();
    const toleranceMs = 5 * 60 * 1000;
    if (startsAtDate.getTime() < nowMs - toleranceMs) {
      setError(t("ui.inicio_nao_pode_ser_menor_que_agora_5_min_de_tolerancia"));
      return;
    }

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (shouldCreateCompany && isOffline) {
      setError(t("ui.sem_internet_para_cadastrar_empresa_fora_carteira"));
      return;
    }
    if (isOffline) {
      const isTodayStart = isSameDay(startsAtDate, now);
      if (!isTodayStart) {
        setError(
          t("ui.sem_conexao_so_e_possivel_criar_apontamentos_para_hoje_date", {
            date: formatDateShort(now),
          }),
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
      const { start: existingStart, end: existingEnd } =
        getAppointmentWindow(appointment);
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

    setSaving(true);
    let companyForAppointment = company;
    let resolvedCompanyId = selectedCompanyId;

    if (shouldCreateCompany) {
      const { data: createdCompany, error: createError } = await supabase
        .from("companies")
        .insert({
          name: normalizedNewCompanyName,
          document: null,
          email_csa: userEmail,
          fora_carteira: true,
        })
        .select("id, document, name, state, lat, lng, csa, email_csa")
        .single();

      if (createError || !createdCompany?.id) {
        setSaving(false);
        setError(
          createError?.message ?? t("ui.nao_foi_possivel_criar_a_empresa"),
        );
        return;
      }

      const newCompany: Company = {
        id: createdCompany.id,
        name: createdCompany.name,
        document: createdCompany.document ?? null,
        state: createdCompany.state ?? null,
        lat: createdCompany.lat ?? null,
        lng: createdCompany.lng ?? null,
        csa: createdCompany.csa ?? null,
        emailCsa: createdCompany.email_csa ?? null,
        foraCarteira: true,
      };
      companyForAppointment = newCompany;
      resolvedCompanyId = createdCompany.id;
    }

    if (!companyForAppointment || !resolvedCompanyId) {
      setSaving(false);
      setError(t("ui.empresa_nao_encontrada_2"));
      return;
    }

    const addressSnapshot = buildAddressSnapshot(companyForAppointment);

    if (isOffline) {
      const nowIso = new Date().toISOString();
      const localAppointmentId = generateLocalAppointmentId();
      await savePendingAppointment(userEmail, {
        id: localAppointmentId,
        companyId: resolvedCompanyId,
        companyName: companyForAppointment.name ?? null,
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
      navigate(`/apontamentos/${localAppointmentId}`, { replace: true });
      return;
    }

    const { data: insertData, error: insertError } = await supabase
      .from("apontamentos")
      .insert({
        company_id: resolvedCompanyId,
        starts_at: startsAtDate.toISOString(),
        ends_at: endsAtDate.toISOString(),
        consultant_id: user?.id ?? null,
        consultant_name: userEmail,
        created_by: userEmail,
        status: "scheduled",
        address_snapshot: addressSnapshot,
      })
      .select("id")
      .single();

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (!insertData?.id) {
      setError(t("ui.nao_foi_possivel_criar_o_apontamento"));
      return;
    }

    await actions.refresh();
    navigate(`/apontamentos/${insertData.id}`, { replace: true });
  };

  if (companiesLoading) {
    return (
      <AppShell
        title={t("ui.novo_apontamento")}
        subtitle={t("ui.carregando_empresa")}
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
        title={t("ui.novo_apontamento")}
        subtitle={t("ui.empresa_nao_encontrada_2")}
      >
        <EmptyState
          title={t("ui.empresa_nao_encontrada")}
          description={
            companiesError ?? t("ui.verifique_o_link_ou_escolha_outra_empresa")
          }
        />
        {/* <Link
          to="/empresas"
          className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para empresas
        </Link> */}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("ui.novo_apontamento")}
      subtitle={t("ui.preencha_os_dados_essenciais")}
    >
      <div className="space-y-4">
        {/* <Link
          to="/empresas"
          className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-soft"
        >
          Voltar para empresas
        </Link> */}

        <section className="space-y-2 rounded-3xl border border-border bg-white p-4 shadow-sm">
          <SectionHeader title={t("ui.empresa")} />
          {companiesError ? (
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground-soft">
              {companiesError}
            </div>
          ) : null}
          <label className="flex w-full items-center justify-between gap-3 text-xs font-semibold text-foreground">
            <span>{t("ui.fora_carteira")}</span>
            <input
              type="checkbox"
              checked={isForaCarteira}
              onChange={(event) => {
                const checked = event.target.checked;
                setIsForaCarteira(checked);
                if (!checked) {
                  setNewCompanyName("");
                }
              }}
              className="h-4 w-4 accent-accent"
            />
          </label>
          {/* {isForaCarteira ? (
            <p className="text-[11px] text-foreground-muted">
              {t("ui.selecione_ou_informe_empresa_fora_carteira")}
            </p>
          ) : null} */}
          <div className="space-y-2">
            <SectionHeader
              title={t("ui.busca_rapida")}
              subtitle={t("ui.nome_ou_documento")}
            />
            <input
              value={companyQuery}
              onChange={(event) => setCompanyQuery(event.target.value)}
              placeholder={t("ui.buscar_empresa")}
              className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
            />
          </div>
          <label className="space-y-2 text-sm font-semibold text-foreground">
            {/* <span>Empresa</span> */}
            <select
              value={selectedCompanyId}
              onChange={(event) => {
                setSelectedCompanyId(event.target.value);
                if (isForaCarteira) {
                  setNewCompanyName("");
                }
              }}
              className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-normal text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
            >
              <option value="" disabled>
                {filteredCompanies.length
                  ? t("ui.selecione_uma_empresa")
                  : t("ui.nenhuma_empresa_encontrada")}
              </option>
              {filteredCompanies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name ?? t("ui.empresa")}
                  {item.document ? ` (${item.document})` : ""}
                </option>
              ))}
            </select>
          </label>
          {isForaCarteira ? (
            <div className="mt-4">
              <div className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground-soft">
                {t("ui.ou")}
              </div>
              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>{t("ui.nome_da_empresa")}</span>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNewCompanyName(value);
                    if (value.trim().length > 0) {
                      setSelectedCompanyId("");
                    }
                  }}
                  placeholder={t("ui.ex_nome_da_empresa")}
                  className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-normal text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                />
              </label>
            </div>
          ) : null}
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
          <SectionHeader title={t("ui.dados_do_apontamento")} />

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
              <span>{t("ui.duracao_em_minutos")}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseDurationMinutes(durationMinutes) ?? 60;
                    const next = Math.max(1, current - 10);
                    setDurationMinutes(String(next));
                  }}
                  className="rounded-2xl border border-border bg-white px-3 py-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
                >
                  {t("ui.diminuir_10_minutos")}
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={durationMinutes}
                  onChange={(event) =>
                    setDurationMinutes(
                      sanitizeDurationInput(event.target.value),
                    )
                  }
                  className="w-full rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm font-normal text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                  required
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseDurationMinutes(durationMinutes) ?? 60;
                    const next = current + 10;
                    setDurationMinutes(String(next));
                  }}
                  className="rounded-2xl border border-border bg-white px-3 py-3 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
                >
                  {t("ui.aumentar_10_minutos")}
                </button>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? t("ui.salvando") : t("ui.salvar_apontamento")}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
