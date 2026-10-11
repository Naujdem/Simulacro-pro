import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFolder,
  fetchBestScores,
  fetchExams,
  fetchFolders,
  fetchProfile,
  fetchReviewIds,
  fetchWrongCount,
  fetchWrongQuestions,
  type Exam,
} from './api';
import { QUICK_REVIEW_ID, usePractice } from '@/features/practice/practiceStore';
import { pendingProgress, setLastSlot } from '@/features/practice/progress';
import { useProgressVersion } from '@/features/practice/progressSync';
import CreateFolderDialog from './CreateFolderDialog';
import ExamStartSheet from './ExamStartSheet';

export default function HomePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const folders = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  const best = useQuery({ queryKey: ['best'], queryFn: fetchBestScores });
  const reviewIds = useQuery({ queryKey: ['review-ids'], queryFn: fetchReviewIds });
  const reviewCount = reviewIds.data?.length ?? 0;
  const wrongCount = useQuery({ queryKey: ['wrong-count'], queryFn: fetchWrongCount });
  const [quickMsg, setQuickMsg] = useState('');
  const [sheet, setSheet] = useState<Exam | null>(null); // simulacro abierto: completo o repaso de las que tengo mal
  useProgressVersion((s) => s.version); // se vuelve a dibujar cuando llega avance de otro dispositivo
  const savedQuick = pendingProgress(QUICK_REVIEW_ID, 'quick_review'); // Repaso Rápido dejado a medias

  // Repaso Rápido: busca TODAS las preguntas con etiqueta "Mal" y las practica en una sola sesión
  const quick = useMutation({
    mutationFn: fetchWrongQuestions,
    onSuccess: (questions) => {
      if (!questions.length) {
        setQuickMsg('¡Felicidades! No tienes preguntas pendientes por repasar.');
        return;
      }
      setQuickMsg('');
      usePractice.getState().reset();
      usePractice.getState().start(QUICK_REVIEW_ID, questions, 'quick_review');
      nav(`/practice/${QUICK_REVIEW_ID}`);
    },
  });

  const create = useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createFolder(name, color),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      setCreating(false);
    },
  });

  const p = profile.data;
  const xpInLevel = p ? p.xp - 100 * (p.level - 1) ** 2 : 0;
  const xpForLevel = p ? 100 * p.level ** 2 - 100 * (p.level - 1) ** 2 : 100;
  const recent = (exams.data ?? []).slice(0, 5);

  return (
    <div className="space-y-5 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Hola{p?.display_name ? `, ${p.display_name}` : ''} 👋</h1>
        <span className="rounded-full bg-orange-100 px-3 py-1 font-extrabold text-orange-600 dark:bg-orange-950">
          🔥 {p?.current_streak ?? 0}
        </span>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <div className="mb-2 flex justify-between text-sm font-bold">
          <span>Nivel {p?.level ?? 1}</span>
          <span className="text-slate-500">{p?.xp ?? 0} XP</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, (xpInLevel / xpForLevel) * 100)}%` }} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-extrabold">Bibliotecas</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {(folders.data ?? []).map((f) => {
            const count = (exams.data ?? []).filter((e) => e.folder_id === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => nav(`/folders/${f.id}`)}
                className="w-36 shrink-0 rounded-2xl p-4 text-left text-white shadow-sm active:scale-[.98]"
                style={{ backgroundColor: f.color ?? '#0ea5e9' }}
              >
                <p className="line-clamp-2 font-extrabold leading-tight">{f.name}</p>
                <p className="mt-2 text-xs font-bold text-white/80">
                  {count} {count === 1 ? 'simulacro' : 'simulacros'}
                </p>
              </button>
            );
          })}
          {!folders.data?.length && !folders.isLoading && (
            <p className="rounded-2xl border-2 border-dashed px-4 py-6 text-sm text-slate-500">
              Aún no tienes bibliotecas. Pulsa el botón + para crear una, por ejemplo “Simulacros Química”.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        {savedQuick && (
          <button
            onClick={() => {
              setLastSlot(QUICK_REVIEW_ID, 'quick_review');
              usePractice.getState().reset();
              nav(`/practice/${QUICK_REVIEW_ID}`);
            }}
            className="flex w-full items-center justify-between rounded-2xl border-2 border-violet-600 p-4 text-left font-extrabold text-violet-700 active:scale-[.98] dark:text-violet-300"
          >
            <span>▶ Continuar Repaso Rápido</span>
            <span className="text-sm font-bold">
              pregunta {savedQuick.done + 1} de {savedQuick.total}
            </span>
          </button>
        )}
        <button
          onClick={() => {
            setQuickMsg('');
            quick.mutate();
          }}
          disabled={quick.isPending}
          className="flex w-full items-center justify-between rounded-2xl bg-violet-600 p-4 text-left text-white shadow-sm active:scale-[.98] disabled:opacity-60"
        >
          <span className="font-extrabold">🧠 Repaso Rápido</span>
          <span className="text-sm font-bold text-white/80">
            {quick.isPending
              ? 'Buscando…'
              : wrongCount.data
                ? `${wrongCount.data} ${wrongCount.data === 1 ? 'pregunta' : 'preguntas'} en “Mal” ›`
                : 'Practicar ›'}
          </span>
        </button>
        {quickMsg && (
          <p className="rounded-xl bg-green-100 p-3 text-center text-sm font-bold text-green-800 dark:bg-green-950 dark:text-green-200">
            {quickMsg}
          </p>
        )}
        {quick.isError && <p className="text-center text-sm text-red-500">{(quick.error as Error).message}</p>}
      </section>

      <Link
        to="/review"
        className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm active:scale-[.98] dark:bg-slate-800"
      >
        <span className="font-extrabold">📌 Repaso</span>
        <span className="text-sm font-bold text-slate-500">
          {reviewCount} {reviewCount === 1 ? 'pregunta' : 'preguntas'} ›
        </span>
      </Link>

      <section>
        <h2 className="mb-2 font-extrabold">Simulacros recientes</h2>
        {!recent.length && (
          <Link to="/new" className="block rounded-2xl border-2 border-dashed p-6 text-center text-slate-500">
            Aún no tienes simulacros. ¡Crea o importa el primero!
          </Link>
        )}
        <ul className="space-y-3">
          {recent.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <button
                onClick={() => setSheet(e)}
                className="flex min-w-0 flex-1 items-center justify-between rounded-2xl bg-white p-4 text-left shadow-sm active:scale-[.98] dark:bg-slate-800"
              >
                <div>
                  <p className="font-bold">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {e.subject ?? 'Sin tema'} · {e.question_count} preguntas
                  </p>
                </div>
                <span className="text-sm font-extrabold text-green-600">
                  {best.data?.[e.id] !== undefined ? `${Math.round(best.data[e.id])}%` : 'Practicar ›'}
                </span>
              </button>
              <button
                aria-label="Editar simulacro"
                onClick={() => nav(`/exams/${e.id}/edit`)}
                className="shrink-0 rounded-2xl bg-white p-4 text-lg shadow-sm active:scale-[.98] dark:bg-slate-800"
              >
                ✏️
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        aria-label="Crear biblioteca"
        onClick={() => setCreating(true)}
        className="fixed bottom-24 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-sky-500 text-3xl font-bold text-white shadow-lg active:scale-95"
      >
        +
      </button>

      {create.isError && <p className="text-center text-sm text-red-500">{(create.error as Error).message}</p>}

      {sheet && <ExamStartSheet exam={sheet} onClose={() => setSheet(null)} />}

      {creating && (
        <CreateFolderDialog
          saving={create.isPending}
          onClose={() => setCreating(false)}
          onCreate={(name, color) => create.mutate({ name, color })}
        />
      )}
    </div>
  );
}
