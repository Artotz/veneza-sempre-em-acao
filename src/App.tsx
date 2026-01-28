import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AllAppointments from "./screens/AllAppointments";
import AppointmentDetail from "./screens/AppointmentDetail";
import MonthView from "./screens/MonthView";
import NotFound from "./screens/NotFound";
import DayView from "./screens/DayView";
import WeekView from "./screens/WeekView";
import { ScheduleProvider } from "./state/ScheduleContext";

export default function App() {
  return (
    <ScheduleProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/cronograma/dia" replace />} />
          <Route
            path="/cronograma"
            element={<Navigate to="/cronograma/dia" replace />}
          />
          <Route path="/cronograma/dia" element={<DayView />} />
          <Route path="/cronograma/semana" element={<WeekView />} />
          <Route path="/cronograma/mes" element={<MonthView />} />
          <Route path="/cronograma/lista" element={<AllAppointments />} />
          <Route
            path="/cronograma/agendamento/:id"
            element={<AppointmentDetail />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ScheduleProvider>
  );
}
