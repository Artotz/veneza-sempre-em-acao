import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { useAuth } from "../contexts/useAuth";
import { t } from "../i18n";

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  rightSlot?: ReactNode;
};

export const AppShell = ({
  title,
  // subtitle,
  children,
  rightSlot,
}: AppShellProps) => {
  const { user } = useAuth();
  const userEmail = user?.email?.trim();
  const headerRightSlot = userEmail || rightSlot;

  return (
    <div className="app-background min-h-screen bg-background text-foreground">
      <header className="relative overflow-hidden bg-transparent text-white">
        <div className="relative px-5 pb-6 pt-3">
          <div className="flex items-start justify-between gap-3 mb-5">
            <p className="text-[11px] pt-[6px] uppercase tracking-[0.2em] text-white/70">
              {t("ui.cronograma")}
            </p>
            {headerRightSlot ? (
              userEmail ? (
                <Link
                  to="/perfil"
                  className="shrink-0 rounded-2xl border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-white/25"
                >
                  {headerRightSlot}
                </Link>
              ) : (
                <div className="shrink-0 rounded-2xl border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                  {headerRightSlot}
                </div>
              )
            ) : null}
          </div>
          <h1 className="mt-2 text-2xl font-display font-semibold text-white">
            {title}
          </h1>
          {/* {subtitle ? (
            <p className="mt-2 max-w-[20rem] text-sm text-foreground-muted">
              {subtitle}
            </p>
          ) : null} */}
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 pb-24 pt-5">
        {children}
      </main>

      <BottomNav />
    </div>
  );
};
