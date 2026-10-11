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
    <div className="min-h-dvh pb-24 md:pb-8 md:pl-24">
      {/* Móvil: columna angosta con barra abajo. PC (md+): contenido más ancho y barra lateral a la izquierda. */}
      <div className="mx-auto max-w-xl md:max-w-5xl md:px-4">
        <Outlet />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:inset-x-auto md:inset-y-0 md:left-0 md:w-24 md:border-r md:border-t-0 md:pb-0 dark:border-slate-800 dark:bg-slate-900/90">
        <ul className="mx-auto flex max-w-xl justify-around md:max-w-none md:flex-col md:justify-start md:gap-1 md:px-2 md:pt-6">
          {items.map((i) => (
            <li key={i.to} className="flex-1 md:flex-none">
              <NavLink
                to={i.to}
                end={i.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium transition-colors md:rounded-xl md:py-3 md:hover:bg-slate-100 md:dark:hover:bg-slate-800 ${
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
