import { folderTreeIds, type Exam, type Folder } from './api';

/** Qué se está moviendo: una biblioteca o un simulacro. */
export type MoveTarget = { kind: 'folder'; folder: Folder } | { kind: 'exam'; exam: Exam };

interface Props {
  target: MoveTarget;
  folders: Folder[];
  saving?: boolean;
  error?: string | null;
  /** `null` = nivel principal (biblioteca de primer nivel, o simulacro sin biblioteca). */
  onPick: (destinationId: string | null) => void;
  onClose: () => void;
}

/** Lista las bibliotecas en forma de árbol (con sangría) para elegir destino. */
function flatten(folders: Folder[], excluded: Set<string>): { folder: Folder; depth: number }[] {
  const out: { folder: Folder; depth: number }[] = [];
  const seen = new Set<string>();
  const ids = new Set(folders.map((f) => f.id));
  const walk = (parent: string | null, depth: number) => {
    folders
      .filter((f) => {
        const isTop = !f.parent_id || !ids.has(f.parent_id);
        return parent === null ? isTop : f.parent_id === parent;
      })
      .filter((f) => !excluded.has(f.id) && !seen.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((f) => {
        seen.add(f.id);
        out.push({ folder: f, depth });
        walk(f.id, depth + 1);
      });
  };
  walk(null, 0);
  return out;
}

export default function MoveDialog({ target, folders, saving, error, onPick, onClose }: Props) {
  const isFolder = target.kind === 'folder';
  const name = isFolder ? target.folder.name : target.exam.title;
  // Una biblioteca no puede ir dentro de sí misma ni de sus subbibliotecas
  const excluded = isFolder ? folderTreeIds(folders, target.folder.id) : new Set<string>();
  const currentId = isFolder ? (target.folder.parent_id ?? null) : target.exam.folder_id;
  const rootLabel = isFolder ? 'Nivel principal' : 'Sin biblioteca';
  const rows = flatten(folders, excluded);

  const rowClass =
    'flex w-full items-center gap-2 rounded-2xl bg-slate-100 p-3 text-left font-bold disabled:opacity-50 dark:bg-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Mover a…</h2>
        <p className="mb-3 truncate text-sm text-slate-500">{name}</p>

        <ul className="space-y-2">
          <li>
            <button disabled={saving || currentId === null} onClick={() => onPick(null)} className={rowClass}>
              <span>{rootLabel}</span>
              {currentId === null && <span className="text-xs font-normal text-slate-500">(actual)</span>}
            </button>
          </li>
          {rows.map(({ folder, depth }) => (
            <li key={folder.id} style={{ paddingLeft: depth * 16 }}>
              <button disabled={saving || folder.id === currentId} onClick={() => onPick(folder.id)} className={rowClass}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: folder.color ?? '#0ea5e9' }} />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                {folder.id === currentId && <span className="text-xs font-normal text-slate-500">(actual)</span>}
              </button>
            </li>
          ))}
        </ul>

        {!rows.length && <p className="mt-3 text-sm text-slate-500">No hay otras bibliotecas disponibles.</p>}
        {error && <p className="mt-3 text-center text-sm text-red-500">{error}</p>}

        <button onClick={onClose} className="mt-4 w-full rounded-2xl border py-3 font-bold">
          Cancelar
        </button>
      </div>
    </div>
  );
}
