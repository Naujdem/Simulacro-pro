import { useId, useState, type ReactNode } from 'react';
import Icon from './Icon';

function readOpen(key: string | undefined, fallback: boolean): boolean {
  if (!key) return fallback;
  try {
    const v = localStorage.getItem(`collapsible:${key}`);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

interface Props {
  title: ReactNode;
  /** Número o texto pequeño junto al título (por ejemplo, cuántos elementos hay dentro). */
  count?: ReactNode;
  /** Si se pasa, recuerda si el usuario la dejó abierta o cerrada. */
  storageKey?: string;
  defaultOpen?: boolean;
  /** 'plain': título pequeño sobre la página. 'card': todo el bloque dentro de una tarjeta. */
  variant?: 'plain' | 'card';
  children: ReactNode;
}

/** Sección que se abre y se cierra tocando su título; sirve para que no se vea todo a la vez. */
export default function Collapsible({ title, count, storageKey, defaultOpen = false, variant = 'plain', children }: Props) {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));
  const bodyId = useId();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try {
        localStorage.setItem(`collapsible:${storageKey}`, next ? '1' : '0');
      } catch {
        /* sin almacenamiento: solo se pierde la memoria de la preferencia */
      }
    }
  };

  const card = variant === 'card';
  const header = (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-controls={bodyId}
      className={`flex w-full items-center justify-between gap-3 text-left ${card ? 'p-4' : 'py-1'}`}
    >
      <span className={`flex items-center gap-2 ${card ? 'font-semibold' : 'section-title'}`}>
        {title}
        {count !== undefined && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            {count}
          </span>
        )}
      </span>
      <Icon
        name="chevron"
        size={18}
        className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      />
    </button>
  );

  return (
    <section className={card ? 'card' : undefined}>
      {header}
      {open && (
        <div id={bodyId} className={card ? 'px-4 pb-4' : 'mt-2'}>
          {children}
        </div>
      )}
    </section>
  );
}
