import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFolder, fetchBestScores, fetchExams, fetchFolders, fetchProfile } from './api';
import { usePractice } from '@/features/practice/practiceStore';
import CreateFolderDialog from './CreateFolderDialog';

export default function HomePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const folders = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  const best = useQuery({ queryKey: ['best'], queryFn: fetchBestScores });

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
                onClick={() => {
                  usePractice.getState().reset();
                  nav(`/practice/${e.id}`);
                }}
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
