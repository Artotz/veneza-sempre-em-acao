import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AllAppointments from "./screens/AllAppointments";
import AppointmentDetail from "./screens/AppointmentDetail";
import MonthView from "./screens/MonthView";
import NotFound from "./screens/NotFound";
import DayView from "./screens/DayView";
import WeekView from "./screens/WeekView";
import { ScheduleProvider } from "./state/ScheduleProvider";
import Login from "./screens/Login";
import NewAppointment from "./screens/NewAppointment";
import { AuthProvider } from "./contexts/AuthProvider";
import { RequireAuth } from "./components/RequireAuth";
import CompanyDetail from "./screens/CompanyDetail";

export default function App() {
  return (
    <AuthProvider>
      <ScheduleProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/cronograma/dia" replace />}
            />
            <Route path="/login" element={<Login />} />
            <Route
              path="/empresas"
              element={
                <RequireAuth>
                  <Navigate to="/cronograma/lista?tab=empresas" replace />
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
              element={<Navigate to="/cronograma/dia" replace />}
            />
            <Route
              path="/cronograma/dia"
              element={
                <RequireAuth>
                  <DayView />
                </RequireAuth>
              }
            />
            <Route
              path="/cronograma/semana"
              element={
                <RequireAuth>
                  <WeekView />
                </RequireAuth>
              }
            />
            <Route
              path="/cronograma/mes"
              element={
                <RequireAuth>
                  <MonthView />
                </RequireAuth>
              }
            />
            <Route
              path="/cronograma/lista"
              element={
                <RequireAuth>
                  <AllAppointments />
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
