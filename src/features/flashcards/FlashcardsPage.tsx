import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AudioButton } from '@/components/AudioButton';
import { parseFlashcardsCsv } from './csv';
import { AnkiImporter } from './AnkiImporter';
import { DeckOptionsDialog } from './DeckOptionsDialog';
import { cleanDeckName, deleteDecks, fetchDeckCards, fetchDeckSettings, fetchStatRows } from './api';
import { DECK_NONE } from './columns';
import {
  DEFAULT_SETTINGS,
  ZERO_COUNTS,
  buildDeckTree,
  computeDeckCounts,
  findNode,
  groupNames,
  labelOf,
  parentOf,
  settingsFor,
  sumCounts,
  type DeckCounts,
  type DeckNode,
} from './decks';

export type { Flashcard } from './types';

/* ───────────── Datos compartidos por las dos vistas ───────────── */

function useDeckData() {
  const stats = useQuery({ queryKey: ['flashcards', 'stats'], queryFn: fetchStatRows });
  const settings = useQuery({ queryKey: ['flashcards', 'decksettings'], queryFn: fetchDeckSettings });

  const model = useMemo(() => {
    if (!stats.data) return null;
    const map = settings.data?.map ?? new Map();
    const byDeck = computeDeckCounts(stats.data.rows, map, new Date());
    return {
      settings: map,
      tree: buildDeckTree(byDeck),
      names: [...byDeck.keys()].filter((k): k is string => k !== null),
      none: byDeck.get(null) ?? null,
    };
  }, [stats.data, settings.data]);

  return {
    model,
    loading: stats.isLoading,
    error: stats.error,
    missingSchema: !!stats.data?.missingSchema || !!settings.data?.missing,
  };
}
type DeckData = ReturnType<typeof useDeckData>;

/** "Sin mazo" se muestra como un mazo más. */
const noneNode = (c: DeckCounts): DeckNode => ({
  name: DECK_NONE,
  label: 'Sin mazo',
  depth: 0,
  hasCards: true,
  own: c,
  agg: c,
  children: [],
});

/* ───────────── Piezas pequeñas ───────────── */

function Counts({ c }: { c: DeckCounts }) {
  return (
    <p className="text-xs font-bold">
      <span className="text-sky-500">{c.newToday} nuevas</span> · <span className="text-green-600">{c.dueToday} repasos</span> ·{' '}
      <span className="text-slate-500">{c.total} fichas</span>
    </p>
  );
}

function MissingMigrationNote() {
  return (
    <p className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      Para activar las opciones por mazo y el límite diario, ejecuta <code>supabase/migrations/0005_deck_options.sql</code> en el SQL
      Editor de Supabase.
    </p>
  );
}

function DeckRow({
  node,
  baseDepth = 0,
  collapsed,
  toggle,
  onOpen,
  onStudy,
}: {
  node: DeckNode;
  baseDepth?: number;
  collapsed: Set<string>;
  toggle: (name: string) => void;
  onOpen: (name: string) => void;
  onStudy: (name: string) => void;
}) {
  const isOpen = !collapsed.has(node.name);
  const todo = node.agg.newToday + node.agg.dueToday;
  return (
    <>
      <div
        style={{ marginLeft: (node.depth - baseDepth) * 14 }}
        className="flex items-center gap-2 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800"
      >
        {node.children.length > 0 ? (
          <button onClick={() => toggle(node.name)} aria-label={isOpen ? 'Contraer' : 'Expandir'} className="w-5 text-slate-500">
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(node.name)}>
          <p className="truncate font-extrabold">
            {node.hasCards ? '' : '📁 '}
            {node.label}
          </p>
          <Counts c={node.agg} />
        </button>
        <button
          onClick={() => onStudy(node.name)}
          disabled={todo === 0}
          className="shrink-0 rounded-xl bg-green-500 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-40"
        >
          {todo === 0 ? 'Al día' : 'Estudiar'}
        </button>
      </div>
      {isOpen &&
        node.children.map((ch) => (
          <DeckRow key={ch.name} node={ch} baseDepth={baseDepth} collapsed={collapsed} toggle={toggle} onOpen={onOpen} onStudy={onStudy} />
        ))}
    </>
  );
}

function NewFlashcardDialog({
  onClose,
  onCreate,
  saving,
  error,
  decks,
  defaultDeck,
}: {
  onClose: () => void;
  onCreate: (front: string, back: string, deck: string) => void;
  saving: boolean;
  error: string | null;
  decks: string[];
  defaultDeck: string;
}) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [deck, setDeck] = useState(defaultDeck);
  const canSave = front.trim() !== '' && back.trim() !== '';
  const field =
    'w-full rounded-2xl border-2 border-slate-200 bg-transparent p-3 outline-none focus:border-sky-400 dark:border-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <form
        className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSave) return;
          onCreate(front.trim(), back.trim(), cleanDeckName(deck));
        }}
      >
        <h2 className="text-lg font-extrabold">Nueva ficha</h2>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-500">Frente</label>
          <textarea autoFocus rows={3} value={front} onChange={(e) => setFront(e.target.value)} placeholder="Ej. ¿Qué es la molaridad?" className={field} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-500">Reverso</label>
          <textarea rows={3} value={back} onChange={(e) => setBack(e.target.value)} placeholder="Ej. Moles de soluto por litro de solución" className={field} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-500">Mazo (opcional)</label>
          <input list="new-card-decks" value={deck} onChange={(e) => setDeck(e.target.value)} placeholder="Ej. Química::Estequiometría" className={field} />
          <datalist id="new-card-decks">
            {decks.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>

        {error && <p className="text-sm font-bold text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-2xl border-2 py-3 font-bold">
            Cancelar
          </button>
          <button type="submit" disabled={saving || !canSave} className="flex-1 rounded-2xl bg-sky-500 py-3 font-extrabold text-white disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Importar CSV / .apkg. El CSV va al mazo abierto, o a un mazo con el nombre del archivo. */
function ImportBar({ targetDeck }: { targetDeck: string | null }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAnki, setShowAnki] = useState(false);

  const importCsv = useMutation({
    mutationFn: async (rows: { front: string; back: string; deck: string }[]) => {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('flashcards').insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flashcards'] }),
  });

  const handleFile = async (file: File) => {
    setMsg(null);
    if (file.size > 2_000_000) {
      setMsg({ ok: false, text: 'El archivo es muy grande (máximo 2 MB).' });
      return;
    }
    const text = await file.text();
    const { cards: parsed, skipped } = parseFlashcardsCsv(text);
    if (parsed.length === 0) {
      setMsg({ ok: false, text: 'No se encontraron fichas válidas. Usa el formato: frente,reverso' });
      return;
    }
    const deck = targetDeck ?? (cleanDeckName(file.name.replace(/\.[^.]+$/, '')) || 'Importado');
    let question = `Se importarán ${parsed.length} fichas al mazo “${deck}”`;
    if (skipped > 0) question += ` (${skipped} filas omitidas por estar incompletas)`;
    question += '. ¿Continuar?';
    if (text.includes('�')) {
      question += '\n\n⚠️ Parece que el archivo no está en UTF-8: algunas letras con tilde podrían verse mal.';
    }
    if (!window.confirm(question)) return;
    try {
      await importCsv.mutateAsync(parsed.map((c) => ({ ...c, deck })));
      setMsg({ ok: true, text: `Se importaron ${parsed.length} fichas al mazo “${deck}”.` });
    } catch {
      setMsg({
        ok: false,
        text: 'No se pudieron importar todas las fichas. Es posible que algunas sí se hayan guardado: revisa el mazo.',
      });
    }
  };

  return (
    <div className="space-y-2">
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
          onClick={() => setShowAnki(!showAnki)}
          className="rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700"
        >
          {showAnki ? '✕ Cerrar Anki' : '📦 Importar .apkg (Anki)'}
        </button>
      </div>

      {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}

      {showAnki && <AnkiImporter onImportSuccess={() => qc.invalidateQueries({ queryKey: ['flashcards'] })} />}
    </div>
  );
}

function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ front, back, deck }: { front: string; back: string; deck: string }) => {
      const { error } = await supabase.from('flashcards').insert({ front, back, deck: deck || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flashcards'] }),
  });
}

/* ───────────── Vista 1: todos los mazos ───────────── */

function DeckOverview({
  data,
  go,
  study,
}: {
  data: DeckData;
  go: (deck: string | null) => void;
  study: (scope: string | null) => void;
}) {
  const { model } = data;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const create = useCreateCard();

  const toggle = (name: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  const today = model ? [...model.tree.map((n) => n.agg), ...(model.none ? [model.none] : [])].reduce(sumCounts, ZERO_COUNTS) : ZERO_COUNTS;
  const todo = today.newToday + today.dueToday;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Fichas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => study(null)}
            disabled={todo === 0}
            className="rounded-2xl bg-green-500 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50"
          >
            Estudiar todo
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

      <ImportBar targetDeck={null} />
      {data.missingSchema && <MissingMigrationNote />}

      {data.loading && <p className="text-slate-500">Cargando…</p>}
      {data.error && <p className="text-sm font-bold text-red-500">No se pudieron cargar las fichas.</p>}

      {model && model.tree.length === 0 && !model.none && (
        <p className="rounded-2xl bg-white p-4 text-center text-slate-500 shadow-sm dark:bg-slate-800">
          Aún no tienes fichas. Toca “+ Nueva Ficha” o importa un mazo.
        </p>
      )}

      {model && (
        <div className="space-y-2">
          {model.tree.map((n) => (
            <DeckRow key={n.name} node={n} collapsed={collapsed} toggle={toggle} onOpen={go} onStudy={study} />
          ))}
          {model.none && <DeckRow node={noneNode(model.none)} collapsed={collapsed} toggle={toggle} onOpen={go} onStudy={study} />}
        </div>
      )}

      {showForm && (
        <NewFlashcardDialog
          onClose={() => setShowForm(false)}
          onCreate={(front, back, deck) => create.mutate({ front, back, deck }, { onSuccess: () => setShowForm(false) })}
          saving={create.isPending}
          error={create.error ? 'No se pudo guardar la ficha. Intenta de nuevo.' : null}
          decks={model?.names ?? []}
          defaultDeck=""
        />
      )}
    </div>
  );
}

/* ───────────── Vista 2: un mazo (o grupo) ───────────── */

function DeckDetail({
  name,
  data,
  go,
  study,
}: {
  name: string;
  data: DeckData;
  go: (deck: string | null) => void;
  study: (scope: string | null) => void;
}) {
  const qc = useQueryClient();
  const { model } = data;
  const isNone = name === DECK_NONE;
  const parent = isNone ? null : parentOf(name);

  const node = !model ? null : isNone ? (model.none ? noneNode(model.none) : null) : findNode(model.tree, name);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(50);
  const [showOptions, setShowOptions] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const create = useCreateCard();

  const cards = useQuery({
    queryKey: ['flashcards', 'deck', name],
    queryFn: () => fetchDeckCards(isNone ? null : name),
    enabled: !!node && node.hasCards,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('flashcards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flashcards'] }),
  });

  const removeLoose = useMutation({
    mutationFn: () => deleteDecks([null]),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['flashcards'] });
      go(null);
    },
  });

  const toggle = (n: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const back = (
    <button onClick={() => go(parent)} className="text-sm font-bold text-sky-500">
      ← {parent ? labelOf(parent) : 'Mazos'}
    </button>
  );

  if (data.loading) return <div className="space-y-4 p-4">{back}<p className="text-slate-500">Cargando…</p></div>;
  if (!node) {
    return (
      <div className="space-y-4 p-4">
        {back}
        <p className="rounded-2xl bg-white p-4 text-center text-slate-500 shadow-sm dark:bg-slate-800">Este mazo ya no existe.</p>
      </div>
    );
  }

  const list = cards.data ?? [];
  const todo = node.agg.newToday + node.agg.dueToday;
  const settings = isNone || !model ? DEFAULT_SETTINGS : settingsFor(model.settings, name);

  return (
    <div className="space-y-4 p-4">
      {back}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{node.label}</h1>
          <Counts c={node.agg} />
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => study(name)}
            disabled={todo === 0}
            className="rounded-2xl bg-green-500 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50"
          >
            Estudiar
          </button>
          {!isNone && (
            <button onClick={() => setShowOptions(true)} aria-label="Opciones del mazo" className="rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm font-bold dark:border-slate-700">
              ⚙️
            </button>
          )}
        </div>
      </div>

      {!isNone && node.hasCards && (
        <p className="text-xs font-bold text-slate-500">
          Límites diarios: {settings.new_per_day} nuevas · {settings.max_reviews_per_day} repasos
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            create.reset();
            setShowForm(true);
          }}
          className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-extrabold text-white"
        >
          + Nueva Ficha
        </button>
        {isNone && (
          <button
            onClick={() => {
              if (window.confirm(`¿Eliminar las ${node.own.total} fichas sin mazo? Esto no se puede deshacer.`)) removeLoose.mutate();
            }}
            disabled={removeLoose.isPending}
            className="text-sm font-bold text-red-500 disabled:opacity-50"
          >
            🗑️ {removeLoose.isPending ? 'Eliminando…' : 'Eliminar estas fichas'}
          </button>
        )}
      </div>

      <ImportBar targetDeck={isNone ? null : name} />

      {node.children.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">Mazos de este grupo</h2>
          {node.children.map((ch) => (
            <DeckRow key={ch.name} node={ch} baseDepth={node.depth + 1} collapsed={collapsed} toggle={toggle} onOpen={go} onStudy={study} />
          ))}
        </div>
      )}

      {!node.hasCards && node.children.length > 0 && (
        <p className="text-sm text-slate-500">Este grupo no tiene fichas propias: abre uno de sus mazos o toca “Estudiar” para repasarlos todos.</p>
      )}

      {node.hasCards && (
        <div className="space-y-2">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">Fichas</h2>
          {cards.isLoading && <p className="text-slate-500">Cargando…</p>}
          {cards.error && <p className="text-sm font-bold text-red-500">No se pudieron cargar las fichas.</p>}

          <ul className="space-y-3">
            {list.slice(0, visible).map((c) => {
              const audio = c.audio_ref ?? c.back_audio_ref;
              return (
                <li key={c.id} className="flex items-start gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap font-bold">{c.front}</p>
                    {c.back && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-500">{c.back}</p>}
                  </div>
                  {audio && <AudioButton src={audio} size="sm" />}
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
              );
            })}
          </ul>

          {list.length > visible && (
            <button onClick={() => setVisible((v) => v + 50)} className="w-full rounded-2xl border-2 border-slate-200 py-3 text-sm font-bold dark:border-slate-700">
              Mostrar más ({list.length - visible} restantes)
            </button>
          )}
        </div>
      )}

      {showOptions && model && (
        <DeckOptionsDialog
          name={name}
          hasOwnCards={node.hasCards}
          allNames={model.names}
          settings={settings}
          cardCount={node.agg.total}
          onClose={() => setShowOptions(false)}
          onSaved={(finalName) => {
            setShowOptions(false);
            if (finalName !== name) go(finalName);
          }}
          onDeleted={(p) => {
            setShowOptions(false);
            go(p);
          }}
        />
      )}

      {showForm && (
        <NewFlashcardDialog
          onClose={() => setShowForm(false)}
          onCreate={(front, back, deck) => create.mutate({ front, back, deck }, { onSuccess: () => setShowForm(false) })}
          saving={create.isPending}
          error={create.error ? 'No se pudo guardar la ficha. Intenta de nuevo.' : null}
          decks={[...(model?.names ?? []), ...(model ? groupNames(model.names) : [])]}
          defaultDeck={isNone ? '' : name}
        />
      )}
    </div>
  );
}

/* ───────────── Página ───────────── */

export default function FlashcardsPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const deckParam = params.get('deck');
  const data = useDeckData();

  const go = (deck: string | null) => (deck ? setParams({ deck }) : setParams({}));
  const study = (scope: string | null) => nav(scope ? `/flashcards/study?deck=${encodeURIComponent(scope)}` : '/flashcards/study');

  return deckParam ? (
    <DeckDetail key={deckParam} name={deckParam} data={data} go={go} study={study} />
  ) : (
    <DeckOverview data={data} go={go} study={study} />
  );
}
