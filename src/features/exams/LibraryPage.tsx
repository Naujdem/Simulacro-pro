import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';
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
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Simulacros</h1>
        <Link to="/new" className="btn-primary !px-3 !py-2">
          <Icon name="plus" size={16} strokeWidth={2.25} />
          Nuevo
        </Link>
      </header>

      <div className="relative">
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar simulacro…"
          className="input !pl-9"
        />
      </div>

      {subjects.length > 1 && (
        <div className="-mx-4 flex gap-5 overflow-x-auto border-b border-slate-200/70 px-4 dark:border-slate-800">
          {[null, ...subjects].map((s) => (
            <button
              key={s ?? 'all'}
              onClick={() => setSubject(s)}
              className={`-mb-px shrink-0 border-b-2 pb-2 text-sm font-medium transition-colors ${
                subject === s
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {s ?? 'Todos'}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2.5">
        {list.map((e) => {
          const score = best.data?.[e.id];
          return (
            <li key={e.id} className="card relative flex items-center gap-1 pr-1.5">
              <button className="min-w-0 flex-1 p-4 text-left" onClick={() => setSheet(e)}>
                <p className="truncate font-semibold">{e.title}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {e.subject ?? 'Sin tema'} · {e.question_count} preguntas
                </p>
              </button>
              {score !== undefined && (
                <span className="shrink-0 text-sm font-semibold tabular-nums text-sky-600 dark:text-sky-400">
                  {Math.round(score)}%
                </span>
              )}
              <button
                aria-label="Opciones"
                aria-expanded={menu === e.id}
                onClick={() => setMenu(menu === e.id ? null : e.id)}
                className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <Icon name="more" size={20} strokeWidth={2.5} />
              </button>

              {menu === e.id && (
                <>
                  <button aria-label="Cerrar menú" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(null)} />
                  <div
                    role="menu"
                    className="absolute right-2 top-12 z-20 w-40 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-slate-900/10 dark:bg-slate-800 dark:ring-white/10"
                  >
                    <button
                      role="menuitem"
                      onClick={() => nav(`/exams/${e.id}/edit`)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <Icon name="pencil" size={16} /> Editar
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenu(null);
                        if (confirm(`¿Eliminar "${e.title}"?`)) del.mutate(e.id);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Icon name="trash" size={16} /> Eliminar
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
        {!list.length && !exams.isLoading && <p className="py-8 text-center text-slate-500">Sin resultados.</p>}
      </ul>

      {sheet && <ExamStartSheet exam={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
