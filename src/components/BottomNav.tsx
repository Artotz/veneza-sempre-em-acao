import { NavLink } from "react-router-dom";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

const navItems = [
  { to: "/empresas", label: "Empresas" },
  { to: "/cronograma/dia", label: "Dia" },
  { to: "/cronograma/semana", label: "Semana" },
  { to: "/cronograma/mes", label: "Mes" },
  { to: "/cronograma/lista", label: "Lista" },
];

export const BottomNav = () => {
  const isOnline = useOnlineStatus();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white/90 backdrop-blur">
      {!isOnline && (
        <div className="absolute inset-x-0 bottom-full">
          <div className="mx-auto w-full max-w-xl px-4 pb-2">
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-700 bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm">
              <span className="h-2 w-2 rounded-full bg-white" />
              Sem internet. Algumas funções podem ficar indisponíveis.
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto flex w-full max-w-xl items-center justify-around px-6 py-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold transition",
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
    </nav>
  );
};
