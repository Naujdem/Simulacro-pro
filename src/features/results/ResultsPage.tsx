import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUICK_REVIEW_ID, usePractice } from '@/features/practice/practiceStore';
import { addToReview, fetchReviewIds, removeFromReview } from '@/features/exams/api';
import QuestionImage from '@/components/QuestionImage';
import AiPanel from '@/features/ai/AiPanel';
import { correctText, type Question } from '@/lib/grading';

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

  // Al llegar aquí, refresca las listas que dependen del intento recién guardado
  useEffect(() => {
    qc.invalidateQueries();
  }, [qc]);

  if (!summary) return <Navigate to="/" replace />;

  const wrong = results.filter((r) => !r.correct).length;
  const pct = Math.round(summary.score);
  const savedIds = new Set(reviewIds.data ?? []);

  const again = (questions: typeof queue, mode: 'full' | 'retry_wrong') => {
    const st = usePractice.getState();
    // En Repaso Rápido, repetir sigue siendo Repaso Rápido (mezcla de simulacros).
    // Un repaso parcial ('custom') tampoco se convierte en simulacro completo: no debe inflar el "mejor %".
    const m = examId === QUICK_REVIEW_ID ? 'quick_review' : mode === 'full' && st.mode === 'custom' ? 'custom' : mode;
    // Cada tipo de sesión guarda su avance aparte para poder continuarla
    const slot = m === 'quick_review' ? 'quick_review' : mode === 'retry_wrong' ? 'retry_wrong' : m === 'full' ? 'full' : st.slot;
    st.start(examId, questions, m, summary.attemptId, slot);
    nav(`/practice/${examId}`);
  };

  const practiceOne = (q: Question) => {
    const qExam = q.exam_id ?? examId; // en Repaso Rápido, la pregunta se practica en su propio simulacro
    usePractice.getState().start(qExam, [q], 'custom', summary.attemptId);
    nav(`/practice/${qExam}`);
  };

  const items = queue.map((q, i) => ({ q, correct: results[i]?.correct ?? false }));
  const okCount = items.filter((x) => x.correct).length;
  const shown = items.filter((x) => filter === 'all' || (filter === 'ok' ? x.correct : !x.correct));
  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'Todas', count: items.length },
    { id: 'ok', label: 'Correctas', count: okCount },
    { id: 'wrong', label: 'Incorrectas', count: items.length - okCount },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-center text-2xl font-extrabold">{pct >= 70 ? '¡Buen trabajo! 🎉' : 'Sigue practicando 💪'}</h1>

      <div
        className="mx-auto flex h-40 w-40 items-center justify-center rounded-full text-4xl font-extrabold"
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
            <div className="text-lg font-extrabold">{v}</div>
            <div className="text-xs text-slate-500">{l}</div>
          </div>
        ))}
      </div>

      {!summary.answersSaved && (
        <p className="rounded-xl bg-amber-50 p-3 text-center text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          No se pudo guardar el detalle de cada respuesta de este intento. Tu resultado general sí se guardó.
        </p>
      )}

      <div className="space-y-3">
        {wrong > 0 && (
          <button onClick={() => again(usePractice.getState().retryWrongQueue(), 'retry_wrong')} className="w-full rounded-2xl bg-sky-500 py-4 font-extrabold uppercase text-white">
            Repetir solo las falladas ({wrong})
          </button>
        )}
        <button onClick={() => again(usePractice.getState().allQuestions, 'full')} className="w-full rounded-2xl border-2 border-slate-300 py-4 font-bold">
          Repetir todo
        </button>
        <button onClick={() => setReview(!review)} className="w-full rounded-2xl border-2 border-slate-300 py-4 font-bold">
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
                className={`rounded-xl border-2 px-2 py-2 text-sm font-bold ${
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
            {shown.map(({ q, correct }) => {
              const saved = savedIds.has(q.id);
              return (
                <li
                  key={q.id}
                  className={`space-y-2 rounded-xl p-3 text-sm ${
                    correct ? 'bg-green-100 dark:bg-green-950' : 'bg-red-100 dark:bg-red-950'
                  }`}
                >
                  <p>
                    {correct ? '✔' : '✖'} {showPrompt(q.prompt)}
                  </p>
                  {q.imagen_url && <QuestionImage src={q.imagen_url} />}
                  {!correct && (
                    <>
                      <p className="text-xs">
                        Respuesta correcta: <b>{correctText(q)}</b>
                      </p>
                      {q.explanation && (
                        <div className="space-y-1 rounded-lg bg-white/70 p-3 text-xs dark:bg-slate-900/60">
                          <p className="font-extrabold">📖 Explicación</p>
                          <p className="whitespace-pre-line">{q.explanation}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => practiceOne(q)}
                          className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-extrabold text-white"
                        >
                          Practicar solo esta
                        </button>
                        <button
                          disabled={toggleReview.isPending}
                          onClick={() => toggleReview.mutate({ q, saved })}
                          className={`rounded-lg border-2 px-3 py-1.5 text-xs font-extrabold disabled:opacity-50 ${
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
