import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '@/components/Icon';
import BookText from './BookText';
import type { Chapter } from './epub';
import { getRemoteProgress, pickProgress, pushRemoteProgress } from './driveBooks';
import { getBook, getProgress, saveProgress, type BookMeta, type Progress } from './store';

const FONT_KEY = 'simulapro:book-font';
const MIN_FONT = 14;
const MAX_FONT = 30;
/** Ancho (px) del área de lectura desde el cual se muestran dos páginas, como un libro abierto. */
const WIDE = 820;

type Pending = number | 'last' | null;

function readFont(): number {
  try {
    const n = Number(localStorage.getItem(FONT_KEY));
    return n >= MIN_FONT && n <= MAX_FONT ? n : 19;
  } catch {
    return 19;
  }
}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Idioma probable del capítulo (para que la separación de palabras con guion sea la correcta). */
function guessLang(ch: Chapter | undefined): 'es' | 'en' {
  const sample = (ch?.blocks ?? []).slice(0, 12).map((b) => b.text).join(' ').toLowerCase();
  const count = (re: RegExp) => (sample.match(re) ?? []).length;
  return count(/\b(el|la|los|las|de|que|y|en|una|por|con)\b/g) > count(/\b(the|and|of|to|in|that|is|was|with)\b/g) ? 'es' : 'en';
}

/**
 * Lector de libros en modo libro: el capítulo se reparte en páginas (dos en PC, una en el celular) y se pasa de página
 * con las flechas, los bordes de la pantalla, deslizando el dedo o el teclado. Ya no hay scroll vertical.
 * Funciona con columnas CSS: el texto fluye en columnas del alto de la pantalla y se desplaza de a una página.
 */
export default function BookReaderPage() {
  const { bookId } = useParams();
  const nav = useNavigate();
  const [book, setBook] = useState<{ meta: BookMeta; chapters: Chapter[] } | 'missing' | null>(null);
  const [idx, setIdx] = useState(0);
  const [tocOpen, setTocOpen] = useState(() => window.innerWidth >= 768);
  const [font, setFont] = useState(readFont);
  const [page, setPage] = useState(0);
  const [metrics, setMetrics] = useState({ pages: 1, step: 0 }); // páginas del capítulo y desplazamiento de una página a otra
  const [anim, setAnim] = useState(false);
  const [stageW, setStageW] = useState(() => window.innerWidth);
  const stage = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const pending = useRef<Pending>(null); // posición que falta aplicar al abrir el capítulo (fracción 0–1, o 'last' = última página)
  const ready = useRef(false); // hasta restaurar lo guardado no se guarda nada (para no pisarlo con 0)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef({ id: '', driveId: '', idx: 0, frac: 0 });

  const cols = stageW >= WIDE ? 2 : 1;
  const gap = cols === 2 ? 64 : 40;

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
        const frac = p && start === p.chapter ? p.scroll : 0;
        pending.current = frac;
        latest.current = { id: b.meta.id, driveId: b.meta.driveId ?? '', idx: start, frac };
        setIdx(start);
        setBook(b);
      })
      .catch(() => !cancelled && setBook('missing'));
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Guarda dónde vas (con una pausa para no escribir en cada página) y también al salir del libro
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

  // Ancho disponible: decide si se muestran una o dos páginas
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, [book]);

  // Reparte el capítulo en páginas y vuelve a la posición guardada. Se repite si cambia el tamaño de la ventana,
  // el de la letra o el número de páginas visibles; la posición se conserva como fracción del capítulo.
  useLayoutEffect(() => {
    if (!book || book === 'missing') return;
    const vp = viewport.current;
    const art = article.current;
    if (!vp || !art) return;
    const apply = () => {
      const W = vp.clientWidth;
      if (W < 50) return;
      const colW = (W - gap * (cols - 1)) / cols;
      const columns = Math.max(1, Math.round((art.scrollWidth + gap) / (colW + gap)));
      const n = Math.max(1, Math.ceil(columns / cols));
      const pend = pending.current;
      pending.current = null;
      const frac = pend === 'last' ? 1 : pend ?? latest.current.frac;
      const p = n > 1 ? Math.min(n - 1, Math.max(0, Math.round(frac * (n - 1)))) : 0;
      setAnim(false);
      setMetrics({ pages: n, step: W + gap });
      setPage(p);
      ready.current = true;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(vp);
    let off = false;
    document.fonts?.ready.then(() => !off && apply()).catch(() => {});
    return () => {
      off = true;
      ro.disconnect();
    };
  }, [book, idx, font, cols, gap]);

  const total = book && book !== 'missing' ? book.chapters.length : 0;

  const go = useCallback(
    (n: number, pend: Pending = 0) => {
      if (n < 0 || n >= total) return;
      setAnim(false);
      latest.current = { ...latest.current, idx: n, frac: pend === 'last' ? 1 : pend ?? 0 };
      if (n === idx) {
        pending.current = null;
        setPage(pend === 'last' ? Math.max(0, metrics.pages - 1) : 0);
      } else {
        pending.current = pend;
        setIdx(n);
        setPage(0);
      }
      persist(true);
    },
    [total, idx, metrics.pages, persist],
  );

  /** Pasa una página; al llegar al final (o al principio) del capítulo sigue con el siguiente (o el anterior). */
  const turn = useCallback(
    (dir: 1 | -1) => {
      const next = page + dir;
      if (next < 0) return idx > 0 ? go(idx - 1, 'last') : undefined;
      if (next >= metrics.pages) return idx < total - 1 ? go(idx + 1, 0) : undefined;
      setAnim(!reduceMotion());
      setPage(next);
      latest.current = { ...latest.current, frac: metrics.pages > 1 ? next / (metrics.pages - 1) : 0 };
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(), 600);
    },
    [page, metrics.pages, idx, total, go, persist],
  );

  // Teclado: ← → y AvPág/RePág pasan página (si no hay una ventana abierta)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role=dialog]') || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') turn(1);
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  const changeFont = (d: number) => {
    const next = Math.min(MAX_FONT, Math.max(MIN_FONT, font + d));
    setFont(next);
    try {
      localStorage.setItem(FONT_KEY, String(next));
    } catch {
      /* sin almacenamiento: vale solo mientras el libro está abierto */
    }
  };

  // Deslizar el dedo: a la izquierda = página siguiente, a la derecha = anterior
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
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
  const pct = metrics.pages > 1 ? Math.round((page / (metrics.pages - 1)) * 100) : 100;
  const atStart = idx === 0 && page === 0;
  const atEnd = idx === total - 1 && page >= metrics.pages - 1;

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

        {/* El libro: una página en el celular, dos en PC */}
        <main ref={stage} className="min-w-0 flex-1 bg-stone-200 md:p-5 dark:bg-slate-950">
          <div
            className="relative mx-auto h-full bg-[#fbf7ee] md:rounded-xl md:shadow-xl md:ring-1 md:ring-black/10 dark:bg-slate-900 dark:md:ring-white/10"
            style={{ maxWidth: cols === 2 ? 1180 : 700 }}
          >
            {/* Lomo del libro entre las dos páginas */}
            {cols === 2 && (
              <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/[0.07] to-transparent dark:via-black/30" />
            )}

            <div
              ref={viewport}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              className="absolute inset-x-8 inset-y-5 overflow-hidden md:inset-x-14 md:inset-y-8"
            >
              <article
                ref={article}
                lang={guessLang(ch)}
                className="h-full font-serif leading-[1.7]"
                style={{
                  fontSize: font,
                  columnCount: cols,
                  columnGap: gap,
                  columnFill: 'auto',
                  textAlign: 'justify',
                  hyphens: 'auto',
                  WebkitHyphens: 'auto',
                  transform: `translateX(${-page * metrics.step}px)`,
                  transition: anim ? 'transform 260ms ease' : 'none',
                }}
              >
                {!startsWithHeading && <h2 className="mb-6 font-sans text-2xl font-bold leading-tight [break-after:avoid]">{ch.title}</h2>}
                <BookText key={`${book.meta.id}-${idx}`} blocks={ch.blocks} />
              </article>
            </div>

            {/* Bordes para pasar de página (en PC con flecha; en el celular, toca el borde o desliza) */}
            <button
              onClick={() => turn(-1)}
              disabled={atStart}
              aria-label="Página anterior"
              className="absolute inset-y-0 left-0 z-10 flex w-8 items-center justify-center text-2xl text-slate-400 hover:bg-black/5 hover:text-slate-700 disabled:opacity-0 md:w-14 md:rounded-l-xl dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              <span className="hidden md:inline">‹</span>
            </button>
            <button
              onClick={() => turn(1)}
              disabled={atEnd}
              aria-label="Página siguiente"
              className="absolute inset-y-0 right-0 z-10 flex w-8 items-center justify-center text-2xl text-slate-400 hover:bg-black/5 hover:text-slate-700 disabled:opacity-0 md:w-14 md:rounded-r-xl dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              <span className="hidden md:inline">›</span>
            </button>
          </div>
        </main>
      </div>

      {/* Estado abajo */}
      <footer className="shrink-0 border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Capítulo anterior" className="px-1 text-lg disabled:opacity-30">
            ‹
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 tabular-nums">
            Cap. {idx + 1} de {total} · Pág. {Math.min(metrics.pages, page + 1)} de {metrics.pages}
          </span>
          <button onClick={() => go(idx + 1)} disabled={idx === total - 1} aria-label="Capítulo siguiente" className="px-1 text-lg disabled:opacity-30">
            ›
          </button>
        </div>
      </footer>
    </div>
  );
}
