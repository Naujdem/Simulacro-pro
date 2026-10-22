import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignExamToFolder,
  createFolder,
  deleteFolder,
  fetchBestScores,
  fetchExams,
  fetchFolders,
  folderChain,
  folderTreeIds,
  moveFolder,
  type Exam,
  type Folder,
} from './api';
import Icon from '@/components/Icon';
import ExamStartSheet from './ExamStartSheet';
import ExamStatusBadge from './ExamStatusBadge';
import { useExamStatus } from './useExamStatus';
import CreateFolderDialog from './CreateFolderDialog';
import DeleteFolderDialog from './DeleteFolderDialog';
import MoveDialog, { type MoveTarget } from './MoveDialog';
import ShareDialog from '@/features/share/ShareDialog';

export default function FolderPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newMenu, setNewMenu] = useState(false); // menú del botón "+ Nuevo"
  const [creatingSub, setCreatingSub] = useState(false); // diálogo de nueva subbiblioteca
  const [sheet, setSheet] = useState<Exam | null>(null); // simulacro abierto: completo o repaso de las que tengo mal
  const [moving, setMoving] = useState<MoveTarget | null>(null); // biblioteca o simulacro que se está moviendo
  const [deleting, setDeleting] = useState<Folder | null>(null); // biblioteca pendiente de confirmar su eliminación
  const [sharing, setSharing] = useState<Folder | null>(null); // biblioteca cuyo enlace para compartir se está viendo

  const folders = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const best = useQuery({ queryKey: ['best'], queryFn: fetchBestScores });
  const statusOf = useExamStatus();

  const delFolder = useMutation({
    mutationFn: ({ id, withExams }: { id: string; withExams: boolean }) => deleteFolder(id, folders.data ?? [], withExams),
    onSuccess: (_d, { id }) => {
      const wasCurrent = id === folderId;
      qc.invalidateQueries({ queryKey: ['folders'] });
      qc.invalidateQueries({ queryKey: ['exams'] });
      qc.invalidateQueries({ queryKey: ['best'] });
      qc.invalidateQueries({ queryKey: ['last-finished'] });
      setDeleting(null);
      // Si se eliminó la biblioteca que se está viendo, volver a su biblioteca madre (o a la lista)
      if (wasCurrent) nav(backTo, { replace: true });
    },
  });

  const assign = useMutation({
    mutationFn: ({ examId, id }: { examId: string; id: string | null }) => assignExamToFolder(examId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams'] });
      setAdding(false);
    },
  });

  const createSub = useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) => createFolder(name, color, folderId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      setCreatingSub(false);
    },
  });

  // Mover una biblioteca (cambia su biblioteca madre) o un simulacro (cambia su biblioteca)
  const move = useMutation({
    mutationFn: async ({ target, to }: { target: MoveTarget; to: string | null }) => {
      if (target.kind === 'folder') await moveFolder(target.folder.id, to);
      else await assignExamToFolder(target.exam.id, to);
    },
    onSuccess: (_d, { target }) => {
      qc.invalidateQueries({ queryKey: [target.kind === 'folder' ? 'folders' : 'exams'] });
      setMoving(null);
    },
  });

  const openMove = (t: MoveTarget) => {
    move.reset();
    setMoving(t);
  };

  const allFolders = folders.data ?? [];
  const folder = allFolders.find((f) => f.id === folderId);
  const chain = folderChain(allFolders, folderId); // Química › Orgánica › …
  const parent = folder?.parent_id ?? null;
  const subfolders = allFolders.filter((f) => f.parent_id === folderId);
  const inFolder = (exams.data ?? []).filter((e) => e.folder_id === folderId);
  const others = (exams.data ?? []).filter((e) => e.folder_id !== folderId);
  const color = folder?.color ?? '#0ea5e9';
  const countIn = (id: string) => {
    const ids = folderTreeIds(allFolders, id);
    return (exams.data ?? []).filter((e) => e.folder_id && ids.has(e.folder_id)).length;
  };
  const backTo = parent ? `/folders/${parent}` : '/library';

  if (folders.isSuccess && !folder) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-slate-500">No se encontró esta biblioteca.</p>
        <Link to="/library" className="font-bold text-sky-600">
          Volver a Simulacros
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-start gap-3">
        <Link to={backTo} className="mt-1 rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Volver">
          <Icon name="back" size={20} />
        </Link>
        <div className="flex-1">
          <div className="mb-1 h-2 w-16 rounded-full" style={{ backgroundColor: color }} />
          {chain.length > 1 && (
            <nav aria-label="Ruta" className="mb-0.5 flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
              {chain.slice(0, -1).map((f) => (
                <span key={f.id} className="flex items-center gap-1">
                  <Link to={`/folders/${f.id}`} className="hover:text-sky-600 hover:underline">
                    {f.name}
                  </Link>
                  <span aria-hidden="true">›</span>
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{folder?.name ?? '…'}</h1>
          <p className="text-sm text-slate-500">
            {inFolder.length} {inFolder.length === 1 ? 'simulacro' : 'simulacros'}
            {subfolders.length > 0 && ` · ${subfolders.length} ${subfolders.length === 1 ? 'subbiblioteca' : 'subbibliotecas'}`}
          </p>
        </div>
        {folder && (
          <div className="mt-1 flex shrink-0 items-center gap-1">
            <button
              onClick={() => setSharing(folder)}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              🔗 Compartir
            </button>
            <button
              onClick={() => openMove({ kind: 'folder', folder })}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Mover
            </button>
            <button
              aria-label="Eliminar biblioteca"
              onClick={() => {
                delFolder.reset();
                setDeleting(folder);
              }}
              className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
        )}
      </header>

      <div className="relative grid grid-cols-2 gap-2">
        <button
          onClick={() => setAdding(true)}
          className="btn-secondary border-dashed"
        >
          <Icon name="plus" size={16} /> Añadir existentes
        </button>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={newMenu}
          onClick={() => setNewMenu((v) => !v)}
          className="btn-primary"
        >
          <Icon name="plus" size={16} strokeWidth={2.25} /> Nuevo
        </button>
        {newMenu && (
          <>
            <button aria-label="Cerrar menú" className="fixed inset-0 z-10 cursor-default" onClick={() => setNewMenu(false)} />
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-slate-900/10 dark:bg-slate-800 dark:ring-white/10"
            >
              <Link
                role="menuitem"
                to={`/new?folder=${folderId}`}
                className="flex items-center gap-2.5 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Icon name="file" size={18} className="text-sky-500" /> Nuevo simulacro
              </Link>
              <button
                role="menuitem"
                onClick={() => {
                  setNewMenu(false);
                  setCreatingSub(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Icon name="folderPlus" size={18} className="text-sky-500" /> Nueva subbiblioteca
              </button>
            </div>
          </>
        )}
      </div>

      {!!subfolders.length && (
        <section>
          <h2 className="section-title mb-2">Subbibliotecas</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {subfolders.map((f) => {
              const n = countIn(f.id);
              const subs = allFolders.filter((x) => x.parent_id === f.id).length;
              return (
                <div key={f.id} className="relative">
                  <button
                    onClick={() => nav(`/folders/${f.id}`)}
                    className="card h-full w-full p-5 text-left transition active:scale-[.98] md:hover:bg-slate-50 md:dark:hover:bg-slate-700/60"
                  >
                    <span className="mb-3 block h-1.5 w-9 rounded-full" style={{ backgroundColor: f.color ?? '#0ea5e9' }} />
                    <p className="line-clamp-2 text-lg font-semibold leading-tight">{f.name}</p>
                    <p className="mt-1.5 text-sm text-slate-500">
                      {n} {n === 1 ? 'simulacro' : 'simulacros'}
                      {subs > 0 && ` · ${subs} sub`}
                    </p>
                  </button>
                  <div className="absolute right-2 top-2 flex items-center gap-0.5">
                    <button
                      aria-label={`Compartir ${f.name}`}
                      onClick={() => setSharing(f)}
                      className="rounded-lg px-1.5 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      🔗
                    </button>
                    <button
                      aria-label={`Mover ${f.name}`}
                      onClick={() => openMove({ kind: 'folder', folder: f })}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                    >
                      Mover
                    </button>
                    <button
                      aria-label={`Eliminar ${f.name}`}
                      onClick={() => {
                        delFolder.reset();
                        setDeleting(f);
                      }}
                      className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!inFolder.length && !subfolders.length && !exams.isLoading && (
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 dark:bg-slate-800">
          Esta biblioteca está vacía. Añade simulacros que ya tengas, o crea un simulacro o una subbiblioteca.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {inFolder.map((e) => (
          <li key={e.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setSheet(e)}
              >
                <p className="flex min-w-0 items-center gap-2 font-semibold">
                  <ExamStatusBadge status={statusOf(e.id)} />
                  <span className="min-w-0 break-words">{e.title}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {e.subject ?? 'Sin tema'} · {e.question_count} preguntas{e.difficulty ? ` · ★ ${e.difficulty}` : ''}
                  {best.data?.[e.id] !== undefined && ` · mejor ${Math.round(best.data[e.id])}%`}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  aria-label="Editar simulacro"
                  onClick={() => nav(`/exams/${e.id}/edit`)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                >
                  <Icon name="pencil" size={18} />
                </button>
                <button
                  onClick={() => openMove({ kind: 'exam', exam: e })}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600"
                >
                  Mover
                </button>
                <button
                  onClick={() => assign.mutate({ examId: e.id, id: null })}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600"
                >
                  Quitar
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {sheet && <ExamStartSheet exam={sheet} onClose={() => setSheet(null)} />}

      {sharing && <ShareDialog key={sharing.id} folderId={sharing.id} title={sharing.name} onClose={() => setSharing(null)} />}

      {moving && (
        <MoveDialog
          target={moving}
          folders={allFolders}
          saving={move.isPending}
          error={move.isError ? (move.error as Error).message : null}
          onPick={(to) => move.mutate({ target: moving, to })}
          onClose={() => setMoving(null)}
        />
      )}

      {deleting && (
        <DeleteFolderDialog
          folder={deleting}
          examCount={countIn(deleting.id)}
          subCount={folderTreeIds(allFolders, deleting.id).size - 1}
          saving={delFolder.isPending}
          error={delFolder.isError ? (delFolder.error as Error).message : null}
          onConfirm={(withExams) => delFolder.mutate({ id: deleting.id, withExams })}
          onClose={() => setDeleting(null)}
        />
      )}

      {creatingSub && (
        <CreateFolderDialog
          title="Nueva subbiblioteca"
          placeholder="Ej. Orgánica"
          saving={createSub.isPending}
          onClose={() => setCreatingSub(false)}
          onCreate={(name, color) => createSub.mutate({ name, color })}
        />
      )}
      {createSub.isError && <p className="text-center text-sm text-red-500">{(createSub.error as Error).message}</p>}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setAdding(false)}>
          <div
            className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-bold">Añadir simulacros</h2>
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
            <button onClick={() => setAdding(false)} className="mt-4 w-full rounded-2xl border py-3 font-bold">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
