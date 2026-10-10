import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { parseFlashcardsCsv } from './csv';
import { AnkiImporter } from './AnkiImporter';
import { DECK_ALL, DECK_NONE, isMissingColumn } from './columns';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  created_at: string;
  imagen_ref?: string | null;
  audio_ref?: string | null;
  back_imagen_ref?: string | null;
  back_audio_ref?: string | null;
  deck?: string | null;
}

// Trae todas las fichas por páginas (Supabase devuelve como máximo 1000 filas por consulta).
const fetchFlashcards = async (): Promise<Flashcard[]> => {
  const PAGE = 1000;
  const all: Flashcard[] = [];
  let columns = 'id,front,back,created_at,imagen_ref,audio_ref,deck';
  for (let from = 0; ; from += PAGE) {
    let { data, error } = await supabase
      .from('flashcards')
      .select(columns)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE - 1);
    if (error && isMissingColumn(error) && columns.endsWith(',deck')) {
      // Aún no se ejecutó la migración 0004: la lista funciona igual, solo sin mazos.
      columns = 'id,front,back,created_at,imagen_ref,audio_ref';
      ({ data, error } = await supabase
        .from('flashcards')
        .select(columns)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, from + PAGE - 1));
    }
    if (error) throw error;
    const page = (data ?? []) as unknown as Flashcard[];
    all.push(...page);
    if (page.length < PAGE) return all;
  }
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAnkiImporter, setShowAnkiImporter] = useState(false);

  // Inserta las fichas en lotes de 500
  const importCsv = useMutation({
    mutationFn: async (rows: { front: string; back: string }[]) => {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('flashcards').insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flashcards'] }),
  });

  const handleFile = async (file: File) => {
    setImportMsg(null);
    if (file.size > 2_000_000) {
      setImportMsg({ ok: false, text: 'El archivo es muy grande (máximo 2 MB).' });
      return;
    }
    const text = await file.text();
    const { cards: parsed, skipped } = parseFlashcardsCsv(text);
    if (parsed.length === 0) {
      setImportMsg({ ok: false, text: 'No se encontraron fichas válidas. Usa el formato: frente,reverso' });
      return;
    }
    let question = `Se importarán ${parsed.length} fichas`;
    if (skipped > 0) question += ` (${skipped} filas omitidas por estar incompletas)`;
    question += '. ¿Continuar?';
    if (text.includes('\uFFFD')) {
      question += '\n\n⚠️ Parece que el archivo no está en UTF-8: algunas letras con tilde podrían verse mal.';
    }
    if (!window.confirm(question)) return;
    try {
      await importCsv.mutateAsync(parsed);
      setImportMsg({ ok: true, text: `Se importaron ${parsed.length} fichas.` });
    } catch {
      setImportMsg({
        ok: false,
        text: 'No se pudieron importar todas las fichas. Es posible que algunas sí se hayan guardado: revisa la lista.',
      });
    }
  };

  const [showForm, setShowForm] = useState(false);

  const cards = useQuery({ queryKey: ['flashcards'], queryFn: fetchFlashcards });

  const create = useMutation({
    mutationFn: async ({ front, back }: { front: string; back: string }) => {
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

  const all = cards.data ?? [];

  // Mazos (viene de Anki): chips para filtrar y estudiar un mazo a la vez
  const [deckFilter, setDeckFilter] = useState<string>(DECK_ALL);
  const decks = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const c of all) {
      if (c.deck) counts.set(c.deck, (counts.get(c.deck) ?? 0) + 1);
      else none++;
    }
    return { list: [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)), none };
  }, [all]);
  const hasDecks = decks.list.length > 0;
  const filter = hasDecks && (deckFilter === DECK_NONE ? decks.none > 0 : deckFilter === DECK_ALL || decks.list.some(([d]) => d === deckFilter)) ? deckFilter : DECK_ALL;
  const list = filter === DECK_ALL ? all : filter === DECK_NONE ? all.filter((c) => !c.deck) : all.filter((c) => c.deck === filter);

  const removeDeck = useMutation({
    mutationFn: async (target: string) => {
      const q = supabase.from('flashcards').delete();
      const { error } = target === DECK_NONE ? await q.is('deck', null) : await q.eq('deck', target);
      if (error) throw error;
    },
    onSuccess: () => {
      setDeckFilter(DECK_ALL);
      qc.invalidateQueries({ queryKey: ['flashcards'] });
    },
  });

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${active ? 'bg-sky-500 text-white' : 'border-2 border-slate-200 dark:border-slate-700'}`;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Fichas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => nav(filter === DECK_ALL ? '/flashcards/study' : `/flashcards/study?deck=${encodeURIComponent(filter)}`)}
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

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void handleFile(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importCsv.isPending}
          className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold disabled:opacity-50 dark:border-slate-700"
        >
          {importCsv.isPending ? 'Importando…' : '📥 Importar CSV'}
        </button>

        <button
          onClick={() => setShowAnkiImporter(!showAnkiImporter)}
          className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700"
        >
          {showAnkiImporter ? '✕ Cerrar Anki' : '📦 Importar .apkg (Anki)'}
        </button>
      </div>

      {importMsg && (
        <p className={`mt-2 text-sm font-bold ${importMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{importMsg.text}</p>
      )}

      {showAnkiImporter && (
        <div className="mt-2">
          <AnkiImporter
            onImportSuccess={() => {
              qc.invalidateQueries({ queryKey: ['flashcards'] });
            }}
          />
        </div>
      )}

      {hasDecks && (
        <div className="space-y-2">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <button onClick={() => setDeckFilter(DECK_ALL)} className={chip(filter === DECK_ALL)}>
              Todos ({all.length})
            </button>
            {decks.list.map(([name, n]) => (
              <button key={name} onClick={() => setDeckFilter(name)} className={chip(filter === name)}>
                {name} ({n})
              </button>
            ))}
            {decks.none > 0 && (
              <button onClick={() => setDeckFilter(DECK_NONE)} className={chip(filter === DECK_NONE)}>
                Sin mazo ({decks.none})
              </button>
            )}
          </div>
          {filter !== DECK_ALL && (
            <button
              disabled={removeDeck.isPending}
              onClick={() => {
                const label = filter === DECK_NONE ? 'sin mazo' : `del mazo “${filter}”`;
                if (window.confirm(`¿Eliminar las ${list.length} fichas ${label}? Esto no se puede deshacer.`)) removeDeck.mutate(filter);
              }}
              className="text-sm font-bold text-red-500 disabled:opacity-50"
            >
              🗑️ {removeDeck.isPending ? 'Eliminando…' : 'Eliminar estas fichas'}
            </button>
          )}
          {removeDeck.isError && <p className="text-sm font-bold text-red-500">No se pudieron eliminar las fichas.</p>}
        </div>
      )}

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
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap font-bold">{c.front}</p>
              {c.back && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-500">{c.back}</p>}
            </div>
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
