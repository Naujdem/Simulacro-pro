import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignExamToFolder, fetchBestScores, fetchExams, fetchFolder } from './api';
import { usePractice } from '@/features/practice/practiceStore';

export default function FolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const folder = useQuery({ queryKey: ['folder', folderId], queryFn: () => fetchFolder(folderId!), enabled: !!folderId });
  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const best = useQuery({ queryKey: ['best'], queryFn: fetchBestScores });

  const assign = useMutation({
    mutationFn: ({ examId, id }: { examId: string; id: string | null }) => assignExamToFolder(examId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams'] });
      setAdding(false);
    },
  });

  const inFolder = (exams.data ?? []).filter((e) => e.folder_id === folderId);
  const others = (exams.data ?? []).filter((e) => e.folder_id !== folderId);
  const color = folder.data?.color ?? '#0ea5e9';

  if (folder.isError) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-slate-500">No se encontró esta biblioteca.</p>
        <Link to="/" className="font-bold text-sky-600">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-start gap-3">
        <Link to="/" className="mt-1 rounded-xl px-2 py-1 text-lg" aria-label="Volver">
          ←
        </Link>
        <div className="flex-1">
          <div className="mb-1 h-2 w-16 rounded-full" style={{ backgroundColor: color }} />
          <h1 className="text-2xl font-extrabold">{folder.data?.name ?? '…'}</h1>
          <p className="text-sm text-slate-500">
            {inFolder.length} {inFolder.length === 1 ? 'simulacro' : 'simulacros'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setAdding(true)}
          className="rounded-2xl border-2 border-dashed py-3 text-sm font-bold text-slate-500"
        >
          + Añadir existentes
        </button>
        <Link
          to={`/new?folder=${folderId}`}
          className="rounded-2xl bg-sky-500 py-3 text-center text-sm font-extrabold text-white"
        >
          + Nuevo simulacro
        </Link>
      </div>

      {!inFolder.length && !exams.isLoading && (
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 dark:bg-slate-800">
          Esta biblioteca está vacía. Añade simulacros que ya tengas, o crea uno nuevo.
        </p>
      )}

      <ul className="space-y-3">
        {inFolder.map((e) => (
          <li key={e.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
            <div className="flex items-start justify-between gap-2">
              <button
                className="flex-1 text-left"
                onClick={() => {
                  usePractice.getState().reset();
                  nav(`/practice/${e.id}`);
                }}
              >
                <p className="font-bold">{e.title}</p>
                <p className="text-xs text-slate-500">
                  {e.subject ?? 'Sin tema'} · {e.question_count} preguntas
                  {best.data?.[e.id] !== undefined && ` · mejor ${Math.round(best.data[e.id])}%`}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-3">
                <button aria-label="Editar simulacro" onClick={() => nav(`/exams/${e.id}/edit`)} className="text-lg">
                  ✏️
                </button>
                <button
                  onClick={() => assign.mutate({ examId: e.id, id: null })}
                  className="text-xs font-bold text-slate-400"
                >
                  Quitar
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setAdding(false)}>
          <div
            className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-extrabold">Añadir simulacros</h2>
            {!others.length && <p className="text-sm text-slate-500">No hay más simulacros para añadir.</p>}
            <ul className="space-y-2">
              {others.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => assign.mutate({ examId: e.id, id: folderId! })}
                    className="w-full rounded-2xl bg-slate-100 p-3 text-left font-bold dark:bg-slate-700"
                  >
                    {e.title}
                    {e.folder_id && <span className="ml-2 text-xs font-normal text-slate-500">(en otra biblioteca)</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => setAdding(false)} className="mt-4 w-full rounded-2xl border-2 py-3 font-bold">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
