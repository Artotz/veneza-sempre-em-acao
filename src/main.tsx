// src/main.tsx
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App.tsx";
import Auth from "./components/Auth";
import ProtectedRoute from "./routes/ProtectedRoute";
import GarantiaPage from "./pages/Garantia";
import PerfilPage from "./pages/Perfil";
import AlteracoesPage from "./pages/Alteracoes";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext";
import { registerSW } from "virtual:pwa-register";
import "./i18n";

registerSW({
  immediate: true,
  onNeedRefresh() {
    // aqui vocǦ pode exibir um toast e chamar updateSW()
  },
  onOfflineReady() {
    // app pronto para offline
  },
});

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Auth />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<App />} />
          <Route path="/garantia" element={<GarantiaPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/alteracoes" element={<AlteracoesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);
