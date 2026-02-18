import { Link, NavLink } from "react-router-dom";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { t } from "../i18n";

export const BottomNav = () => {
  const isOnline = useOnlineStatus();
  const navItems = [
    { to: "/cronograma/dia", label: t("Dia") },
    { to: "/cronograma/semana", label: t("Semana") },
    { to: "/cronograma/mes", label: t("Mes") },
    { to: "/cronograma/lista", label: t("Lista") },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white/90 backdrop-blur">
      {!isOnline && (
        <div className="absolute inset-x-0 bottom-full">
          <div className="mx-auto w-full max-w-xl px-4 pb-2">
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-700 bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm">
              <span className="h-2 w-2 rounded-full bg-white" />
              {t("Sem internet.")}
            </div>
          </div>
        </div>
      )}
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
            aria-label={t("Novo apontamento")}
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
    </nav>
  );
};
