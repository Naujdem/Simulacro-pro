import { useState } from 'react';
import type { Folder } from './api';

export default function DeleteFolderDialog({
  folder,
  examCount,
  subCount,
  saving,
  error,
  onConfirm,
  onClose,
}: {
  folder: Folder;
  /** Simulacros que hay en la biblioteca contando todas sus subbibliotecas. */
  examCount: number;
  /** Subbibliotecas a cualquier nivel (se eliminan junto con la biblioteca). */
  subCount: number;
  saving?: boolean;
  error?: string | null;
  onConfirm: (deleteExams: boolean) => void;
  onClose: () => void;
}) {
  const [withExams, setWithExams] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={saving ? undefined : onClose}>
      <div
        role="alertdialog"
        aria-labelledby="delete-folder-title"
        className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-folder-title" className="text-lg font-bold">
          ¿Eliminar «{folder.name}»?
        </h2>

        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {subCount > 0 && (
            <p>{subCount === 1 ? 'También se eliminará su subbiblioteca.' : `También se eliminarán sus ${subCount} subbibliotecas.`}</p>
          )}
          {examCount > 0 ? (
            <p>
              Contiene {examCount} {examCount === 1 ? 'simulacro' : 'simulacros'}.{' '}
              {withExams ? (
                <strong className="text-red-600 dark:text-red-400">Se eliminarán para siempre, con sus preguntas e historial.</strong>
              ) : (
                'Se conservarán y pasarán a «Sin biblioteca».'
              )}
            </p>
          ) : (
            <p>La biblioteca está vacía.</p>
          )}
        </div>

        {examCount > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-600">
            <input
              type="checkbox"
              checked={withExams}
              onChange={(e) => setWithExams(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-red-600"
            />
            <span>Eliminar también los simulacros que contiene</span>
          </label>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-2xl border py-3 font-bold disabled:opacity-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(withExams)}
            disabled={saving}
            className="flex-1 rounded-2xl bg-red-600 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}
