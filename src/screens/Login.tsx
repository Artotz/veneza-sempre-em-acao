import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { useAuth } from "../contexts/useAuth";
import { t } from "../i18n";
import { getCurrentPosition } from "../services/geolocation";
import logoText from "../assets/logo_text.png";
import cscLogo from "../assets/csc_logo.png";

type BannerState =
  | { variant: "error"; message: string }
  | { variant: "success"; message: string }
  | null;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function Login() {
  const navigate = useNavigate();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate("/home", { replace: true });
    }
  }, [navigate, user]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [banner, setBanner] = useState<BannerState | null>();
  const [loading, setLoading] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const didRequestPermissions = useRef(false);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      setIsInstalled(isStandalone);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    checkStandalone();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (didRequestPermissions.current) return;
    didRequestPermissions.current = true;

    const requestLocationPermission = async () => {
      if (!navigator.geolocation) return;
      try {
        await getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 4000,
          maximumAge: 0,
        });
      } catch {
        // Ignora erros aqui: o objetivo é só disparar o prompt inicial.
      }
    };

    const requestCameraPermission = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Ignora erros aqui: o objetivo é só disparar o prompt inicial.
      }
    };

    const requestPermissions = async () => {
      await requestLocationPermission();
      await requestCameraPermission();
    };

    void requestPermissions();
  }, []);

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
        message: t(
          "ui.nao_foi_possivel_entrar_com_email_e_senha_verifique_os_dados_e_tente_novamente",
        ),
      });
      return;
    }

    navigate("/home", { replace: true });
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    setInstalling(true);

    try {
      await installPrompt.prompt();
      const choiceResult = await installPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setInstallPrompt(null);
        setIsInstalled(true);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="app-background relative flex min-h-screen items-center justify-center px-4 py-10">
      <img
        src={cscLogo}
        alt=""
        aria-hidden="true"
        className="absolute right-4 top-4 w-8 opacity-90"
      />
      <div className="w-full max-w-xl">
        <img
          src={logoText}
          alt=""
          aria-hidden="true"
          className="mx-auto mb-2 w-72"
        />
        <div className="overflow-hidden rounded-3xl border border-border bg-white shadow-2xl">
          <div className="grid gap-6 bg-gradient-to-br from-accent to-brand px-8 py-10 text-white md:grid-cols-[1.1fr_1fr] md:gap-0">
            <div className="rounded-2xl border border-white/30 bg-white p-6 text-foreground shadow-lg shadow-brand/20">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t("ui.faca_login")}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {t("ui.entre_com_email_e_senha")}
                  </p>
                </div>

                {banner && (
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      banner.variant === "error"
                        ? "border-danger/40 bg-danger/10 text-danger"
                        : "border-success/40 bg-success/10 text-success"
                    }`}
                  >
                    {banner.message}
                  </div>
                )}

                <form className="space-y-4" onSubmit={handlePasswordSignIn}>
                  <label className="space-y-2 text-sm font-medium text-foreground">
                    <span>{t("ui.email")}</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-normal text-foreground shadow-inner outline-none transition focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
                      placeholder={t("ui.seu_email_com")}
                      required
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium text-foreground">
                    <span>{t("ui.senha")}</span>
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
                    {loading ? t("ui.entrando") : t("ui.entrar")}
                  </button>

                  {installPrompt && !isInstalled && (
                    <button
                      type="button"
                      onClick={handleInstallClick}
                      disabled={installing}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-foreground/20 bg-white px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-foreground/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {installing
                        ? t("ui.instalando_app")
                        : t("ui.instalar_app")}
                    </button>
                  )}
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
