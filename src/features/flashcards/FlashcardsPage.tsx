import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  created_at: string;
}

const fetchFlashcards = async (): Promise<Flashcard[]> => {
  const { data, error } = await supabase
    .from('flashcards')
    .select('id,front,back,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Flashcard[];
};

function NewFlashcardDialog({
  onClose,
  onCreate,
  saving,
  error,
}: {
  onClose: () => void;
  onCreate: (front: string, back: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const canSave = front.trim() !== '' && back.trim() !== '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form
        className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSave) return;
          onCreate(front.trim(), back.trim());
        }}
      >
        <h2 className="text-lg font-extrabold">Nueva ficha</h2>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-500">Frente</label>
          <textarea
            autoFocus
            rows={3}
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="Ej. ¿Qué es la molaridad?"
            className="w-full rounded-2xl border-2 border-slate-200 bg-transparent p-3 outline-none focus:border-sky-400 dark:border-slate-600"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-500">Reverso</label>
          <textarea
            rows={3}
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="Ej. Moles de soluto por litro de solución"
            className="w-full rounded-2xl border-2 border-slate-200 bg-transparent p-3 outline-none focus:border-sky-400 dark:border-slate-600"
          />
        </div>

        {error && <p className="text-sm font-bold text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border-2 py-3 font-bold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !canSave}
            className="flex-1 rounded-2xl bg-sky-500 py-3 font-extrabold text-white disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function FlashcardsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [showForm, setShowForm] = useState(false);

  const cards = useQuery({ queryKey: ['flashcards'], queryFn: fetchFlashcards });

  const create = useMutation({
    mutationFn: async ({ front, back }: { front: string; back: string }) => {
      // user_id se llena solo en la base de datos (default auth.uid())
      const { error } = await supabase.from('flashcards').insert({ front, back });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flashcards'] });
      setShowForm(false);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('flashcards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flashcards'] }),
  });

  const list = cards.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Fichas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => nav('/flashcards/study')}
            disabled={list.length === 0}
            className="rounded-2xl bg-green-500 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50"
          >
            Estudiar
          </button>
          <button
            onClick={() => {
              create.reset();
              setShowForm(true);
            }}
            className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-extrabold text-white"
          >
            + Nueva Ficha
          </button>
        </div>
      </div>

      {cards.isLoading && <p className="text-slate-500">Cargando…</p>}
      {cards.error && <p className="text-sm font-bold text-red-500">No se pudieron cargar las fichas.</p>}

      {!cards.isLoading && !cards.error && list.length === 0 && (
        <p className="rounded-2xl bg-white p-4 text-center text-slate-500 shadow-sm dark:bg-slate-800">
          Aún no tienes fichas. Toca “+ Nueva Ficha” para crear la primera.
        </p>
      )}

      <ul className="space-y-3">
        {list.map((c) => (
          <li
            key={c.id}
            className="flex items-start justify-between gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800"
          >
            <p className="flex-1 whitespace-pre-wrap font-bold">{c.front}</p>
            <button
              aria-label="Eliminar ficha"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm('¿Eliminar esta ficha?')) remove.mutate(c.id);
              }}
              className="px-2 text-lg disabled:opacity-50"
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>

      {showForm && (
        <NewFlashcardDialog
          onClose={() => setShowForm(false)}
          onCreate={(front, back) => create.mutate({ front, back })}
          saving={create.isPending}
          error={create.error ? 'No se pudo guardar la ficha. Intenta de nuevo.' : null}
        />
      )}
    </div>
  );
}
