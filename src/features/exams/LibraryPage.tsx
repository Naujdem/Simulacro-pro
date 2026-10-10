import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchBestScores, fetchExams, type Exam } from './api';
import ExamStartSheet from './ExamStartSheet';

export default function LibraryPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Exam | null>(null); // simulacro abierto: completo o repaso de las que tengo mal

  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const best = useQuery({ queryKey: ['best'], queryFn: fetchBestScores });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }),
  });

  const subjects = useMemo(() => [...new Set((exams.data ?? []).map((e) => e.subject ?? 'Sin tema'))], [exams.data]);
  const list = (exams.data ?? []).filter(
    (e) =>
      (!subject || (e.subject ?? 'Sin tema') === subject) &&
      e.title.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-extrabold">Biblioteca</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar simulacro…"
        className="w-full rounded-2xl border-2 border-slate-200 bg-transparent p-3 outline-none focus:border-sky-400 dark:border-slate-700"
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[null, ...subjects].map((s) => (
          <button
            key={s ?? 'all'}
            onClick={() => setSubject(s)}
            className={`shrink-0 rounded-full border-2 px-4 py-1 text-sm font-bold ${
              subject === s ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            {s ?? 'Todos'}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {list.map((e) => (
          <li key={e.id} className="relative rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
            <div className="flex items-start justify-between gap-2">
              <button
                className="flex-1 text-left"
                onClick={() => setSheet(e)}
              >
                <p className="font-bold">{e.title}</p>
                <p className="text-xs text-slate-500">
                  {e.subject ?? 'Sin tema'} · {e.question_count} preguntas
                  {best.data?.[e.id] !== undefined && ` · mejor ${Math.round(best.data[e.id])}%`}
                </p>
                {e.description && <p className="mt-1 text-sm text-slate-500">{e.description}</p>}
              </button>
              <button aria-label="Editar simulacro" onClick={() => nav(`/exams/${e.id}/edit`)} className="px-2 text-lg">
                ✏️
              </button>
              <button aria-label="Opciones" onClick={() => setMenu(menu === e.id ? null : e.id)} className="px-2 text-xl">
                ⋮
              </button>
            </div>
            {menu === e.id && (
              <button
                onClick={() => confirm(`¿Eliminar "${e.title}"?`) && del.mutate(e.id)}
                className="mt-2 w-full rounded-xl bg-red-100 py-2 text-sm font-bold text-red-700"
              >
                Eliminar
              </button>
            )}
          </li>
        ))}
        {!list.length && !exams.isLoading && <p className="py-8 text-center text-slate-500">Sin resultados.</p>}
      </ul>

      {sheet && <ExamStartSheet exam={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
