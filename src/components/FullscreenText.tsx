import { useEffect, useRef, type ReactNode } from 'react';
import Icon from './Icon';

/** Botón pequeño "Pantalla completa" (sirve dentro de un <summary> sin cerrar el <details>). */
export function ExpandButton({ onClick, label = 'Pantalla completa' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-950"
    >
      <Icon name="expand" size={14} />
      {label}
    </button>
  );
}

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Texto a pantalla completa. Se sale fácil de cuatro formas: la ✕ de arriba, el botón «Cerrar»,
 * la tecla Esc y el botón «atrás» del móvil (que cierra solo esto, no la práctica).
 */
export default function FullscreenOverlay({ title, onClose, children }: Props) {
  const pushed = useRef(false); // ¿hay una entrada de historial nuestra?
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = () => {
    if (pushed.current) window.history.back(); // dispara popstate → cierra
    else onCloseRef.current();
  };

  useEffect(() => {
    // setTimeout 0: así el doble montaje de StrictMode (desarrollo) no deja entradas de historial de sobra
    const timer = setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), fsOverlay: true }, '');
      pushed.current = true;
    }, 0);
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (pushed.current) {
        pushed.current = false;
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-slate-800">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Cerrar pantalla completa"
          className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Icon name="close" size={26} />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold">{title}</h2>
        <button type="button" onClick={requestClose} className="btn-primary !py-2">
          Cerrar
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl text-lg leading-relaxed md:text-xl">{children}</div>
      </div>
    </div>
  );
}
