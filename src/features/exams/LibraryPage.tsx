import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';
import { createFolder, fetchBestScores, fetchExams, fetchFolders, type Exam } from './api';
import CreateFolderDialog from './CreateFolderDialog';
import ExamStartSheet from './ExamStartSheet';

export default function LibraryPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null); // menú ⋮ de un simulacro
  const [newMenu, setNewMenu] = useState(false); // menú del botón "Nuevo"
  const [creating, setCreating] = useState(false); // diálogo de nueva biblioteca
  const [sheet, setSheet] = useState<Exam | null>(null); // simulacro abierto: completo o repaso de las que tengo mal

  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const folders = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  const best = useQuery({ queryKey: ['best'], queryFn: fetchBestScores });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }),
  });

  const create = useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createFolder(name, color),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      setCreating(false);
    },
  });

  const allExams = exams.data ?? [];
  const allFolders = folders.data ?? [];
  const folderName = useMemo(() => new Map(allFolders.map((f) => [f.id, f.name])), [allFolders]);
  const term = q.trim().toLowerCase();
  const searching = term.length > 0;

  // Sin buscar: bibliotecas arriba y, debajo, solo los simulacros que no están en ninguna biblioteca.
  // Buscando: se muestran los simulacros que coinciden, estén donde estén.
  const independents = allExams.filter((e) => !e.folder_id);
  const subjects = useMemo(() => [...new Set(independents.map((e) => e.subject ?? 'Sin tema'))], [independents]);
  const activeSubject = subject && subjects.includes(subject) ? subject : null;
  const matches = (e: Exam) => e.title.toLowerCase().includes(term);
  const list = searching
    ? allExams.filter(matches)
    : independents.filter((e) => !activeSubject || (e.subject ?? 'Sin tema') === activeSubject);
  const shownFolders = searching ? allFolders.filter((f) => f.name.toLowerCase().includes(term)) : allFolders;
  const countIn = (id: string) => allExams.filter((e) => e.folder_id === id).length;
  const empty = !exams.isLoading && !folders.isLoading && !shownFolders.length && !list.length;

  const examRow = (e: Exam) => {
    const score = best.data?.[e.id];
    const where = searching && e.folder_id ? folderName.get(e.folder_id) : null;
    return (
      <li key={e.id} className="card relative flex items-center gap-1 pr-1.5">
        <button className="min-w-0 flex-1 p-4 text-left" onClick={() => setSheet(e)}>
          <p className="truncate font-semibold">{e.title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {where ? `${where} · ` : ''}
            {e.subject ?? 'Sin tema'} · {e.question_count} preguntas
          </p>
        </button>
        {score !== undefined && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-sky-600 dark:text-sky-400">{Math.round(score)}%</span>
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
  };

  return (
    <div className="space-y-5 p-4">
      <header className="relative flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Simulacros</h1>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={newMenu}
          onClick={() => setNewMenu((v) => !v)}
          className="btn-primary !px-3 !py-2"
        >
          <Icon name="plus" size={16} strokeWidth={2.25} />
          Nuevo
        </button>
        {newMenu && (
          <>
            <button aria-label="Cerrar menú" className="fixed inset-0 z-10 cursor-default" onClick={() => setNewMenu(false)} />
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-slate-900/10 dark:bg-slate-800 dark:ring-white/10"
            >
              <Link
                role="menuitem"
                to="/new"
                className="flex items-center gap-2.5 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Icon name="file" size={18} className="text-sky-500" /> Nuevo simulacro
              </Link>
              <button
                role="menuitem"
                onClick={() => {
                  setNewMenu(false);
                  setCreating(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Icon name="folderPlus" size={18} className="text-sky-500" /> Nueva biblioteca
              </button>
            </div>
          </>
        )}
      </header>

      <div className="relative">
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar simulacro o biblioteca…"
          className="input !pl-9"
        />
      </div>

      {!!shownFolders.length && (
        <section>
          <h2 className="section-title mb-2">Bibliotecas</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {shownFolders.map((f) => {
              const n = countIn(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => nav(`/folders/${f.id}`)}
                  className="card p-5 text-left transition active:scale-[.98] md:hover:bg-slate-50 md:dark:hover:bg-slate-700/60"
                >
                  <span className="mb-3 block h-1.5 w-9 rounded-full" style={{ backgroundColor: f.color ?? '#0ea5e9' }} />
                  <p className="line-clamp-2 text-lg font-semibold leading-tight">{f.name}</p>
                  <p className="mt-1.5 text-sm text-slate-500">
                    {n} {n === 1 ? 'simulacro' : 'simulacros'}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {(!!list.length || (!searching && !!allFolders.length)) && (
        <section className="space-y-3">
          <h2 className="section-title">{searching ? 'Simulacros' : 'Sin biblioteca'}</h2>

          {!searching && subjects.length > 1 && (
            <div className="-mx-4 flex gap-5 overflow-x-auto border-b border-slate-200/70 px-4 dark:border-slate-800">
              {[null, ...subjects].map((s) => (
                <button
                  key={s ?? 'all'}
                  onClick={() => setSubject(s)}
                  className={`-mb-px shrink-0 border-b-2 pb-2 text-sm font-medium transition-colors ${
                    activeSubject === s
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {s ?? 'Todos'}
                </button>
              ))}
            </div>
          )}

          {list.length ? (
            <ul className="grid gap-2.5 md:grid-cols-2">{list.map(examRow)}</ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700">
              Todos tus simulacros están dentro de una biblioteca.
            </p>
          )}
        </section>
      )}

      {empty && (
        <p className="py-8 text-center text-slate-500">
          {searching ? 'Sin resultados.' : 'Aún no tienes simulacros ni bibliotecas. Pulsa «Nuevo» para empezar.'}
        </p>
      )}

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
