import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeWord, sentenceAt, splitWords } from '@/lib/readingWords';
import WordPopup from '@/features/practice/WordPopup';
import type { Block } from './epub';

/** Texto de un capítulo con cada palabra tocable: traducción, diccionario y «Agregar a Vocabulario» (la misma ventana de las lecturas). */
export default function BookText({ blocks }: { blocks: Block[] }) {
  const [picked, setPicked] = useState<{ word: string; sentence: string } | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set());

  const open = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>('[data-start]');
    if (!el) return;
    const block = blocks[Number(el.dataset.block)];
    if (!block) return;
    setPicked({ word: el.textContent ?? '', sentence: sentenceAt(block.text, Number(el.dataset.start)) });
  };

  // Un capítulo puede tener miles de palabras: solo se vuelve a armar cuando cambia el texto o las palabras guardadas
  const content = useMemo(
    () =>
      blocks.map((b, i) => {
        const pieces = splitWords(b.text).map((p) =>
          p.word ? (
            <span
              key={p.start}
              role="button"
              tabIndex={0}
              data-start={p.start}
              data-block={i}
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

  return (
    <>
      <div
        onClick={(e) => open(e.target)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(e.target))}
      >
        {content}
      </div>
      {/* En el body: el texto está dentro de columnas desplazadas con transform y ahí una ventana fija quedaría mal ubicada */}
      {picked &&
        createPortal(
          <WordPopup
            word={picked.word}
            sentence={picked.sentence}
            onClose={() => setPicked(null)}
            onAdded={(w) => setAdded((s) => new Set(s).add(normalizeWord(w)))}
          />,
          document.body,
        )}
    </>
  );
}
