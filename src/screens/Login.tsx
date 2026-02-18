import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { useAuth } from "../contexts/useAuth";
import { t } from "../i18n";

type BannerState =
  | { variant: "error"; message: string }
  | { variant: "success"; message: string }
  | null;

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate("/empresas", { replace: true });
    }
  }, [navigate, user]);

  const queryBanner = useMemo<BannerState | null>(() => {
    const error = searchParams.get("error");
    const message = searchParams.get("message");
    if (error) return { variant: "error", message: error };
    if (message) return { variant: "success", message };
    return null;
  }, [searchParams]);

  const redirectTo = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [banner, setBanner] = useState<BannerState | null | undefined>();
  const [loading, setLoading] = useState(false);

  const activeBanner = banner === undefined ? queryBanner : banner;

  const handlePasswordSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setBanner({
        variant: "error",
        message:
          error.message ||
          t(
            "Nao foi possivel entrar com email e senha. Verifique os dados e tente novamente.",
          ),
      });
      return;
    }

    navigate(redirectTo || "/empresas", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-surface via-surface-muted to-surface-strong px-4 py-10">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-white shadow-2xl">
        <div className="grid gap-6 bg-gradient-to-br from-accent to-brand px-8 py-10 text-white md:grid-cols-[1.1fr_1fr] md:gap-0">
          <div className="flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
                {t("PWA Cronograma")}
              </p>
              {/* <h1 className="text-3xl font-semibold leading-tight">
                {t("Acesse o painel seguro")}
              </h1>
              <p className="text-sm text-white/80">
                {t(
                  "Entre com as credenciais do CRM para acessar empresas e agendamentos.",
                )}
              </p> */}
            </div>
            {/* <div className="rounded-2xl bg-white/10 p-4 text-sm text-white/90 shadow-inner">
              {t(
                "Sessoes sao preservadas pelo Supabase. Faca login para continuar.",
              )}
            </div> */}
          </div>

          <div className="rounded-2xl border border-white/30 bg-white p-6 text-foreground shadow-lg shadow-brand/20">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t("Faca login")}
                </p>
                <p className="text-xs text-foreground-muted">
                  {t("Entre com email e senha.")}
                </p>
              </div>

              {activeBanner && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    activeBanner.variant === "error"
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : "border-success/40 bg-success/10 text-success"
                  }`}
                >
                  {activeBanner.message}
                </div>
              )}

              <form className="space-y-4" onSubmit={handlePasswordSignIn}>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>{t("Email")}</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-normal text-foreground shadow-inner outline-none transition focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
                    placeholder={t("seu@email.com")}
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>{t("Senha")}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-normal text-foreground shadow-inner outline-none transition focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
                    placeholder="********"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-foreground/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? t("Entrando...") : t("Entrar")}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
