import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { t } from "../i18n";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      const message = encodeURIComponent(t("ui.faca_login_para_continuar"));
      const redirect = `${location.pathname}${location.search}`;
      navigate(`/login?message=${message}&redirect=${encodeURIComponent(redirect)}`, {
        replace: true,
      });
    }
  }, [loading, location.pathname, location.search, navigate, user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-10 text-sm text-foreground-muted">
        {t("ui.carregando")}
      </div>
    );
  }

  return <>{children}</>;
}
