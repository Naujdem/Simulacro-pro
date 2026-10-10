import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cleanDeckName, deleteDecks, renameDeck, saveDeckSettings } from './api';
import { SEP, groupNames, labelOf, parentOf, scopeNames, type DeckSettings } from './decks';

interface Props {
  name: string;
  /** Tiene fichas propias (si no, es solo un grupo y no tiene límites propios). */
  hasOwnCards: boolean;
  allNames: string[];
  settings: DeckSettings;
  /** Fichas del mazo y sus subgrupos (para confirmar la eliminación). */
  cardCount: number;
  onClose: () => void;
  onSaved: (finalName: string) => void;
  onDeleted: (parent: string | null) => void;
}

const parseLimit = (v: string): number | null => {
  if (!/^\d{1,4}$/.test(v.trim())) return null;
  return Number(v.trim());
};

const inputCls =
  'w-full rounded-2xl border-2 border-slate-200 bg-transparent p-3 outline-none focus:border-sky-400 dark:border-slate-600';

export function DeckOptionsDialog({ name, hasOwnCards, allNames, settings, cardCount, onClose, onSaved, onDeleted }: Props) {
  const qc = useQueryClient();
  const [group, setGroup] = useState(parentOf(name) ?? '');
  const [label, setLabel] = useState(labelOf(name));
  const [newPerDay, setNewPerDay] = useState(String(settings.new_per_day));
  const [maxReviews, setMaxReviews] = useState(String(settings.max_reviews_per_day));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupNames(allNames), [allNames]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = parseLimit(newPerDay);
    const m = parseLimit(maxReviews);
    if (hasOwnCards && (n === null || m === null)) {
      setError('Los límites deben ser números enteros entre 0 y 9999.');
      return;
    }
    const target = cleanDeckName(group.trim() ? `${group}${SEP}${label}` : label);
    if (!target) {
      setError('El mazo necesita un nombre.');
      return;
    }

    setBusy(true);
    try {
      let finalName = name;
      if (target !== name) finalName = await renameDeck(name, target, allNames);
      if (hasOwnCards) await saveDeckSettings(finalName, { new_per_day: n!, max_reviews_per_day: m! });
      await qc.invalidateQueries({ queryKey: ['flashcards'] });
      onSaved(finalName);
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const what = cardCount === 1 ? '1 ficha' : `${cardCount} fichas`;
    if (!window.confirm(`¿Eliminar “${labelOf(name)}” y sus ${what}? Esto no se puede deshacer.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDecks(scopeNames(allNames, name));
      await qc.invalidateQueries({ queryKey: ['flashcards'] });
      onDeleted(parentOf(name));
    } catch (err) {
      setError((err as Error).message || 'No se pudo eliminar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form
        className="max-h-[90dvh] w-full max-w-sm space-y-4 overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
      >
        <h2 className="text-lg font-extrabold">Opciones del mazo</h2>

        {hasOwnCards && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-500">Fichas nuevas por día</label>
              <input inputMode="numeric" value={newPerDay} onChange={(e) => setNewPerDay(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-500">Máximo de repasos por día</label>
              <input inputMode="numeric" value={maxReviews} onChange={(e) => setMaxReviews(e.target.value)} className={inputCls} />
            </div>
            <p className="text-xs font-medium text-slate-500">
              Aplican a las fichas de este mazo. Con 0 en nuevas no saldrá ninguna ficha nueva.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-500">Grupo (opcional)</label>
            <input
              list="deck-groups"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Ej. Inglés"
              className={inputCls}
            />
            <datalist id="deck-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-500">Nombre</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
          </div>
          <p className="text-xs font-medium text-slate-500">
            Para meter este mazo en un grupo, escribe el nombre del grupo (se crea si no existe). Déjalo vacío para sacarlo de su grupo.
          </p>
        </div>

        {error && <p className="text-sm font-bold text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-2xl border-2 py-3 font-bold disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="flex-1 rounded-2xl bg-sky-500 py-3 font-extrabold text-white disabled:opacity-50">
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        <button type="button" onClick={remove} disabled={busy} className="w-full text-sm font-bold text-red-500 disabled:opacity-50">
          🗑️ Eliminar este mazo y sus fichas
        </button>
      </form>
    </div>
  );
}
