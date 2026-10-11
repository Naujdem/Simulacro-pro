import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon, { type IconName } from './Icon';

interface Item {
  to: string;
  label: string;
  icon: IconName;
  /** Rutas que también pertenecen a esta pestaña (para que no se quede sin resaltar). */
  also?: string[];
}

const items: Item[] = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/library', label: 'Simulacros', icon: 'book', also: ['/new', '/import-json', '/exams'] },
  { to: '/flashcards', label: 'Fichas', icon: 'cards' },
  { to: '/stats', label: 'Progreso', icon: 'chart' },
  { to: '/profile', label: 'Perfil', icon: 'user' },
];

export default function Layout() {
  const { pathname } = useLocation();
  const belongs = (i: Item) => i.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false;

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-24">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <ul className="mx-auto flex max-w-xl justify-around">
          {items.map((i) => (
            <li key={i.to} className="flex-1">
              <NavLink
                to={i.to}
                end={i.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium transition-colors ${
                    isActive || belongs(i) ? 'text-sky-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`
                }
              >
                <Icon name={i.icon} size={22} />
                {i.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
