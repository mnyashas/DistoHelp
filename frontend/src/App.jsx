import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './services/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import Dashboard from './dashboard/Dashboard.jsx';
import PatientsPage from './patients/PatientsPage.jsx';
import PatientProfile from './patients/PatientProfile.jsx';
import { HistoryPage } from './patients/MonitoringHistory.jsx';
import VitalSignsPage from './vitals/VitalSignsPage.jsx';
import RiskAssessmentPage from './risk-assessment/RiskAssessmentPage.jsx';
import { EnquiriesPage } from './enquiries/EnquirySection.jsx';
import Live from './pages/Live.jsx';
import Watch from './pages/Watch.jsx';
import PatientCheckin from './pages/PatientCheckin.jsx';
import { Spinner } from './components/ui.jsx';

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/watch" element={<Watch />} />   {/* kiosk companion UI — no chrome */}
      <Route path="/patient" element={<PatientCheckin />} /> {/* patient-facing symptom check-in */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="live" element={<Live />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:id" element={<PatientProfile />} />
        <Route path="vitals" element={<VitalSignsPage />} />
        <Route path="sensors" element={<VitalSignsPage sensorsFirst />} />
        <Route path="risk" element={<RiskAssessmentPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="enquiries" element={<EnquiriesPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}