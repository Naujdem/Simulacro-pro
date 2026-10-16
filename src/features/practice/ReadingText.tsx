import { useMemo, useState } from 'react';
import { normalizeWord, sentenceAt, splitWords } from '@/lib/readingWords';
import WordPopup from './WordPopup';

interface Props {
  title: string;
  body: string;
  /** Clases del cuadro de texto (alto máximo, tamaño de letra…). */
  className?: string;
  /** Oculta el aviso «Toca una palabra…» (útil cuando ya se muestra en otro lado). */
  hideHint?: boolean;
}

/** Texto de una lectura donde cada palabra se puede tocar para ver su traducción y guardarla como ficha. */
export default function ReadingText({ title, body, className = 'max-h-56 text-sm md:max-h-[42dvh] md:text-base', hideHint = false }: Props) {
  const pieces = useMemo(() => splitWords(body), [body]);
  const [picked, setPicked] = useState<{ word: string; sentence: string } | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set());

  const open = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>('[data-start]');
    if (!el) return;
    const start = Number(el.dataset.start);
    setPicked({ word: el.textContent ?? '', sentence: sentenceAt(body, start) });
  };

  return (
    <>
      <p
        aria-label={`Texto de la lectura ${title}. Toca una palabra para ver su traducción.`}
        className={`mt-2 overflow-y-auto whitespace-pre-line leading-relaxed ${className}`}
        onClick={(e) => open(e.target)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(e.target))}
      >
        {pieces.map((p) =>
          p.word ? (
            <span
              key={p.start}
              role="button"
              tabIndex={0}
              data-start={p.start}
              className={`cursor-pointer rounded-sm decoration-dotted underline-offset-2 hover:bg-amber-200/70 active:bg-amber-300 dark:hover:bg-amber-800/60 ${
                added.has(normalizeWord(p.text)) ? 'underline decoration-green-500 decoration-2' : ''
              }`}
            >
              {p.text}
            </span>
          ) : (
            p.text
          ),
        )}
      </p>
      {!hideHint && <p className="mt-1 text-xs text-slate-500">👆 Toca una palabra para traducirla y guardarla en Vocabulario.</p>}
      {picked && (
        <WordPopup
          word={picked.word}
          sentence={picked.sentence}
          onClose={() => setPicked(null)}
          onAdded={(w) => setAdded((s) => new Set(s).add(normalizeWord(w)))}
        />
      )}
    </>
  );
}
