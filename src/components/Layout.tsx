import { NavLink, Outlet } from 'react-router-dom';

const items = [
  { to: '/', label: 'Inicio', icon: '🏠' },
  { to: '/library', label: 'Biblioteca', icon: '📚' },
  { to: '/new', label: 'Crear', icon: '➕' },
  { to: '/stats', label: 'Progreso', icon: '📈' },
  { to: '/profile', label: 'Perfil', icon: '👤' },
];

export default function Layout() {
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-24">
      <Outlet />
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-900">
        <ul className="mx-auto flex max-w-xl justify-around">
          {items.map((i) => (
            <li key={i.to}>
              <NavLink
                to={i.to}
                end={i.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center px-3 py-2 text-xs font-bold ${isActive ? 'text-sky-500' : 'text-slate-400'}`
                }
              >
                <span className="text-xl">{i.icon}</span>
                {i.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
