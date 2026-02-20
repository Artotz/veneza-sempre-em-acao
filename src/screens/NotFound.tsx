import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../contexts/useAuth";
import { t } from "../i18n";

export default function NotFound() {
  const { user } = useAuth();
  const isLoggedIn = Boolean(user);
  const primaryHref = isLoggedIn ? "/home" : "/login";
  const primaryLabel = isLoggedIn ? t("ui.ir_para_home") : t("ui.fazer_login");

  return (
    <AppShell title={t("labels.page.not_found")}>
      <div className="space-y-4">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-white p-6 shadow-sm">
          <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-brand/15 blur-2xl" />
          <div className="absolute -left-12 bottom-0 h-28 w-28 rounded-full bg-accent/15 blur-2xl" />
          <div className="relative space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-foreground-soft">
              {t("ui.erro_404")}
            </p>
            <h2 className="text-3xl font-display font-semibold text-foreground">
              {t("labels.page.not_found")}
            </h2>
            <p className="text-sm text-foreground-muted">
              {t("ui.a_rota_solicitada_nao_existe_ou_foi_movida")}
            </p>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to={primaryHref}
            className="inline-flex items-center justify-center rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-foreground/90"
          >
            {primaryLabel}
          </Link>
          {isLoggedIn ? (
            <Link
              to="/empresas"
              className="inline-flex items-center justify-center rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted"
            >
              {t("ui.ver_empresas")}
            </Link>
          ) : (
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted"
            >
              {t("ui.voltar_ao_inicio")}
            </Link>
          )}
        </div>
        {/* 
        <div className="rounded-2xl border border-dashed border-border bg-surface-muted px-4 py-3 text-xs text-foreground-muted">
          {t("ui.dica_confira_o_endereco_ou_use_o_menu_inferior_para_navegar")}
        </div> */}
      </div>
    </AppShell>
  );
}
