import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../contexts/useAuth";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { t } from "../i18n";

type InfoRow = {
  label: string;
  value: string;
};

export default function UserProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = useMemo<InfoRow[]>(() => {
    const email = user?.email ?? t("ui.nao_informado");

    return [{ label: t("ui.email"), value: email }];
  }, [user]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: signOutError } = await supabase.auth.signOut();
    setIsSigningOut(false);

    if (signOutError) {
      setError(signOutError.message);
      return;
    }

    navigate("/login", { replace: true });
  };

  return (
    <AppShell title={t("labels.page.profile")}>
      <div className="space-y-4">
        <section className="rounded-3xl border border-border bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-foreground-soft">
            {t("ui.dados_basicos")}
          </p>
          <div className="mt-4 space-y-3">
            {info.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm"
              >
                <span className="text-foreground-soft">{row.label}</span>
                <span className="text-right font-semibold text-foreground">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSigningOut ? t("ui.saindo") : t("ui.sair")}
        </button>
      </div>
    </AppShell>
  );
}
