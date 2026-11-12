import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './services/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import Dashboard from './dashboard/Dashboard.jsx';
import PatientsPage from './patients/PatientsPage.jsx';
import PatientProfile from './patients/PatientProfile.jsx';
import RiskAssessmentPage from './risk-assessment/RiskAssessmentPage.jsx';
import Watch from './pages/Watch.jsx';
import PatientCheckin from './pages/PatientCheckin.jsx';
import Wearable from './pages/Wearable.jsx';
import PatientPortal from './pages/PatientPortal.jsx';
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
      <Route path="/watch" element={<Watch />} />   {/* wrist kiosk companion — no chrome */}
      <Route path="/me" element={<PatientPortal />} />  {/* patient self-service portal */}
      <Route path="/patient" element={<PatientCheckin />} /> {/* patient-facing symptom check-in */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="wearable" element={<Wearable />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:id" element={<PatientProfile />} />
        <Route path="risk" element={<RiskAssessmentPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
