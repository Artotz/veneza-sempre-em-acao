import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AllAppointments from "./screens/AllAppointments";
import AppointmentDetail from "./screens/AppointmentDetail";
import MonthView from "./screens/MonthView";
import NotFound from "./screens/NotFound";
import DayView from "./screens/DayView";
import WeekView from "./screens/WeekView";
import Home from "./screens/Home";
import { ScheduleProvider } from "./state/ScheduleProvider";
import Login from "./screens/Login";
import NewAppointment from "./screens/NewAppointment";
import { AuthProvider } from "./contexts/AuthProvider";
import { RequireAuth } from "./components/RequireAuth";
import CompanyDetail from "./screens/CompanyDetail";
import UserProfile from "./screens/UserProfile";
import Companies from "./screens/Companies";

export default function App() {
  return (
    <AuthProvider>
      <ScheduleProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/home" replace />}
            />
            <Route path="/login" element={<Login />} />
            <Route
              path="/home"
              element={
                <RequireAuth>
                  <Home />
                </RequireAuth>
              }
            />
            <Route
              path="/empresas"
              element={
                <RequireAuth>
                  <Companies />
                </RequireAuth>
              }
            />
            <Route
              path="/empresas/:id/novo-apontamento"
              element={
                <RequireAuth>
                  <NewAppointment />
                </RequireAuth>
              }
            />
            <Route
              path="/empresas/:id"
              element={
                <RequireAuth>
                  <CompanyDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/cronograma"
              element={<Navigate to="/calendario/semana" replace />}
            />
            <Route
              path="/cronograma/dia"
              element={
                <RequireAuth>
                  <Navigate to="/calendario/dia" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/cronograma/semana"
              element={
                <RequireAuth>
                  <Navigate to="/calendario/semana" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/cronograma/mes"
              element={
                <RequireAuth>
                  <Navigate to="/calendario/mes" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/cronograma/lista"
              element={
                <RequireAuth>
                  <Navigate to="/agenda" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/calendario/dia"
              element={
                <RequireAuth>
                  <DayView />
                </RequireAuth>
              }
            />
            <Route
              path="/calendario"
              element={
                <RequireAuth>
                  <Navigate to="/calendario/semana" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/calendario/semana"
              element={
                <RequireAuth>
                  <WeekView />
                </RequireAuth>
              }
            />
            <Route
              path="/calendario/mes"
              element={
                <RequireAuth>
                  <MonthView />
                </RequireAuth>
              }
            />
            <Route
              path="/agenda"
              element={
                <RequireAuth>
                  <AllAppointments />
                </RequireAuth>
              }
            />
            <Route
              path="/perfil"
              element={
                <RequireAuth>
                  <UserProfile />
                </RequireAuth>
              }
            />
            <Route
              path="/apontamentos/novo"
              element={
                <RequireAuth>
                  <NewAppointment />
                </RequireAuth>
              }
            />
            <Route
              path="/apontamentos/:id"
              element={
                <RequireAuth>
                  <AppointmentDetail />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ScheduleProvider>
    </AuthProvider>
  );
}
