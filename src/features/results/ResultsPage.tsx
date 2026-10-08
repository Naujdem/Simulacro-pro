import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { usePractice } from '@/features/practice/practiceStore';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function ResultsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [review, setReview] = useState(false);
  const { summary, examId, queue, results } = usePractice();
  if (!summary) return <Navigate to="/" replace />;

  const wrong = results.filter((r) => !r.correct).length;
  const pct = Math.round(summary.score);
  qc.invalidateQueries();

  const again = (questions: typeof queue, mode: 'full' | 'retry_wrong') => {
    usePractice.getState().start(examId, questions, mode, summary.attemptId);
    nav(`/practice/${examId}`);
  };

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
        <ul className="space-y-2">
          {queue.map((q, i) => (
            <li key={q.id} className={`rounded-xl p-3 text-sm ${results[i]?.correct ? 'bg-green-100 dark:bg-green-950' : 'bg-red-100 dark:bg-red-950'}`}>
              {results[i]?.correct ? '✔' : '✖'} {q.prompt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
