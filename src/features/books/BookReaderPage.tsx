import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '@/components/Icon';
import BookText from './BookText';
import type { Chapter } from './epub';
import { getRemoteProgress, pickProgress, pushRemoteProgress } from './driveBooks';
import { getBook, getProgress, saveProgress, type BookMeta, type Progress } from './store';

const FONT_KEY = 'simulapro:book-font';
const MIN_FONT = 14;
const MAX_FONT = 30;

function readFont(): number {
  try {
    const n = Number(localStorage.getItem(FONT_KEY));
    return n >= MIN_FONT && n <= MAX_FONT ? n : 19;
  } catch {
    return 19;
  }
}

/** Lector de libros, parecido al visor de Calibre: barra arriba, índice de capítulos a la izquierda, texto al centro y estado abajo. */
export default function BookReaderPage() {
  const { bookId } = useParams();
  const nav = useNavigate();
  const [book, setBook] = useState<{ meta: BookMeta; chapters: Chapter[] } | 'missing' | null>(null);
  const [idx, setIdx] = useState(0);
  const [tocOpen, setTocOpen] = useState(() => window.innerWidth >= 768);
  const [font, setFont] = useState(readFont);
  const [pct, setPct] = useState(0);
  const scroller = useRef<HTMLElement>(null);
  const pendingScroll = useRef<number | null>(null); // posición guardada que falta restaurar al abrir el capítulo
  const ready = useRef(false); // hasta restaurar lo guardado no se guarda nada (para no pisarlo con 0)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef({ id: '', driveId: '', idx: 0, frac: 0 });

  useEffect(() => {
    let cancelled = false;
    ready.current = false;
    const id = decodeURIComponent(bookId ?? '');
    // Si el libro está en tu Drive, se mira también dónde ibas en otro dispositivo (máximo 2 s de espera)
    const remote = async (): Promise<Progress | null> => {
      const b = await getBook(id);
      if (!b?.meta.driveId || !navigator.onLine) return null;
      const r = await Promise.race([getRemoteProgress(b.meta.driveId), new Promise<null>((ok) => setTimeout(() => ok(null), 2000))]).catch(() => null);
      return r ? { id, ...r } : null;
    };
    Promise.all([getBook(id), getProgress(id).catch(() => null), remote().catch(() => null)])
      .then(([b, local, far]) => {
        if (cancelled) return;
        if (!b) return setBook('missing');
        const p = pickProgress(local, far);
        const start = p ? Math.min(Math.max(0, p.chapter), b.chapters.length - 1) : 0;
        pendingScroll.current = p && start === p.chapter ? p.scroll : 0;
        latest.current = { id: b.meta.id, driveId: b.meta.driveId ?? '', idx: start, frac: pendingScroll.current };
        setIdx(start);
        setBook(b);
      })
      .catch(() => !cancelled && setBook('missing'));
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Guarda dónde vas (con una pausa para no escribir en cada pixel) y también al salir del libro
  // now = enviar ya a Drive (al cambiar de capítulo o al salir); si no, Drive recibe como mucho un envío cada 10 s
  const persist = useCallback((now = false) => {
    clearTimeout(saveTimer.current);
    const { id, driveId, idx: i, frac } = latest.current;
    if (!id || !ready.current) return;
    saveProgress(id, i, frac).catch(() => {});
    if (driveId) pushRemoteProgress(driveId, i, frac, { now });
  }, []);
  useEffect(() => {
    const flush = () => document.visibilityState === 'hidden' && persist(true);
    document.addEventListener('visibilitychange', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      persist(true);
    };
  }, [persist]);

  // Al abrir el capítulo, vuelve a la posición guardada
  useEffect(() => {
    if (!book || book === 'missing') return;
    const frac = pendingScroll.current;
    pendingScroll.current = null;
    const t = setTimeout(() => {
      const el = scroller.current;
      if (el && frac) el.scrollTop = frac * Math.max(0, el.scrollHeight - el.clientHeight);
      ready.current = true;
    }, 60);
    return () => clearTimeout(t);
  }, [book, idx]);

  const total = book && book !== 'missing' ? book.chapters.length : 0;
  const go = useCallback(
    (n: number) => {
      if (n < 0 || n >= total) return;
      setIdx(n);
      setPct(0);
      scroller.current?.scrollTo({ top: 0 });
      latest.current = { ...latest.current, idx: n, frac: 0 };
      persist(true);
    },
    [total, persist],
  );

  // Flechas ← → cambian de capítulo (si no hay una ventana abierta)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role=dialog]') || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      if (e.key === 'ArrowLeft') go(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, idx]);

  const changeFont = (d: number) => {
    const next = Math.min(MAX_FONT, Math.max(MIN_FONT, font + d));
    setFont(next);
    try {
      localStorage.setItem(FONT_KEY, String(next));
    } catch {
      /* sin almacenamiento: vale solo mientras el libro está abierto */
    }
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const frac = max > 0 ? Math.min(1, el.scrollTop / max) : 1;
    setPct(Math.round(frac * 100));
    latest.current = { ...latest.current, frac };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(), 600);
  };

  if (book === null) return <p className="p-6">Abriendo libro…</p>;
  if (book === 'missing') {
    return (
      <div className="space-y-3 p-6">
        <p>Este libro no está en este dispositivo.</p>
        <button onClick={() => nav('/books', { replace: true })} className="btn-primary">
          Volver a Libros
        </button>
      </div>
    );
  }

  const ch = book.chapters[idx];
  const startsWithHeading = ch.blocks[0]?.t === 'h';

  return (
    <div className="flex h-dvh flex-col bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      {/* Barra superior */}
      <header className="flex shrink-0 items-center gap-1 border-b border-slate-200 px-2 py-1.5 dark:border-slate-800">
        <button onClick={() => nav('/books')} aria-label="Volver a Libros" className="btn-ghost px-2.5">
          <Icon name="back" size={20} />
        </button>
        <button onClick={() => setTocOpen((o) => !o)} aria-label="Índice de capítulos" aria-pressed={tocOpen} className={`btn-ghost px-2.5 ${tocOpen ? 'text-sky-500' : ''}`}>
          ☰
        </button>
        <div className="min-w-0 flex-1 px-1 text-center">
          <p className="truncate text-sm font-bold">{book.meta.title}</p>
          <p className="truncate text-xs text-slate-500">{ch.title}</p>
        </div>
        <button onClick={() => changeFont(-2)} disabled={font <= MIN_FONT} aria-label="Letra más pequeña" className="btn-ghost px-2.5 text-xs">
          A−
        </button>
        <button onClick={() => changeFont(2)} disabled={font >= MAX_FONT} aria-label="Letra más grande" className="btn-ghost px-2.5 text-base">
          A+
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Índice: panel fijo en PC, cajón en el celular */}
        {tocOpen && <button aria-label="Cerrar índice" onClick={() => setTocOpen(false)} className="fixed inset-0 z-20 bg-black/40 md:hidden" />}
        {tocOpen && (
          <aside className="fixed inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white md:static md:z-auto md:max-w-none dark:border-slate-800 dark:bg-slate-900">
            <p className="section-title shrink-0 px-4 pb-2 pt-4">Capítulos</p>
            <ol className="min-h-0 flex-1 overflow-y-auto pb-4">
              {book.chapters.map((c, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      go(i);
                      if (window.innerWidth < 768) setTocOpen(false);
                    }}
                    aria-current={i === idx}
                    className={`block w-full px-4 py-2 text-left text-sm leading-snug hover:bg-slate-100 dark:hover:bg-slate-800 ${
                      i === idx ? 'bg-sky-50 font-bold text-sky-600 dark:bg-slate-800 dark:text-sky-400' : ''
                    }`}
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}

        {/* Texto del capítulo */}
        <main ref={scroller} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto">
          <article className="mx-auto max-w-2xl px-5 py-8 font-serif leading-[1.75]" style={{ fontSize: font }}>
            {!startsWithHeading && <h2 className="mb-6 font-sans text-2xl font-bold leading-tight">{ch.title}</h2>}
            <BookText key={`${book.meta.id}-${idx}`} blocks={ch.blocks} />
            <div className="mt-10 flex gap-3 font-sans text-base">
              <button onClick={() => go(idx - 1)} disabled={idx === 0} className="btn-secondary flex-1">
                ‹ Anterior
              </button>
              <button onClick={() => go(idx + 1)} disabled={idx === total - 1} className="btn-primary flex-1">
                {idx === total - 1 ? 'Fin del libro' : 'Siguiente ›'}
              </button>
            </div>
          </article>
        </main>
      </div>

      {/* Estado abajo */}
      <footer className="shrink-0 border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Capítulo anterior" className="px-1 text-lg disabled:opacity-30">
            ‹
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 tabular-nums">
            Cap. {idx + 1} de {total} · {pct} %
          </span>
          <button onClick={() => go(idx + 1)} disabled={idx === total - 1} aria-label="Capítulo siguiente" className="px-1 text-lg disabled:opacity-30">
            ›
          </button>
        </div>
      </footer>
    </div>
  );
}
