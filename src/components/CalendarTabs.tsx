import { NavLink } from "react-router-dom";
import { t } from "../i18n";

const calendarTabs = [
  { to: "/calendario/dia", label: t("ui.dia") },
  { to: "/calendario/semana", label: t("ui.semana") },
  { to: "/calendario/mes", label: t("ui.mes") },
];

export const CalendarTabs = () => {
  return (
    <div className="rounded-2xl border border-border bg-surface-muted p-1">
      <div className="grid grid-cols-3 gap-2">
        {calendarTabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "rounded-2xl px-3 py-2 text-center text-xs font-semibold transition",
                isActive
                  ? "bg-white text-foreground shadow-sm"
                  : "text-foreground-soft hover:bg-white/70",
              ].join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
};
