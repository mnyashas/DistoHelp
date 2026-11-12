import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, HeartPulse, Radio, ShieldAlert,
  LineChart, ClipboardList, Settings, LogOut, AudioLines,
} from 'lucide-react';
import { useAuth } from '../services/AuthContext.jsx';
import { Brand } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/live', label: 'Live Monitoring', icon: AudioLines },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/vitals', label: 'Vital Signs', icon: HeartPulse },
  { to: '/sensors', label: 'Sensor Monitoring', icon: Radio },
  { to: '/risk', label: 'Risk Assessment', icon: ShieldAlert },
  { to: '/history', label: 'Monitoring History', icon: LineChart },
  { to: '/enquiries', label: 'Patient Enquiries', icon: ClipboardList },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy-900 p-4 text-slate-200 md:flex">
        <Brand />
        <nav className="mt-8 flex-1 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive ? 'bg-teal-500/20 text-teal-300' : 'hover:bg-white/5'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={handleLogout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-300 hover:bg-white/5">
          <LogOut size={18} /> Logout
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="md:hidden"><Brand small /></div>
          <p className="text-sm text-slate-500">
            {now.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })}
          </p>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.role}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-teal-500 font-bold text-white">
              {user?.name?.[0]}
            </div>
          </div>
        </header>

        <nav className="flex gap-2 overflow-x-auto px-4 pt-3 md:hidden">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-teal-500 text-white' : 'bg-white text-slate-600 shadow-sm'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}