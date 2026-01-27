import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { AppDataProvider } from "../contexts/AppDataContext";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (loading) {
    return (
      <main className="min-h-dvh grid place-items-center bg-background text-foreground">
        {t("common.logging")}
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <AppDataProvider>
      <Outlet />
    </AppDataProvider>
  );
}
