import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { t } from "../i18n";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [loading, navigate, user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-10 text-sm text-foreground-muted">
        {t("ui.carregando")}
      </div>
    );
  }

  return <>{children}</>;
}
