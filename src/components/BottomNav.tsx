import { Link, NavLink } from "react-router-dom";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { t } from "../i18n";

export const BottomNav = () => {
  const isOnline = useOnlineStatus();
  const navItems = [
    { to: "/cronograma/dia", label: t("ui.dia") },
    { to: "/cronograma/semana", label: t("ui.semana") },
    { to: "/cronograma/mes", label: t("ui.mes") },
    { to: "/cronograma/lista", label: t("ui.lista") },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white/90 backdrop-blur">
      <div className="mx-auto w-full max-w-xl px-4 py-3">
        <div className="grid grid-cols-5 items-center">
          {navItems.slice(0, 2).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "mx-auto flex w-full max-w-[84px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold transition",
                  isActive
                    ? "bg-brand/15 text-foreground"
                    : "text-foreground-soft hover:bg-surface-muted",
                ].join(" ")
              }
            >
              <span className="h-2 w-2 rounded-full bg-accent" />
              {item.label}
            </NavLink>
          ))}
          <Link
            to="/apontamentos/novo"
            aria-label={t("ui.novo_apontamento")}
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-white shadow-lg transition hover:bg-foreground/90"
          >
            <span className="text-2xl leading-none">+</span>
          </Link>
          {navItems.slice(2).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "mx-auto flex w-full max-w-[84px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold transition",
                  isActive
                    ? "bg-brand/15 text-foreground"
                    : "text-foreground-soft hover:bg-surface-muted",
                ].join(" ")
              }
            >
              <span className="h-2 w-2 rounded-full bg-accent" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
      {!isOnline && (
        <div className="border-t border-border bg-red-600">
          <div className="mx-auto w-full max-w-xl px-4 py-[2px]">
            <div className="flex w-full items-center justify-center gap-2 text-[11px] font-semibold text-white">
              <span className="h-2 w-2 rounded-sm bg-white" />
              {t("ui.sem_internet")}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
