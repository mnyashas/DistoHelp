import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShieldAlert, Settings, LogOut, Watch, Activity,
} from 'lucide-react';
import { useAuth } from '../services/AuthContext.jsx';
import EmergencyOverlay from './EmergencyOverlay.jsx';

// TailAdmin-style grouped navigation for DIstoHelp
const SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/wearable', label: 'Wearable Mode', icon: Watch },
    ],
  },
  {
    label: 'Patient Care',
    items: [
      { to: '/patients', label: 'Patients', icon: Users },
      { to: '/risk', label: 'Risk Assessment', icon: ShieldAlert },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

function BrandMark({ size = 40 }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-xl bg-brand-500 font-extrabold text-white shadow-theme-xs"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      D
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = (user?.name ?? 'D')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase().replace('.', '');

  return (
    <div className="flex min-h-screen bg-gray-50">
      <EmergencyOverlay />
      {/* ── TailAdmin white sidebar (desktop) ── */}
      <aside className="sticky top-0 hidden h-screen w-[290px] shrink-0 flex-col border-e border-gray-200 bg-white px-5 py-6 md:flex">
        {/* logo */}
        <NavLink to="/" className="flex items-center gap-3 px-2" aria-label="DIstoHelp home">
          <BrandMark size={40} />
          <span className="leading-tight">
            <span className="block text-lg font-bold tracking-tight text-gray-900">DIstoHelp</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              Early Warning System
            </span>
          </span>
        </NavLink>

        {/* menu */}
        <nav className="mt-7 flex-1 overflow-y-auto custom-scrollbar">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="menu-section">{section.label}</p>
              <ul className="flex flex-col gap-1">
                {section.items.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        `menu-item group ${isActive ? 'menu-item-active' : 'menu-item-inactive'}`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            size={19}
                            strokeWidth={1.8}
                            className={isActive ? 'text-brand-500' : 'text-gray-400 group-hover:text-gray-600'}
                          />
                          <span className="truncate">{label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* live status + user card */}
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <Activity size={13} style={{ color: '#039855' }} /> Monitoring live
          </div>
          <div className="mt-3 flex items-center gap-3 border-t border-gray-200 pt-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user?.name}</p>
              <p className="truncate text-xs text-gray-500">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
              className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={17} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── content column ── */}
      <div className="min-w-0 flex-1">
        {/* header */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-gray-200 bg-white/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="md:hidden"><BrandMark size={34} /></div>
            <p className="truncate text-sm text-gray-500">
              {now.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'medium' })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-success-200 bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-700 sm:inline-flex"
              style={{ color: '#039855', borderColor: '#a6f4c5', backgroundColor: '#ecfdf3' }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#12b76a' }} />
              Monitoring live
            </span>
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight text-gray-900">{user?.name}</p>
              <p className="text-[11px] leading-tight text-gray-500">{user?.role}</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
              {initials}
            </div>
          </div>
        </header>

        {/* mobile nav chips */}
        <nav className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 md:hidden custom-scrollbar">
          {SECTIONS.flatMap((s) => s.items).map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 shadow-theme-xs'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
        <footer className="border-t border-gray-200 bg-white/80 px-4 py-2 text-center text-[11px] text-gray-500 backdrop-blur">
          <span className="font-semibold text-amber-700">Clinical decision support only — not a medical diagnosis system.</span> All alerts must be reviewed by a qualified clinician.
        </footer>
      </div>
    </div>
  );
}
