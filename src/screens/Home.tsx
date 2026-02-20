import { AppShell } from "../components/AppShell";
import { t } from "../i18n";

export default function Home() {
  return (
    <AppShell title={t("ui.home")}>
      <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-foreground">
          {t("ui.hello_world")}
        </p>
      </div>
    </AppShell>
  );
}
