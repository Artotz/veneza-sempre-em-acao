import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";

export default function NotFound() {
  return (
    <AppShell title="Pagina nao encontrada">
      <EmptyState
        title="Rota invalida"
        description="Escolha uma opcao para voltar ao app."
      />
      <Link
        to="/empresas"
        className="mt-4 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground-soft"
      >
        Ir para empresas
      </Link>
    </AppShell>
  );
}
