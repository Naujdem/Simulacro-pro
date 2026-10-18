import { useEffect, useRef, useState } from 'react';
import { PROVIDER_NAMES, getProvider, setProvider, type AiProvider } from '@/features/ai/translate';
import { addVocabularyCard } from '@/features/flashcards/api';
import { chapterText, generateActivities, type Activities } from './activities';
import type { Block } from './epub';
import { getActivities, saveActivities } from './store';

interface Props {
  bookId: string;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
  blocks: Block[];
}

const optionClass = (state: 'idle' | 'right' | 'wrong' | 'dim') =>
  `block w-full rounded-xl border-2 px-3 py-2 text-left leading-snug transition ${
    state === 'right'
      ? 'border-green-500 bg-green-50 dark:bg-green-950'
      : state === 'wrong'
        ? 'border-red-500 bg-red-50 dark:bg-red-950'
        : state === 'dim'
          ? 'border-slate-200 opacity-60 dark:border-slate-700'
          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
  }`;

/** Actividades de comprensión al final de un capítulo, creadas con IA (como las de los libros de inglés). */
export default function ChapterActivities({ bookId, bookTitle, chapterIndex, chapterTitle, blocks }: Props) {
  const [acts, setActs] = useState<Activities | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProv] = useState<AiProvider>(getProvider);
  const [usedOther, setUsedOther] = useState<AiProvider | null>(null);
  const [mcqPick, setMcqPick] = useState<Record<number, number>>({});
  const [tfPick, setTfPick] = useState<Record<number, boolean>>({});
  const [vocabState, setVocabState] = useState<Record<string, 'added' | 'duplicate' | 'error'>>({});
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Si ya se crearon antes, se abren sin gastar IA
  useEffect(() => {
    let cancelled = false;
    getActivities(bookId, chapterIndex)
      .then((a) => !cancelled && setActs(a))
      .catch(() => {})
      .finally(() => !cancelled && setLoadingSaved(false));
    return () => {
      cancelled = true;
    };
  }, [bookId, chapterIndex]);

  async function create(p: AiProvider) {
    setBusy(true);
    setError('');
    setUsedOther(null);
    try {
      const r = await generateActivities({ title: bookTitle, chapter: chapterTitle, text: chapterText(blocks), provider: p });
      await saveActivities(bookId, chapterIndex, r.activities).catch(() => {}); // si no se puede guardar, igual se muestran
      if (!alive.current) return;
      setMcqPick({});
      setTfPick({});
      setVocabState({});
      setActs(r.activities);
      if (r.provider !== p) setUsedOther(r.provider);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const choose = (p: AiProvider) => {
    setProvider(p);
    setProv(p);
  };
  const other: AiProvider = provider === 'openrouter' ? 'gemini' : 'openrouter';

  async function addWord(word: string, translation: string) {
    try {
      const r = await addVocabularyCard(word.toLowerCase(), translation);
      setVocabState((s) => ({ ...s, [word]: r }));
    } catch {
      setVocabState((s) => ({ ...s, [word]: 'error' }));
    }
  }
  async function addAll() {
    for (const v of acts?.vocab ?? []) if (!vocabState[v.word] || vocabState[v.word] === 'error') await addWord(v.word, v.translation);
  }

  const box = 'mt-10 space-y-5 rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 font-sans leading-normal dark:border-sky-800 dark:bg-slate-800/60';
  const base = { fontSize: '1rem' };

  if (loadingSaved) return null;

  if (!acts) {
    return (
      <section className={box} style={base} aria-label="Actividades del capítulo">
        <h3 className="text-lg font-bold">📝 Actividades del capítulo</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Termina el capítulo con preguntas de comprensión, verdadero o falso, vocabulario y preguntas para conversar, creadas con IA a partir de lo que acabas de leer.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="IA para crear las actividades">
          <span className="font-bold text-slate-500">Crear con</span>
          {(['openrouter', 'gemini'] as const).map((p) => (
            <button
              key={p}
              onClick={() => choose(p)}
              aria-pressed={provider === p}
              className={`rounded-full border px-3 py-1 font-bold ${provider === p ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}
            >
              {PROVIDER_NAMES[p]}
            </button>
          ))}
        </div>
        <button onClick={() => create(provider)} disabled={busy} className="btn-primary w-full">
          {busy ? 'Creando actividades… (puede tardar unos segundos)' : '✨ Crear actividades con IA'}
        </button>
        {error && (
          <div role="alert" className="space-y-2 rounded-lg bg-amber-100 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <p className="whitespace-pre-line">{error}</p>
            <button
              onClick={() => {
                choose(other);
                create(other);
              }}
              disabled={busy}
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white disabled:opacity-60"
            >
              🔁 Probar con {PROVIDER_NAMES[other]}
            </button>
          </div>
        )}
      </section>
    );
  }

  const mcqDone = Object.keys(mcqPick).length;
  const tfDone = Object.keys(tfPick).length;
  const total = acts.mcq.length + acts.tf.length;
  const correct = acts.mcq.filter((q, i) => mcqPick[i] === q.correct).length + acts.tf.filter((t, i) => tfPick[i] === t.answer).length;
  const finished = mcqDone + tfDone === total;

  return (
    <section className={box} style={base} aria-label="Actividades del capítulo">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold">📝 Actividades del capítulo</h3>
        <button onClick={() => create(provider)} disabled={busy} className="shrink-0 text-xs font-bold text-sky-600 disabled:opacity-60 dark:text-sky-400">
          {busy ? 'Creando…' : '🔄 Crear otras'}
        </button>
      </div>
      {usedOther && <p className="text-xs text-slate-500">{PROVIDER_NAMES[provider]} no respondió; se crearon con {PROVIDER_NAMES[usedOther]}.</p>}
      {error && (
        <p role="alert" className="whitespace-pre-line rounded-lg bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </p>
      )}

      {acts.mcq.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-bold">Comprensión</h4>
          {acts.mcq.map((q, qi) => {
            const picked = mcqPick[qi];
            const answered = picked !== undefined;
            return (
              <div key={qi} className="space-y-2">
                <p className="font-semibold">
                  {qi + 1}. {q.question}
                </p>
                {q.options.map((o, oi) => (
                  <button
                    key={oi}
                    disabled={answered}
                    onClick={() => setMcqPick((s) => ({ ...s, [qi]: oi }))}
                    className={optionClass(!answered ? 'idle' : oi === q.correct ? 'right' : oi === picked ? 'wrong' : 'dim')}
                  >
                    {o}
                  </button>
                ))}
                {answered && (
                  <p className="text-sm" role="status">
                    {picked === q.correct ? '✅ ¡Correcto!' : '❌ Casi.'} {q.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {acts.tf.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-bold">¿Verdadero o falso?</h4>
          {acts.tf.map((t, ti) => {
            const picked = tfPick[ti];
            const answered = picked !== undefined;
            return (
              <div key={ti} className="space-y-2">
                <p className="font-semibold">
                  {ti + 1}. {t.statement}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {([true, false] as const).map((v) => (
                    <button
                      key={String(v)}
                      disabled={answered}
                      onClick={() => setTfPick((s) => ({ ...s, [ti]: v }))}
                      className={`${optionClass(!answered ? 'idle' : v === t.answer ? 'right' : v === picked ? 'wrong' : 'dim')} text-center font-semibold`}
                    >
                      {v ? 'True' : 'False'}
                    </button>
                  ))}
                </div>
                {answered && (
                  <p className="text-sm" role="status">
                    {picked === t.answer ? '✅ ¡Correcto!' : '❌ Casi.'} {t.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {finished && total > 0 && (
        <p role="status" className="rounded-xl bg-white p-3 text-center font-bold dark:bg-slate-900">
          Acertaste {correct} de {total} {correct === total ? '🎉' : correct >= total / 2 ? '👍' : '💪'}
        </p>
      )}

      {acts.vocab.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold">Vocabulario del capítulo</h4>
            <button onClick={addAll} className="text-xs font-bold text-sky-600 dark:text-sky-400">
              ➕ Agregar todas
            </button>
          </div>
          <ul className="divide-y divide-sky-200 rounded-xl bg-white dark:divide-slate-700 dark:bg-slate-900">
            {acts.vocab.map((v) => (
              <li key={v.word} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="font-bold">{v.word}</span> <span className="text-slate-500">— {v.translation}</span>
                </div>
                {vocabState[v.word] === 'added' || vocabState[v.word] === 'duplicate' ? (
                  <span className="text-xs font-bold text-green-600">{vocabState[v.word] === 'added' ? '✔ Agregada' : '✔ Ya la tenías'}</span>
                ) : (
                  <button onClick={() => addWord(v.word, v.translation)} className="shrink-0 rounded-lg border border-sky-500 px-2 py-1 text-xs font-bold text-sky-700 dark:text-sky-300">
                    {vocabState[v.word] === 'error' ? 'Reintentar' : '➕ Vocabulario'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {acts.speaking.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-bold">Para conversar o escribir</h4>
          <ul className="list-disc space-y-1 pl-5">
            {acts.speaking.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
