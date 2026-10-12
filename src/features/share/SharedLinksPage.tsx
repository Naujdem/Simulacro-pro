import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { linkFor, listLinks, setLinkActive, type MediaResult, type SharedLink } from './api';

/** Estadísticas del creador: cuántas veces se abrió cada enlace, cuántas copias se guardaron y botón para desactivarlo. */
export default function SharedLinksPage() {
  const qc = useQueryClient();
  const links = useQuery({ queryKey: ['shared-links'], queryFn: listLinks });
  const [copied, setCopied] = useState('');
  const [note, setNote] = useState('');

  const toggle = useMutation({
    mutationFn: (l: SharedLink): Promise<MediaResult> => setLinkActive(l, !l.is_active),
    onSuccess: (r, l) => {
      setNote(
        !l.is_active && r.status === 'nodrive'
          ? 'Enlace activado. Conecta tu Drive (botón Compartir del simulacro) para que se vean sus imágenes y audios.'
          : '',
      );
      qc.invalidateQueries({ queryKey: ['shared-links'] });
    },
  });

  const copy = async (l: SharedLink) => {
    try {
      await navigator.clipboard.writeText(linkFor(l.short_id));
      setCopied(l.id);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* el enlace se puede seleccionar a mano */
    }
  };

  const list = links.data ?? [];
  const tv = list.reduce((a, l) => a + l.views, 0);
  const tc = list.reduce((a, l) => a + l.copies, 0);

  return (
    <div className="space-y-4 p-4">
      <Link to="/stats" className="text-sm font-bold text-sky-500">← Progreso</Link>
      <h1 className="text-2xl font-extrabold">Simulacros compartidos</h1>
      {links.isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {links.isError && <p className="text-sm text-red-500">{(links.error as Error).message}</p>}
      {links.data && !list.length && (
        <p className="text-sm text-slate-500">Aún no compartes ningún simulacro. Abre uno y pulsa «🔗 Compartir».</p>
      )}
      {list.length > 0 && (
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
            <div className="text-xl font-extrabold">{tv}</div>
            <div className="text-xs text-slate-500">veces abiertos</div>
          </div>
          <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
            <div className="text-xl font-extrabold">{tc}</div>
            <div className="text-xs text-slate-500">copias guardadas</div>
          </div>
        </div>
      )}
      {note && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">{note}</p>}
      <ul className="space-y-3">
        {list.map((l) => (
          <li key={l.id} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
            <div className="flex items-start justify-between gap-2">
              <b className="min-w-0 break-words">{l.exams?.title ?? 'Simulacro'}</b>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold ${l.is_active ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                {l.is_active ? 'Activo' : 'Desactivado'}
              </span>
            </div>
            <p className="break-all text-xs text-slate-500">{linkFor(l.short_id)}</p>
            <div className="flex gap-4 text-sm">
              <span>👁 <b>{l.views}</b> {l.views === 1 ? 'vez abierto' : 'veces abierto'}</span>
              <span>💾 <b>{l.copies}</b> {l.copies === 1 ? 'copia' : 'copias'}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => copy(l)} className="rounded-xl border-2 border-slate-300 py-2 text-sm font-bold dark:border-slate-600">
                {copied === l.id ? '✓ Copiado' : 'Copiar enlace'}
              </button>
              <button
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(l)}
                className={`rounded-xl border-2 py-2 text-sm font-bold disabled:opacity-50 ${l.is_active ? 'border-red-300 text-red-600' : 'border-green-400 text-green-700'}`}
              >
                {l.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {toggle.isError && <p className="text-xs text-red-500">{(toggle.error as Error).message}</p>}
    </div>
  );
}
