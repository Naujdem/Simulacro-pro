import { useEffect, useRef, useState } from 'react';
import { PROVIDER_NAMES, getProvider, setProvider, translateWord, type AiProvider } from '@/features/ai/translate';
import { VOCAB_DECK, addVocabularyCard } from '@/features/flashcards/api';

interface Props {
  word: string;
  /** Frase del texto donde aparece la palabra. */
  sentence: string;
  onClose: () => void;
  /** Se llama cuando la ficha quedó guardada (o ya existía). */
  onAdded: (word: string) => void;
}

type Done = 'added' | 'duplicate' | null;

/** Ventana al tocar una palabra de una lectura: traducción con IA (editable), frase de ejemplo y "Agregar a Vocabulario". */
export default function WordPopup({ word, sentence, onClose, onAdded }: Props) {
  const [translation, setTranslation] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiError, setAiError] = useState('');
  const [usedOther, setUsedOther] = useState<AiProvider | null>(null); // la IA elegida falló y respondió la otra
  const [provider, setProv] = useState<AiProvider>(getProvider);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done>(null);
  const typed = useRef(false); // si el usuario ya escribió su propia traducción, la IA no la pisa

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAiError('');
    setUsedOther(null);
    translateWord(word, sentence, provider)
      .then((t) => {
        if (cancelled) return;
        if (!typed.current) setTranslation(t.text);
        if (t.provider !== provider) setUsedOther(t.provider);
      })
      .catch((e: Error) => !cancelled && setAiError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [word, sentence, provider]);

  // Cambiar de IA: se recuerda para las siguientes palabras
  const choose = (p: AiProvider) => {
    if (p === provider) return;
    setProvider(p);
    if (!typed.current) setTranslation('');
    setProv(p);
  };
  const other: AiProvider = provider === 'openrouter' ? 'gemini' : 'openrouter';

  // Tras guardar, se cierra sola para seguir leyendo
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onClose, 1400);
    return () => clearTimeout(t);
  }, [done, onClose]);

  async function add() {
    setSaving(true);
    setError('');
    try {
      const back = sentence ? `${translation.trim()}\n\nEjemplo: ${sentence}` : translation.trim();
      const r = await addVocabularyCard(word.toLowerCase(), back);
      setDone(r);
      onAdded(word);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // El ejemplo resalta la palabra tocada
  const example = sentence.split(new RegExp(`(\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b)`, 'i'));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Palabra: ${word}`}
        className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-2xl font-bold leading-tight">{word}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-slate-400">
            ✕
          </button>
        </div>

        {done ? (
          <p role="status" className="rounded-2xl bg-green-100 p-4 text-center font-bold text-green-800 dark:bg-green-950 dark:text-green-200">
            {done === 'added' ? `✅ Ficha agregada a «${VOCAB_DECK}»` : `Ya tienes «${word.toLowerCase()}» en «${VOCAB_DECK}»`}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs" role="group" aria-label="IA para traducir">
              <span className="font-bold text-slate-500">Traducir con</span>
              {(['openrouter', 'gemini'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => choose(p)}
                  aria-pressed={provider === p}
                  className={`rounded-full border px-3 py-1 font-bold ${
                    provider === p ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  }`}
                >
                  {PROVIDER_NAMES[p]}
                </button>
              ))}
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-500">Traducción</span>
              <input
                value={translation}
                onChange={(e) => {
                  typed.current = true;
                  setTranslation(e.target.value);
                }}
                placeholder={loading ? 'Traduciendo…' : 'Escribe la traducción'}
                className="w-full rounded-xl border border-slate-200 bg-transparent p-3 text-lg font-semibold outline-none focus:border-sky-400 dark:border-slate-600"
              />
            </label>
            {usedOther && !aiError && (
              <p className="text-xs text-slate-500">
                {PROVIDER_NAMES[provider]} no respondió; se tradujo con {PROVIDER_NAMES[usedOther]}.
              </p>
            )}
            {aiError && (
              <div className="space-y-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <p className="whitespace-pre-line">{aiError}</p>
                <button onClick={() => choose(other)} className="rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white">
                  🔁 Probar con {PROVIDER_NAMES[other]}
                </button>
                <p>O escribe la traducción tú.</p>
              </div>
            )}

            {sentence && (
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500">Ejemplo</span>
                <p className="rounded-xl bg-slate-100 p-3 text-sm leading-relaxed dark:bg-slate-900">
                  {example.map((part, i) =>
                    i % 2 === 1 ? (
                      <mark key={i} className="rounded bg-amber-200 px-0.5 font-bold dark:bg-amber-700">
                        {part}
                      </mark>
                    ) : (
                      <span key={i}>{part}</span>
                    ),
                  )}
                </p>
              </div>
            )}

            <button
              onClick={add}
              disabled={saving || !translation.trim()}
              className="w-full rounded-2xl bg-sky-500 py-3 font-bold text-white disabled:opacity-50"
            >
              {saving ? 'Guardando…' : '➕ Agregar a Vocabulario'}
            </button>
            {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
