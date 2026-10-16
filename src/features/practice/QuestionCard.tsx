import { useEffect, useRef, useState } from 'react';
import { Question, Response, checkAnswer, correctText } from '@/lib/grading';
import QuestionImage from '@/components/QuestionImage';
import AiPanel from '@/features/ai/AiPanel';
import ReadingText from './ReadingText';
import FullscreenOverlay, { ExpandButton } from '@/components/FullscreenText';
import { saveQuestionTag, type QuestionTag } from '@/features/exams/api';

type Props = {
  question: Question;
  examId: string;
  onNext: (r: Response, correct: boolean) => void;
  /** Texto de lectura al que pertenece la pregunta (comprensión lectora). */
  reading?: { title: string; body: string } | null;
  /** Muestra "Explicación con IA / Preguntas similares" en cuanto te equivocas (se usa en los repasos). */
  aiHelp?: boolean;
  /** Visitante sin cuenta (simulacro compartido): no hay etiquetas que guardar; se avanza con "Siguiente". */
  anonymous?: boolean;
};

const TAGS: { id: QuestionTag; label: string; className: string }[] = [
  { id: 'mal', label: 'Mal', className: 'bg-red-500' },
  { id: 'ok', label: 'Ok', className: 'bg-amber-500' },
  { id: 'bien', label: 'Bien', className: 'bg-sky-500' },
  { id: 'excelente', label: 'Excelente', className: 'bg-green-500' },
];

const emptyResponse = (q: Question): Response => {
  switch (q.type) {
    case 'multiple_choice':
      return { type: 'multiple_choice', selected: [] };
    case 'true_false':
      return { type: 'true_false', value: null };
    case 'order_words':
      return { type: 'order_words', order: [] };
    case 'fill_blank':
      return {
        type: 'fill_blank',
        blanks: Array((q.prompt.match(/\{\{\d+\}\}/g) ?? []).length).fill(''),
      };
    default:
      return { type: 'short_answer', text: '' }; // short_answer y transform
  }
};

const isReady = (q: Question, r: Response) =>
  r.type === 'multiple_choice'
    ? r.selected.length > 0
    : r.type === 'true_false'
      ? r.value !== null
      : r.type === 'fill_blank'
        ? r.blanks.every((b) => b.trim())
        : r.type === 'order_words'
          ? r.order.length === (q.options?.length ?? 0)
          : r.type === 'short_answer'
            ? r.text.trim().length > 0
            : false;

const base = 'flex h-full w-full items-start gap-3 rounded-2xl border-2 p-4 text-left font-semibold transition active:scale-[.98] ';

/** Desde esta cantidad de caracteres el enunciado se considera «largo» (caja con scroll + pantalla completa). */
const LONG_PROMPT = 380;
const styles = {
  idle: 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800',
  selected: 'border-sky-400 bg-sky-50 dark:bg-sky-950',
  right: 'border-green-500 bg-green-100 text-green-900 animate-pop dark:bg-green-950 dark:text-green-100',
  wrong: 'border-red-500 bg-red-100 text-red-900 animate-shake dark:bg-red-950 dark:text-red-100',
  dim: 'border-slate-200 opacity-50 dark:border-slate-700',
} as const;
type S = keyof typeof styles;

export function QuestionCard({ question: q, examId, onNext, aiHelp = false, reading = null, anonymous = false }: Props) {
  const [resp, setResp] = useState<Response>(() => emptyResponse(q)); // usar key={q.id} en el padre
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [savingTag, setSavingTag] = useState(false);
  const [tagError, setTagError] = useState('');
  const checked = correct !== null;
  const check = () => setCorrect(checkAnswer(q, resp));
  const aiRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState<'reading' | 'prompt' | null>(null); // texto largo a pantalla completa
  const showAi = aiHelp && checked && correct === false;

  // Al fallar, lleva la vista a la ayuda de IA (la barra de abajo tapa el final de la página)
  useEffect(() => {
    if (showAi) aiRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [showAi]);

  async function pickTag(tag: QuestionTag) {
    if (savingTag || correct === null) return;
    setSavingTag(true);
    setTagError('');
    try {
      await saveQuestionTag(q.id, examId, tag);
      onNext(resp, correct);
    } catch (e) {
      setTagError((e as Error).message || 'No se pudo guardar la etiqueta');
      setSavingTag(false);
    }
  }

  const multi = q.type === 'multiple_choice' && q.answer.correct.length > 1;
  const longPrompt = q.type !== 'fill_blank' && q.prompt.length > LONG_PROMPT;

  function pick(id: string) {
    if (checked || resp.type !== 'multiple_choice') return;
    setResp({
      ...resp,
      selected: multi
        ? resp.selected.includes(id)
          ? resp.selected.filter((x) => x !== id)
          : [...resp.selected, id]
        : [id],
    });
  }

  const optionState = (id: string): S => {
    if (resp.type !== 'multiple_choice') return 'idle';
    const sel = resp.selected.includes(id);
    const right = q.answer.correct.includes(id);
    if (checked) return right ? 'right' : sel ? 'wrong' : 'dim';
    return sel ? 'selected' : 'idle';
  };

  // En PC las opciones se ordenan en mosaico (en el móvil siguen en una columna).
  // Con texto de lectura encima se mantienen 2 por fila.
  const n = q.options?.length ?? 0;
  const cols = reading
    ? 'md:grid-cols-2'
    : n <= 2
      ? 'md:grid-cols-2'
      : n === 3
        ? 'md:grid-cols-3'
        : n === 4
          ? 'md:grid-cols-2 xl:grid-cols-4'
          : 'md:grid-cols-2 lg:grid-cols-3';

  const promptNode = q.type !== 'fill_blank' && (
    <div className="mb-5 md:mb-6">
      {longPrompt && (
        <div className="mb-1 flex justify-end">
          <ExpandButton onClick={() => setFull('prompt')} />
        </div>
      )}
      <h2
        className={
          longPrompt
            ? 'max-h-[42dvh] overflow-y-auto whitespace-pre-line rounded-2xl bg-slate-100/70 p-4 text-base font-semibold leading-relaxed md:max-h-[36dvh] dark:bg-slate-800/60'
            : 'whitespace-pre-line text-xl font-bold leading-snug md:text-2xl'
        }
      >
        {q.prompt}
      </h2>
      {multi && <span className="mt-1 block text-sm font-normal text-slate-500">Selecciona todas las correctas</span>}
    </div>
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col px-4 pb-72 pt-4 md:max-w-6xl md:pb-56">
      {/* Con lectura: el texto arriba (a todo lo ancho) y la pregunta con sus opciones debajo, en móvil y en PC */}
      <div>
        {reading && (
          <details
            open
            className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 md:mb-6 dark:border-amber-800 dark:bg-amber-950/30"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-bold">
              <span className="min-w-0 truncate">📖 {reading.title}</span>
              <ExpandButton onClick={() => setFull('reading')} />
            </summary>
            <ReadingText title={reading.title} body={reading.body} />
          </details>
        )}

        <div className="min-w-0">
          {q.imagen_url && <QuestionImage src={q.imagen_url} className="mb-4" />}
          {q.type === 'transform' && (
            <p className="mb-1 text-sm font-bold text-sky-500 dark:text-sky-300">
              Escríbela en forma {q.answer?.form ?? 'distinta'}:
            </p>
          )}
          {promptNode}

          {q.type === 'multiple_choice' && (
            <div className={`grid grid-cols-1 gap-3 ${cols}`}>
              {q.options!.map((o) => (
                <button
                  key={o.id}
                  onClick={() => pick(o.id)}
                  disabled={checked}
                  className={base + styles[optionState(o.id)]}
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-sm uppercase">
                    {o.id}
                  </span>
                  <span className="min-w-0 flex-1 space-y-2">
                    {o.text ? <span className="block">{o.text}</span> : null}
                    {o.imagen_url ? <QuestionImage src={o.imagen_url} className="max-h-40" /> : null}
                  </span>
                </button>
              ))}
            </div>
          )}

          {q.type === 'true_false' && resp.type === 'true_false' && (
            <div className="grid grid-cols-2 gap-3 md:mx-auto md:max-w-xl">
              {([true, false] as const).map((v) => {
                const sel = resp.value === v;
                const right = q.answer.value === v;
                const s: S = checked ? (right ? 'right' : sel ? 'wrong' : 'dim') : sel ? 'selected' : 'idle';
                return (
                  <button
                    key={String(v)}
                    disabled={checked}
                    onClick={() => setResp({ type: 'true_false', value: v })}
                    className={base + 'justify-center py-8 text-center text-lg ' + styles[s]}
                  >
                    {v ? 'Verdadero' : 'Falso'}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'fill_blank' && resp.type === 'fill_blank' && (
            <p className="text-xl leading-loose">
              {q.prompt.split(/(\{\{\d+\}\})/).map((part, k) => {
                const m = part.match(/^\{\{(\d+)\}\}$/);
                if (!m) return <span key={k}>{part}</span>;
                const i = Number(m[1]) - 1;
                return (
                  <input
                    key={k}
                    value={resp.blanks[i] ?? ''}
                    disabled={checked}
                    onChange={(e) =>
                      setResp({ ...resp, blanks: resp.blanks.map((b, j) => (j === i ? e.target.value : b)) })
                    }
                    className={`mx-1 w-32 rounded-lg border-b-4 bg-transparent px-2 text-center outline-none ${
                      checked ? (correct ? 'border-green-500' : 'border-red-500') : 'border-sky-400'
                    }`}
                    aria-label={`Espacio ${i + 1}`}
                  />
                );
              })}
            </p>
          )}

          {q.type === 'order_words' && resp.type === 'order_words' && (
            <div className="space-y-4">
              <div
                aria-label="Tu oración"
                className={`flex min-h-16 flex-wrap gap-2 rounded-2xl border-2 border-dashed p-3 ${
                  checked ? (correct ? 'border-green-500' : 'border-red-500') : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {!resp.order.length && <span className="text-sm text-slate-400">Toca las palabras en orden…</span>}
                {resp.order.map((id) => (
                  <button
                    key={id}
                    disabled={checked}
                    onClick={() => setResp({ ...resp, order: resp.order.filter((x) => x !== id) })}
                    className="rounded-xl border-2 border-sky-400 bg-sky-50 px-3 py-2 font-semibold dark:bg-sky-950"
                  >
                    {q.options!.find((o) => o.id === id)?.text}
                  </button>
                ))}
              </div>
              <div aria-label="Palabras" className="flex flex-wrap gap-2">
                {q.options!.map((o) => {
                  const used = resp.order.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      disabled={checked || used}
                      onClick={() => setResp({ ...resp, order: [...resp.order, o.id] })}
                      className={`rounded-xl border-2 px-3 py-2 font-semibold ${
                        used
                          ? 'border-slate-200 opacity-30 dark:border-slate-700'
                          : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                      }`}
                    >
                      {o.text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(q.type === 'short_answer' || q.type === 'transform') && resp.type === 'short_answer' && (
            <input
              autoFocus
              value={resp.text}
              disabled={checked}
              placeholder="Escribe tu respuesta…"
              onChange={(e) => setResp({ type: 'short_answer', text: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && isReady(q, resp) && !checked && check()}
              className={`w-full rounded-2xl border-2 bg-transparent p-4 text-lg outline-none ${
                checked ? (correct ? 'border-green-500' : 'border-red-500') : 'border-slate-300 focus:border-sky-400'
              }`}
            />
          )}

          {checked && q.explanation && (
            <div className="mt-6 space-y-1 rounded-2xl border-2 border-sky-300 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/40">
              <p className="text-sm font-bold">📖 Explicación</p>
              <p className="whitespace-pre-line text-sm">{q.explanation}</p>
            </div>
          )}

          {showAi && (
            <div ref={aiRef} className="mt-6 space-y-2 rounded-2xl border-2 border-sky-300 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/40">
              <p className="text-sm font-bold">¿No te quedó claro? Pide ayuda a la IA</p>
              <AiPanel q={q} examId={examId} />
            </div>
          )}
        </div>
      </div>

      {full === 'reading' && reading && (
        <FullscreenOverlay title={reading.title} onClose={() => setFull(null)}>
          <ReadingText title={reading.title} body={reading.body} className="max-h-none overflow-visible text-lg md:text-xl" />
        </FullscreenOverlay>
      )}
      {full === 'prompt' && (
        <FullscreenOverlay title="Enunciado" onClose={() => setFull(null)}>
          <p className="whitespace-pre-line font-semibold">{q.prompt}</p>
        </FullscreenOverlay>
      )}

      <footer
        aria-live="polite"
        className={`fixed inset-x-0 bottom-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-colors ${
          !checked
            ? 'bg-white dark:bg-slate-900'
            : correct
              ? 'animate-slideUp bg-green-100 dark:bg-green-950'
              : 'animate-slideUp bg-red-100 dark:bg-red-950'
        }`}
      >
        <div className="mx-auto max-w-xl md:max-w-2xl">
          {checked && (
            <div className="mb-3">
              <p
                className={`text-lg font-bold ${
                  correct ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                }`}
              >
                {correct ? '¡Correcto! 🎉' : 'Incorrecto'}
              </p>
              {!correct && (
                <p className="text-sm">
                  Respuesta correcta: <b>{correctText(q)}</b>
                </p>
              )}
            </div>
          )}
          {!checked ? (
            <button
              disabled={!isReady(q, resp)}
              onClick={check}
              className="w-full rounded-2xl bg-sky-500 py-4 text-base font-bold tracking-wide text-white active:bg-sky-600 disabled:bg-slate-300 disabled:text-slate-500"
            >
              Comprobar
            </button>
          ) : anonymous ? (
            <button
              onClick={() => onNext(resp, correct!)}
              className="w-full rounded-2xl bg-sky-500 py-4 text-base font-extrabold uppercase tracking-wide text-white active:bg-sky-600"
            >
              Siguiente →
            </button>
          ) : (
            <div>
              <p className="mb-2 text-sm font-bold">¿Cómo te fue en esta pregunta?</p>
              <div className="grid grid-cols-4 gap-2">
                {TAGS.map((t) => (
                  <button
                    key={t.id}
                    disabled={savingTag}
                    onClick={() => pickTag(t.id)}
                    className={`rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-50 ${t.className}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {savingTag && <p className="mt-2 text-center text-xs font-bold opacity-70">Guardando…</p>}
              {tagError && <p className="mt-2 text-center text-xs font-bold text-red-600">{tagError}</p>}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
