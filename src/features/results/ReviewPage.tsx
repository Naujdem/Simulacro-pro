import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchReviewEntries, removeFromReview, type ReviewEntry } from '@/features/exams/api';
import QuestionImage from '@/components/QuestionImage';
import { usePractice } from '@/features/practice/practiceStore';
import type { Question } from '@/lib/grading';

// En las preguntas de "completar espacios" muestra ____ en lugar de {{1}}
const showPrompt = (p: string) => p.replace(/\{\{\d+\}\}/g, '____');

export default function ReviewPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const entries = useQuery({ queryKey: ['review-entries'], queryFn: fetchReviewEntries, refetchOnMount: 'always' });

  const remove = useMutation({
    mutationFn: (questionId: string) => removeFromReview(questionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-entries'] });
      qc.invalidateQueries({ queryKey: ['review-ids'] });
    },
  });

  // Agrupa las preguntas guardadas por simulacro
  const groups = useMemo(() => {
    const map = new Map<string, { examId: string; title: string; items: ReviewEntry[] }>();
    for (const e of entries.data ?? []) {
      const g = map.get(e.exam_id) ?? { examId: e.exam_id, title: e.exam_title, items: [] };
      g.items.push(e);
      map.set(e.exam_id, g);
    }
    return [...map.values()];
  }, [entries.data]);

  const practice = (examId: string, questions: Question[]) => {
    usePractice.getState().start(examId, questions, 'custom');
    nav(`/practice/${examId}`);
  };

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center gap-3">
        <Link to="/" className="rounded-xl px-2 py-1 text-lg" aria-label="Volver">
          ←
        </Link>
        <h1 className="text-2xl font-extrabold">Repaso</h1>
      </header>

      {entries.isError && <p className="text-sm text-red-500">{(entries.error as Error).message}</p>}

      {!groups.length && !entries.isLoading && !entries.isError && (
        <p className="rounded-2xl border-2 border-dashed p-6 text-center text-sm text-slate-500">
          Aún no tienes preguntas en repaso. Al terminar un simulacro, pulsa “Guardar en repaso” en las que fallaste.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.examId} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-extrabold">{g.title}</h2>
              <p className="text-xs text-slate-500">
                {g.items.length} {g.items.length === 1 ? 'pregunta' : 'preguntas'}
              </p>
            </div>
            <button
              onClick={() =>
                practice(
                  g.examId,
                  g.items.map((i) => i.question),
                )
              }
              className="shrink-0 rounded-xl bg-sky-500 px-3 py-2 text-xs font-extrabold text-white"
            >
              Practicar estas ({g.items.length})
            </button>
          </div>

          <ul className="space-y-2">
            {g.items.map((i) => (
              <li key={i.question.id} className="space-y-2 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-700">
                <p>{showPrompt(i.question.prompt)}</p>
                {i.question.imagen_url && <QuestionImage src={i.question.imagen_url} />}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => practice(g.examId, [i.question])}
                    className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-extrabold text-white"
                  >
                    Practicar solo esta
                  </button>
                  <button
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(i.question.id)}
                    className="rounded-lg border-2 border-slate-400 px-3 py-1.5 text-xs font-extrabold disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {remove.isError && <p className="text-xs text-red-500">{(remove.error as Error).message}</p>}
    </div>
  );
}
