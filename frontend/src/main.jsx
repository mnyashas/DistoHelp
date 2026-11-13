import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import MobileApp from './mobile/MobileApp.jsx';
import { AuthProvider } from './services/AuthContext.jsx';
import './index.css';

// VITE_MOBILE=1 builds the patient-only mobile application (used by the APK shell).
// The website build (default) keeps the full staff + patient routes.
const isMobile = import.meta.env.VITE_MOBILE === '1';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isMobile ? (
      <MobileApp />
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>
);
