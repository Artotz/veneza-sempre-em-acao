import { useMemo } from "react";
import { signOut } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { auth } from "../lib/firebase";
import backgroundImage from "../assets/background.png";
import cscIcon from "../assets/csc_logo.png";
import logoJd from "../assets/logo_jd.png";
import venezaEquip from "../assets/veneza_equip.png";
import { Header } from "../components/Header";
import { useAuth } from "../contexts/AuthContext";
import { formatSellerName } from "../utils/formatSellerName";

export default function PerfilPage() {
  const { user, branches, isAdmin } = useAuth();
  const { t } = useTranslation();

  const navLinks = useMemo(
    () => [
      { to: "/", label: t("common.appName") },
      { to: "/garantia", label: "PowerGard" },
    ],
    [t]
  );

  const sellerNameLabel = useMemo(
    () => formatSellerName(user?.email ?? null, t("common.notProvided")),
    [t, user?.email]
  );
  const userTypeLabel = isAdmin ? "Admin" : "Padrão";

  if (!user) {
    return (
      <main className="min-h-dvh grid place-items-center bg-background text-foreground">
        {t("common.logging")}
      </main>
    );
  }

  return (
    <main
      className="relative min-h-screen max-h-screen min-h-[100svh] max-h-[100svh] w-screen overflow-y-auto overflow-x-hidden no-scrollbar bg-background text-foreground flex flex-col
             before:fixed before:inset-0 before:bg-black/50 before:z-0 before:pointer-events-none"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="relative z-10 mt-12 flex flex-1 flex-col">
        <Header
          // title={t("common.appName")}
          title={"Perfil"}
          sellerName={sellerNameLabel}
          links={navLinks}
          signOutLabel={t("header.signOut")}
          onSignOut={() => signOut(auth)}
        />

        <section className="mx-auto max-w-3xl px-4 py-8 w-full flex-1">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-xl">
            {/* <h1 className="text-xl font-semibold text-foreground">Perfil</h1> */}
            {/* <p className="mt-1 text-sm text-foreground">
              Pagina em construcao. Este conteudo e um mock.
            </p> */}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface-muted p-4">
                <span className="block text-xs uppercase tracking-wide text-foreground/70">
                  Usuário
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {sellerNameLabel}
                </span>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted p-4">
                <span className="block text-xs uppercase tracking-wide text-foreground/70">
                  Email
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {user.email ?? "-"}
                </span>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted p-4">
                <span className="block text-xs uppercase tracking-wide text-foreground/70">
                  Tipo de usuário
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {userTypeLabel}
                </span>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted p-4">
                <span className="block text-xs uppercase tracking-wide text-foreground/70">
                  Status
                </span>
                <span className="text-sm font-semibold text-foreground">
                  Conta ativa
                </span>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted p-4 sm:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-foreground/70">
                  Filial
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {branches.length ? (
                    branches.map((branch) => (
                      <span
                        key={branch}
                        className="inline-flex items-center rounded-full border border-border-strong bg-surface px-2.5 py-1 text-xs font-semibold text-foreground"
                      >
                        {t(branch)}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm font-semibold text-foreground">
                      -
                    </span>
                  )}
                </div>
              </div>
              {/* <div className="rounded-xl border border-border bg-surface-muted p-4 sm:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-foreground/70">
                  Status
                </span>
                <span className="text-sm font-semibold text-foreground">
                  Conta ativa (mock)
                </span>
              </div> */}
            </div>
          </div>
        </section>

        <div className="mt-3 px-4 pb-3 flex flex-row items-center w-full justify-between">
          <div className="px-4 flex flex-row justify-end">
            <img src={cscIcon} alt="CSC" className="h-12 w-auto drop-shadow" />
          </div>
          <div className="px-4 flex flex-row justify-end">
            <img
              src={venezaEquip}
              alt="Veneza Equipamentos"
              className="h-8 w-auto drop-shadow"
            />
            <div className="bg-white h-fit">
              <img src={logoJd} alt="John Deere" className="h-8 w-auto" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
