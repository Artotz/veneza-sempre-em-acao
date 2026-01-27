import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  // createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
// import logoVeneza from "../assets/logo_veneza.png";
import logoApp from "../assets/logo.svg";
import cscIcon from "../assets/csc_logo.png";
import logoJd from "../assets/logo_jd.png";
import venezaEquip from "../assets/veneza_equip.png";
import backgroundImage from "../assets/background.png";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? "/";

  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo, user]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      console.log("Auth sign-in error", e);
      if (e?.code === "auth/invalid-credential") {
        setErr(t("auth.invalidCredentials", "Credenciais inválidas."));
      } else if (e?.code === "auth/network-request-failed") {
        setErr(
          t("auth.networkError", "Verifique sua conexão e tente novamente.")
        );
      } else {
        setErr(t("auth.accessError", "Erro ao tentar logar."));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setErr(null);
    setInfo(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setErr(
        t(
          "auth.forgotEmailRequired",
          "Informe o e-mail para recuperar a senha."
        )
      );
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setInfo(
        t("auth.resetEmailSent", {
          email: trimmed,
          defaultValue: `Enviamos um link de redefinição para ${trimmed}.`,
        })
      );
    } catch (e: any) {
      console.log("Auth forgot-password error", e);
      if (e?.code === "auth/network-request-failed") {
        setErr(
          t("auth.networkError", "Verifique sua conexão e tente novamente.")
        );
      } else {
        setErr(t("auth.accessError", "Erro na requisição."));
      }
    } finally {
      setResetting(false);
    }
  }

  // async function handleSignUp() {
  //   setErr(null);
  //   setLoading(true);
  //   try {
  //     await createUserWithEmailAndPassword(auth, email.trim(), password);
  //   } catch (e: any) {
  //     setErr(e?.message || String(e));
  //   } finally {
  //     setLoading(false);
  //   }
  // }

  // Login anônimo removido por solicitação

  return (
    <main
      className="relative min-h-dvh grid place-items-center bg-background text-foreground px-4"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* <div className="absolute top-4 right-4">
        <img src={cscIcon} alt="CSC" className="h-24 w-auto drop-shadow" />
      </div> */}

      <div className="w-full max-w-sm text-center mb-16">
        <div className="flex justify-center mb-6">
          <img
            src={logoApp}
            alt="Veneza Equipamentos"
            className="h-50 w-auto"
          />
        </div>
        <h1 className="text-xl font-semibold mb-4 text-label-text">
          {t("auth.title")}
        </h1>
        <form onSubmit={handleSignIn} className="space-y-3">
          <input
            type="email"
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-surface border border-border px-3 py-2"
            required
          />
          <input
            type="password"
            placeholder={t("auth.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-surface border border-border px-3 py-2"
            required
          />
          <div className="space-y-2">
            {err && (
              <p className="text-sm bg-contrast text-surface rounded-md px-3 py-2 font-semibold shadow-sm">
                {err}
              </p>
            )}
            {info && (
              <p className="text-sm bg-surface text-foreground rounded-md px-3 py-2 font-medium border border-border shadow-sm">
                {info}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg border border-border-strong bg-surface text-foreground font-semibold px-3 py-2 hover:bg-surface-muted disabled:opacity-60 shadow-sm"
            >
              {loading ? t("common.loading") : t("auth.submit")}
            </button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading || resetting}
              className="w-full rounded-lg border border-border-strong bg-foreground text-surface font-semibold px-3 py-2 hover:bg-surface-muted hover:text-foreground disabled:opacity-60 shadow-sm"
            >
              {resetting
                ? t("common.loading")
                : t("auth.forgotPassword", "Esqueci minha senha")}
            </button>
          </div>
        </form>
        {/* Botao de login como visitante removido */}
      </div>

      <div className="absolute bottom-4 right-4 flex flex-row items-center justify-end">
        <img
          src={venezaEquip}
          alt="Veneza Equipamentos"
          className="h-8 w-auto drop-shadow"
        />
        <div className="bg-white">
          <img src={logoJd} alt="John Deere" className="h-8 w-auto" />
        </div>
      </div>

      <div className="absolute bottom-4 left-4">
        <img src={cscIcon} alt="CSC" className="h-12 w-auto drop-shadow" />
      </div>
    </main>
  );
}
