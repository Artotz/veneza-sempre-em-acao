import { t } from "../i18n";

type DetailsMapTab = "details" | "map";

type DetailsMapTabsProps = {
  value: DetailsMapTab;
  onChange: (value: DetailsMapTab) => void;
  detailsLabel?: string;
  mapLabel?: string;
};

export const DetailsMapTabs = ({
  value,
  onChange,
  detailsLabel = t("ui.detalhes"),
  mapLabel = t("ui.mapa"),
}: DetailsMapTabsProps) => {
  return (
    <div
      className="rounded-2xl border border-border bg-surface-muted p-1"
      role="tablist"
      aria-label={t("ui.alternar_visualizacao")}
    >
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={value === "details"}
          onClick={() => onChange("details")}
          className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
            value === "details"
              ? "bg-white text-foreground shadow-sm"
              : "text-foreground-soft hover:bg-white/60"
          }`}
        >
          {detailsLabel}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === "map"}
          onClick={() => onChange("map")}
          className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
            value === "map"
              ? "bg-white text-foreground shadow-sm"
              : "text-foreground-soft hover:bg-white/60"
          }`}
        >
          {mapLabel}
        </button>
      </div>
    </div>
  );
};
