import { useState } from 'react';
import { FOLDER_COLORS } from './api';

export default function CreateFolderDialog({
  onClose,
  onCreate,
  saving,
}: {
  onClose: () => void;
  onCreate: (name: string, color: string) => void;
  saving?: boolean;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form
        className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate(name.trim(), color);
        }}
      >
        <h2 className="text-lg font-extrabold">Nueva biblioteca</h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Simulacros Química"
          className="w-full rounded-2xl border-2 border-slate-200 bg-transparent p-3 outline-none focus:border-sky-400 dark:border-slate-600"
        />
        <div>
          <p className="mb-2 text-sm font-bold text-slate-500">Color</p>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={`h-9 w-9 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-slate-800 dark:ring-white' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border-2 py-3 font-bold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 rounded-2xl py-3 font-extrabold text-white disabled:opacity-50"
            style={{ backgroundColor: color }}
          >
            {saving ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  );
}
