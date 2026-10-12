import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSuggestions } from './api';

export default function SuggestionsListPage() {
  const list = useQuery({ queryKey: ['suggestions'], queryFn: fetchSuggestions });
  return (
    <div className="space-y-4 p-4">
      <Link to="/stats" className="text-sm font-bold text-sky-500">← Progreso</Link>
      <h1 className="text-2xl font-bold">Sugerencias guardadas</h1>
      {list.isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {list.isError && <p className="text-sm text-red-500">{(list.error as Error).message}</p>}
      {list.data && !list.data.length && (
        <p className="text-sm text-slate-500">
          Aún no tienes sugerencias. Al terminar un simulacro con 3 o más fallos, pulsa «Generar sugerencia de estudio».
        </p>
      )}
      <ul className="space-y-2">
        {(list.data ?? []).map((s) => (
          <li key={s.id}>
            <Link to={`/suggestions/${s.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm shadow-sm dark:bg-slate-800">
              <span className="min-w-0">
                <b className="block truncate">{s.title}</b>
                <span className="text-xs text-slate-500">
                  {new Date(s.created_at).toLocaleDateString()} · {s.failed_count === 1 ? '1 fallo' : `${s.failed_count} fallos`}
                </span>
              </span>
              <span aria-label={s.helpful === true ? 'Útil' : s.helpful === false ? 'No útil' : 'Sin valorar'}>
                {s.helpful === true ? '👍' : s.helpful === false ? '👎' : '›'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
