import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMixedSession, QUICK_REVIEW_ID, SURPRISE_ID, usePractice } from '@/features/practice/practiceStore';
import { addToReview, fetchExams, fetchReviewIds, removeFromReview, setExamDifficulty } from '@/features/exams/api';
import StarRating from '@/components/StarRating';
import { generateSuggestion, MIN_FAILED, providerName } from '@/features/suggestions/api';
import { useDraft } from '@/features/suggestions/draftStore';
import { getProvider, setProvider, type AiProvider } from '@/features/ai/translate';
import QuestionImage from '@/components/QuestionImage';
import AiPanel from '@/features/ai/AiPanel';
import { correctText, type Question } from '@/lib/grading';
import { sectionRanges, sectionStats } from '@/lib/sections';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// En las preguntas de "completar espacios" muestra ____ en lugar de {{1}}
const showPrompt = (p: string) => p.replace(/\{\{\d+\}\}/g, '____');

type Filter = 'all' | 'ok' | 'wrong';

export default function ResultsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { summary, examId, queue, results } = usePractice();
  // La revisión se abre sola si hubo preguntas falladas
  const [review, setReview] = useState(() => usePractice.getState().results.some((r) => !r.correct));
  const [filter, setFilter] = useState<Filter>('all');

  const reviewIds = useQuery({ queryKey: ['review-ids'], queryFn: fetchReviewIds });
  const toggleReview = useMutation({
    mutationFn: ({ q, saved }: { q: Question; saved: boolean }) =>
      saved ? removeFromReview(q.id) : addToReview(q.id, q.exam_id ?? examId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['review-ids'] }),
  });

  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });

  // Dificultad del simulacro en estrellas (solo simulacros reales, no Repaso Rápido ni Sorpresa)
  const [pickedStars, setPickedStars] = useState<number | null | undefined>(undefined); // undefined = aún no tocaste las estrellas
  const rate = useMutation({
    mutationFn: (stars: number | null) => setExamDifficulty(examId, stars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }),
    onError: () => setPickedStars(undefined), // si falla, vuelve a mostrar lo que hay guardado
  });
  const stars = pickedStars !== undefined ? pickedStars : (exams.data?.find((e) => e.id === examId)?.difficulty ?? null);

  const suggest = useMutation({
    mutationFn: (provider: AiProvider) => {
      const st = usePractice.getState();
      const answered = st.queue.slice(0, st.results.length);
      // Las que no se alcanzaron a responder por falta de tiempo no dicen qué no sabe el usuario: no entran
      const failed = answered.filter((_, i) => !st.results[i].correct && !st.results[i].skipped);
      const quick = isMixedSession(st.examId);
      const title = st.examId === QUICK_REVIEW_ID ? 'Repaso rápido' : st.examId === SURPRISE_ID ? 'Simulacro Sorpresa' : (exams.data?.find((e) => e.id === st.examId)?.title ?? 'Simulacro');
      const sections = [...new Set(answered.map((q) => q.section).filter((x): x is string => !!x))];
      return generateSuggestion({ examId: quick ? null : st.examId, examTitle: title, failed, sections, provider });
    },
    onSuccess: (d) => {
      useDraft.getState().set(d);
      nav('/suggestion');
    },
  });

  // Al llegar aquí, refresca las listas que dependen del intento recién guardado
  useEffect(() => {
    qc.invalidateQueries();
  }, [qc]);

  if (!summary) return <Navigate to="/" replace />;

  const wrong = results.filter((r) => !r.correct).length;
  const wrongAnswered = results.filter((r) => !r.correct && !r.skipped).length; // sin contar las que se quedaron sin responder por el tiempo
  const pct = Math.round(summary.score);
  const savedIds = new Set(reviewIds.data ?? []);

  const again = (questions: typeof queue, mode: 'full' | 'retry_wrong') => {
    const st = usePractice.getState();
    // En Repaso Rápido, repetir sigue siendo Repaso Rápido (mezcla de simulacros).
    // Un repaso parcial ('custom') tampoco se convierte en simulacro completo: no debe inflar el "mejor %".
    const m =
      examId === QUICK_REVIEW_ID ? 'quick_review' : examId === SURPRISE_ID ? 'surprise' : mode === 'full' && st.mode === 'custom' ? 'custom' : mode;
    // Cada tipo de sesión guarda su avance aparte para poder continuarla
    const slot = m === 'quick_review' || m === 'surprise' ? m : mode === 'retry_wrong' ? 'retry_wrong' : m === 'full' ? 'full' : st.slot;
    // Repetir un examen cronometrado vuelve a poner el reloj; repasar solo las falladas no
    const limit = m === 'full' || m === 'surprise' ? summary.limitSec : null;
    st.start(examId, questions, m, summary.attemptId, slot, limit);
    nav(`/practice/${examId}`);
  };

  const practiceOne = (q: Question) => {
    const qExam = q.exam_id ?? examId; // en Repaso Rápido, la pregunta se practica en su propio simulacro
    usePractice.getState().start(qExam, [q], 'custom', summary.attemptId);
    nav(`/practice/${qExam}`);
  };

  // Si terminaste en una pausa, solo se revisan las preguntas respondidas
  const items = queue.slice(0, results.length).map((q, i) => ({ q, correct: results[i].correct, skipped: !!results[i].skipped, byUser: results[i].skipReason === 'user' }));
  const partial = summary.planned > summary.total;
  const bySection = usePractice.getState().mode === 'full' ? sectionRanges(queue).map((r) => sectionStats(r, results)) : [];
  const okCount = items.filter((x) => x.correct).length;
  const shown = items.filter((x) => filter === 'all' || (filter === 'ok' ? x.correct : !x.correct));
  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'Todas', count: items.length },
    { id: 'ok', label: 'Correctas', count: okCount },
    { id: 'wrong', label: 'Incorrectas', count: items.length - okCount },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-center text-2xl font-bold">
        {partial ? 'Resultado parcial 📊' : pct >= 70 ? '¡Buen trabajo! 🎉' : 'Sigue practicando 💪'}
      </h1>
      {(summary.limitSec || examId === SURPRISE_ID) && (
        <p className="flex flex-wrap justify-center gap-2 text-xs font-bold">
          {summary.limitSec ? <span className="rounded-full bg-slate-800 px-3 py-1 text-white dark:bg-slate-600">⏱ Examen cronometrado · {Math.round(summary.limitSec / 60)} min</span> : null}
          {examId === SURPRISE_ID ? <span className="rounded-full bg-sky-500 px-3 py-1 text-white">🎲 Simulacro Sorpresa</span> : null}
        </p>
      )}
      {summary.timedOut && (
        <p role="status" className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          ⏰ Se acabó el tiempo. Respondiste {summary.total - summary.unanswered} de {summary.total};{' '}
          {summary.unanswered === 1 ? 'la pregunta sin responder cuenta' : `las ${summary.unanswered} preguntas sin responder cuentan`} como incorrecta{summary.unanswered === 1 ? '' : 's'}.
        </p>
      )}
      {partial && (
        <p className="text-center text-sm text-slate-500">
          Respondiste {summary.total} de {summary.planned} preguntas. Este intento no cuenta para tu mejor porcentaje.
        </p>
      )}

      <div
        className="mx-auto flex h-40 w-40 items-center justify-center rounded-full text-4xl font-bold"
        style={{ background: `conic-gradient(#22c55e ${pct * 3.6}deg, #e2e8f0 0deg)` }}
      >
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-900">{pct}%</div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        {[
          ['✔', summary.correct, 'Aciertos'],
          ['✖', wrong, 'Fallos'],
          ['⏱', fmt(summary.durationSec), 'Tiempo'],
          ['⚡', `+${summary.xp}`, 'XP'],
        ].map(([i, v, l]) => (
          <div key={String(l)} className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
            <div>{i}</div>
            <div className="text-lg font-bold">{v}</div>
            <div className="text-xs text-slate-500">{l}</div>
          </div>
        ))}
      </div>

      {!isMixedSession(examId) && !partial && exams.data?.some((e) => e.id === examId) && (
        <section aria-label="Dificultad del simulacro" className="space-y-1 rounded-2xl bg-white p-4 text-center shadow-sm dark:bg-slate-800">
          <p className="font-bold">¿Qué tan difícil fue?</p>
          <StarRating
            value={stars}
            disabled={rate.isPending}
            onChange={(s) => {
              setPickedStars(s);
              rate.mutate(s);
            }}
          />
          <p className="text-xs text-slate-500">
            {rate.isError ? 'No se pudo guardar la dificultad. Intenta de nuevo.' : stars ? `${stars} de 5 · la verás en tu lista de simulacros` : 'Opcional · te ayuda a armar tu Super simulacro'}
          </p>
        </section>
      )}

      {bySection.length > 0 && (
        <section aria-label="Resultado por sección" className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <p className="font-bold">Por sección</p>
          <ul className="space-y-1 text-sm">
            {bySection.map((s) => (
              <li key={s.name} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{s.name}</span>
                <span className="shrink-0 font-bold text-slate-600 dark:text-slate-300">
                  {s.answered ? `${s.correct}/${s.answered}` : 'sin responder'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!summary.answersSaved && (
        <p className="rounded-xl bg-amber-50 p-3 text-center text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          No se pudo guardar el detalle de cada respuesta de este intento. Tu resultado general sí se guardó.
        </p>
      )}

      <div className="space-y-3">
        {wrong > 0 && (
          <button onClick={() => again(usePractice.getState().retryWrongQueue(), 'retry_wrong')} className="w-full rounded-2xl bg-sky-500 py-4 font-bold text-white">
            Repetir solo las falladas ({wrong})
          </button>
        )}
        {wrongAnswered >= MIN_FAILED && (
          <div className="space-y-2">
            <button
              disabled={suggest.isPending}
              onClick={() => suggest.mutate(getProvider())}
              className="w-full rounded-2xl bg-sky-500 py-4 font-bold text-white disabled:opacity-60"
            >
              {suggest.isPending ? 'Generando sugerencia…' : '💡 Generar sugerencia de estudio'}
            </button>
            {suggest.isError && (
              <div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950 dark:text-red-300">
                <p className="whitespace-pre-line">{(suggest.error as Error).message}</p>
                <button
                  onClick={() => {
                    const other: AiProvider = getProvider() === 'gemini' ? 'openrouter' : 'gemini';
                    setProvider(other);
                    suggest.mutate(other);
                  }}
                  className="rounded-lg border border-red-300 px-3 py-1.5 font-bold"
                >
                  🔁 Probar con {providerName(getProvider() === 'gemini' ? 'openrouter' : 'gemini')}
                </button>
              </div>
            )}
          </div>
        )}
        <button onClick={() => again(usePractice.getState().allQuestions, 'full')} className="w-full rounded-2xl border border-slate-300 py-4 font-bold">
          Repetir todo
        </button>
        <button onClick={() => setReview(!review)} className="w-full rounded-2xl border border-slate-300 py-4 font-bold">
          {review ? 'Ocultar respuestas' : 'Revisar respuestas'}
        </button>
        <button
          onClick={() => {
            usePractice.getState().reset();
            nav('/');
          }}
          className="w-full py-3 font-bold text-slate-500"
        >
          Volver al inicio
        </button>
      </div>

      {review && (
        <section className="space-y-3">
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Filtrar preguntas">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={filter === t.id}
                onClick={() => setFilter(t.id)}
                className={`rounded-xl border px-2 py-2 text-sm font-bold ${
                  filter === t.id ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          {!shown.length && (
            <p className="py-4 text-center text-sm text-slate-500">
              {filter === 'wrong' ? '¡No fallaste ninguna! 🎉' : 'No hay preguntas en esta vista.'}
            </p>
          )}

          <ul className="space-y-2">
            {shown.map(({ q, correct, skipped, byUser }) => {
              const saved = savedIds.has(q.id);
              return (
                <li
                  key={q.id}
                  className={`space-y-2 rounded-xl p-3 text-sm ${
                    correct ? 'bg-green-100 dark:bg-green-950' : 'bg-red-100 dark:bg-red-950'
                  }`}
                >
                  <p className="whitespace-pre-line">
                    {correct ? '✔' : '✖'} {showPrompt(q.prompt)}
                  </p>
                  {skipped && <p className="text-xs font-bold text-red-700 dark:text-red-300">{byUser ? '⏭ Dejada en blanco' : '⏰ Sin responder (se acabó el tiempo)'}</p>}
                  {q.imagen_url && <QuestionImage src={q.imagen_url} />}
                  {!correct && (
                    <>
                      <p className="text-xs">
                        Respuesta correcta: <b>{correctText(q)}</b>
                      </p>
                      {q.explanation && (
                        <div className="space-y-1 rounded-lg bg-white/70 p-3 text-xs dark:bg-slate-900/60">
                          <p className="font-bold">📖 Explicación</p>
                          <p className="whitespace-pre-line">{q.explanation}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => practiceOne(q)}
                          className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white"
                        >
                          Practicar solo esta
                        </button>
                        <button
                          disabled={toggleReview.isPending}
                          onClick={() => toggleReview.mutate({ q, saved })}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                            saved ? 'border-green-600 text-green-700 dark:text-green-300' : 'border-slate-400'
                          }`}
                        >
                          {saved ? '✓ En repaso' : '📌 Guardar en repaso'}
                        </button>
                      </div>
                       <AiPanel q={q} examId={q.exam_id ?? examId} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {toggleReview.isError && <p className="text-xs text-red-500">{(toggleReview.error as Error).message}</p>}
        </section>
      )}
    </div>
  );
}
