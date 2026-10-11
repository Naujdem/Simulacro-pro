import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import SuggestionView from './SuggestionView';
import { useDraft } from './draftStore';
import { deleteSuggestion, fetchSuggestion, providerName, saveSuggestion, setHelpful, type Suggestion } from './api';

/** Pantalla de una sugerencia: la recién generada (/suggestion) o una guardada (/suggestions/:id). */
export default function SuggestionPage() {
  const { id } = useParams();
  const draft = useDraft((s) => s.draft);
  const nav = useNavigate();
  const qc = useQueryClient();

  const loaded = useQuery({ queryKey: ['suggestion', id], queryFn: () => fetchSuggestion(id!), enabled: !!id });
  // Tras guardar, la sugerencia recién generada pasa a ser una guardada
  const [saved, setSaved] = useState<Suggestion | null>(null);
  // Voto elegido antes de guardar: se guarda junto con la sugerencia
  const [vote, setVote] = useState<boolean | null>(null);

  const current: Suggestion | null = saved ?? loaded.data ?? null;
  const helpful = current ? current.helpful : vote;

  const save = useMutation({
    mutationFn: () => saveSuggestion(draft!, vote),
    onSuccess: (s) => {
      setSaved(s);
      qc.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });
  const rate = useMutation({
    mutationFn: ({ s, value }: { s: Suggestion; value: boolean | null }) => setHelpful(s.id, value).then(() => value),
    onSuccess: (value, { s }) => {
      setSaved({ ...s, helpful: value });
      qc.setQueryData(['suggestion', s.id], { ...s, helpful: value });
      qc.invalidateQueries({ queryKey: ['suggestions'] });
    },
  });
  const remove = useMutation({
    mutationFn: (sid: string) => deleteSuggestion(sid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suggestions'] });
      nav('/suggestions', { replace: true });
    },
  });

  if (!id && !draft) return <Navigate to="/suggestions" replace />;
  if (id && loaded.isLoading) return <p className="p-6 text-center text-slate-500">Cargando…</p>;
  if (id && !current) return <p className="p-6 text-center text-red-500">No se encontró la sugerencia.</p>;

  const title = current?.title ?? draft!.title;
  const content = current?.content ?? draft!.content;
  const choose = (value: boolean) => {
    const next = helpful === value ? null : value; // volver a tocar quita el voto
    if (current) rate.mutate({ s: current, value: next });
    else setVote(next);
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <Link to={id ? '/suggestions' : '/results'} className="text-sm font-bold text-sky-500">
        ← {id ? 'Sugerencias guardadas' : 'Volver a resultados'}
      </Link>
      <h1 className="sr-only">{title}</h1>

      {!current && draft?.usedOther && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          La IA elegida no respondió; se generó con {providerName(draft.provider)}.
        </p>
      )}

      <article className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <SuggestionView content={content} />
      </article>

      <p className="text-xs text-slate-500">
        La IA puede equivocarse: revisa los datos importantes. Los enlaces de YouTube abren una búsqueda.
      </p>

      <div className="space-y-2">
        <p className="text-center text-sm font-bold">¿Te sirvió esta sugerencia?</p>
        <div className="grid grid-cols-2 gap-2">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              disabled={rate.isPending}
              aria-pressed={helpful === v}
              onClick={() => choose(v)}
              className={`rounded-xl border-2 py-3 text-sm font-extrabold disabled:opacity-50 ${
                helpful === v ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 dark:border-slate-600'
              }`}
            >
              {v ? '👍 Útil' : '👎 No útil'}
            </button>
          ))}
        </div>
      </div>

      {!current && (
        <button
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="w-full rounded-2xl bg-green-500 py-4 font-extrabold uppercase text-white disabled:opacity-50"
        >
          {save.isPending ? 'Guardando…' : 'Guardar sugerencia'}
        </button>
      )}
      {saved && !id && (
        <p className="rounded-xl bg-green-100 p-3 text-center text-sm font-bold text-green-700 dark:bg-green-950 dark:text-green-300">
          ✓ Guardada. La encuentras en Progreso → Sugerencias guardadas.
        </p>
      )}
      {id && current && (
        <button
          disabled={remove.isPending}
          onClick={() => window.confirm('¿Eliminar esta sugerencia?') && remove.mutate(current.id)}
          className="w-full py-3 text-sm font-bold text-red-500"
        >
          Eliminar sugerencia
        </button>
      )}
      {[save, rate, remove].map((m, i) => m.isError && <p key={i} className="text-xs text-red-500">{(m.error as Error).message}</p>)}
    </div>
  );
}
