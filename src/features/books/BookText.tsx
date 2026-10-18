import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeWord, phraseBetween, sentenceAt, splitWords, wordsOf } from '@/lib/readingWords';
import WordPopup from '@/features/practice/WordPopup';
import type { Block } from './epub';

/** Lo más largo que se puede traducir de una vez: la función de traducción acepta hasta 160 letras. */
const MAX_WORDS = 30;
const MAX_CHARS = 160;

/** Lo elegido: palabras de la `a` a la `b` (números de palabra dentro del párrafo) y la que se tocó primero (`o`). */
interface Sel {
  block: number;
  a: number;
  b: number;
  o: number;
}

/**
 * Texto de un capítulo con cada palabra tocable: traducción, diccionario y «Agregar a Vocabulario» (la misma ventana de las lecturas).
 * Para frases y phrasal verbs hay dos caminos: tocar una palabra y sumar las de al lado desde la ventana, o seleccionar el texto
 * (arrastrando en PC, manteniendo el dedo en el celular) y tocar «Traducir».
 */
export default function BookText({ blocks }: { blocks: Block[] }) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [offer, setOffer] = useState<{ sel: Sel; x: number; y: number } | null>(null); // botón «Traducir» junto al texto seleccionado
  const root = useRef<HTMLDivElement>(null);

  const words = useMemo(() => blocks.map((b) => wordsOf(b.text)), [blocks]);
  const fits = (s: Sel) => s.b - s.a + 1 <= MAX_WORDS && phraseBetween(blocks[s.block].text, words[s.block], s.a, s.b).length <= MAX_CHARS;

  const open = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>('[data-start]');
    if (!el) return;
    const block = Number(el.dataset.block);
    const w = Number(el.dataset.w);
    if (blocks[block] && words[block]?.[w]) setSel({ block, a: w, b: w, o: w });
  };

  // Texto seleccionado con el dedo o el mouse: se ofrece traducirlo si son palabras de un solo párrafo
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const s = window.getSelection();
      const el = root.current;
      if (!s || !el || s.rangeCount === 0 || s.isCollapsed) return setOffer(null);
      const r = s.getRangeAt(0);
      if (!el.contains(r.commonAncestorContainer)) return setOffer(null);
      let hit: Sel | null = null;
      for (let i = 0; i < el.children.length; i++) {
        const child = el.children[i];
        if (!r.intersectsNode(child)) continue;
        if (hit) return setOffer(null); // abarca más de un párrafo
        let a = -1;
        let b = -1;
        child.querySelectorAll<HTMLElement>('[data-w]').forEach((sp) => {
          if (!r.intersectsNode(sp)) return;
          const w = Number(sp.dataset.w);
          if (a < 0) a = w;
          b = w;
        });
        if (a < 0) return setOffer(null);
        hit = { block: i, a, b, o: a };
      }
      if (!hit || !fits(hit)) return setOffer(null);
      const box = r.getBoundingClientRect();
      const below = box.bottom + 46 < window.innerHeight;
      setOffer({
        sel: hit,
        x: Math.min(window.innerWidth - 70, Math.max(70, box.left + box.width / 2)),
        y: below ? box.bottom + 14 : Math.max(8, box.top - 52),
      });
    };
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(check, 250);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, words]);

  // Un capítulo puede tener miles de palabras: solo se vuelve a armar cuando cambia el texto o las palabras guardadas
  const content = useMemo(
    () =>
      blocks.map((b, i) => {
        let w = 0; // número de palabra dentro del párrafo
        const pieces = splitWords(b.text).map((p) =>
          p.word ? (
            <span
              key={p.start}
              role="button"
              tabIndex={0}
              data-start={p.start}
              data-block={i}
              data-w={w++}
              className={`cursor-pointer rounded-sm hover:bg-amber-200/70 active:bg-amber-300 dark:hover:bg-amber-800/60 ${
                added.has(normalizeWord(p.text)) ? 'underline decoration-green-500 decoration-2 underline-offset-2' : ''
              }`}
            >
              {p.text}
            </span>
          ) : (
            p.text
          ),
        );
        return b.t === 'h' ? (
          <h2 key={i} className="mb-4 mt-8 font-sans text-2xl font-bold leading-tight [break-after:avoid] first:mt-0">
            {pieces}
          </h2>
        ) : (
          <p key={i} className="mb-4 whitespace-pre-line [orphans:2] [widows:2]">
            {pieces}
          </p>
        );
      }),
    [blocks, added],
  );

  // La ventana: la palabra o frase elegida y qué tanto se puede ampliar a cada lado
  const ws = sel ? words[sel.block] : undefined;
  const cur = sel && ws?.[sel.a] && ws[sel.b] ? sel : null;
  const first = cur && ws ? ws[cur.a] : undefined;
  const last = cur && ws ? ws[cur.b] : undefined;

  return (
    <>
      <div
        ref={root}
        onClick={(e) => open(e.target)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(e.target))}
      >
        {content}
      </div>

      {/* Todo lo que sigue va en el body: el texto está dentro de columnas desplazadas con transform y ahí algo fijo quedaría mal ubicado */}
      {offer &&
        !cur &&
        createPortal(
          <button
            // pointerdown/mousedown no deben quitar la selección antes de tocar el botón
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setSel(offer.sel);
              setOffer(null);
              window.getSelection()?.removeAllRanges();
            }}
            style={{ position: 'fixed', left: offer.x, top: offer.y, transform: 'translateX(-50%)' }}
            className="z-40 rounded-full bg-sky-600 px-4 py-2 text-sm font-bold text-white shadow-lg active:bg-sky-700"
          >
            {offer.sel.a === offer.sel.b ? 'Traducir' : 'Traducir frase'}
          </button>,
          document.body,
        )}
      {cur &&
        ws &&
        first &&
        last &&
        createPortal(
          <WordPopup
            word={phraseBetween(blocks[cur.block].text, ws, cur.a, cur.b)}
            sentence={sentenceAt(blocks[cur.block].text, first.start, last.start + last.text.length - 1)}
            onClose={() => setSel(null)}
            // Solo una palabra suelta se subraya en el texto; una frase guardada no marca cada una de sus palabras
            onAdded={(w) => !/\s/.test(w) && setAdded((s) => new Set(s).add(normalizeWord(w)))}
            extend={{
              left: cur.a > 0 && fits({ ...cur, a: cur.a - 1 }),
              right: cur.b < ws.length - 1 && fits({ ...cur, b: cur.b + 1 }),
              multi: cur.a !== cur.b,
              onLeft: () => setSel({ ...cur, a: cur.a - 1 }),
              onRight: () => setSel({ ...cur, b: cur.b + 1 }),
              onReset: () => setSel({ ...cur, a: cur.o, b: cur.o }),
            }}
          />,
          document.body,
        )}
    </>
  );
}
