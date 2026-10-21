import { useEffect, useRef, type TouchEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  { to: '/library', label: 'Simulacros', icon: 'book', also: ['/new', '/import-json', '/exams', '/folders'] },
  { to: '/flashcards', label: 'Fichas', icon: 'cards' },
  { to: '/books', label: 'Libros', icon: 'library' },
  { to: '/stats', label: 'Progreso', icon: 'chart' },
  { to: '/profile', label: 'Perfil', icon: 'user' },
];

const SWIPE_MIN_X = 70; // px horizontales para contar como deslizamiento
const EDGE = 28; // px del borde de la pantalla: ahí Android/iOS usan el gesto de «atrás»

/** ¿El toque empezó en algo que ya se desplaza o se escribe? Entonces no se cambia de pestaña. */
function startsInInteractive(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.body) {
    if (node.matches?.('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) return true;
    const ox = getComputedStyle(node).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth) return true;
    node = node.parentElement;
  }
  return false;
}

export default function Layout() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const belongs = (i: Item) => i.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false;

  // Deslizar entre pestañas (solo móvil, y solo en las pantallas principales de cada pestaña)
  const tabIndex = items.findIndex((i) => i.to === pathname);
  const touch = useRef<{ x: number; y: number; ok: boolean } | null>(null);
  const dir = useRef<'' | 'next' | 'prev'>(''); // para animar la entrada de la pestaña nueva
  const animation = dir.current === 'next' ? 'animate-swipeNext' : dir.current === 'prev' ? 'animate-swipePrev' : '';
  useEffect(() => {
    dir.current = ''; // la animación ya se aplicó en este render
  }, [pathname]);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const inEdge = t.clientX < EDGE || t.clientX > window.innerWidth - EDGE;
    touch.current = {
      x: t.clientX,
      y: t.clientY,
      ok: mobile && tabIndex >= 0 && e.touches.length === 1 && !inEdge && !startsInInteractive(e.target),
    };
  };

  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s?.ok) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * 1.6) return; // vertical o muy corto: es scroll
    const next = dx < 0 ? tabIndex + 1 : tabIndex - 1; // de derecha a izquierda → pestaña siguiente
    if (next < 0 || next >= items.length) return;
    dir.current = dx < 0 ? 'next' : 'prev';
    nav(items[next].to);
  };

  return (
    <div className="min-h-dvh overflow-x-clip pb-24 md:pb-8 md:pl-24" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Móvil: columna angosta con barra abajo. PC (md+): contenido más ancho y barra lateral a la izquierda. */}
      <div key={pathname} className={`mx-auto max-w-xl md:max-w-5xl md:px-4 md:animate-none ${animation}`}>
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
