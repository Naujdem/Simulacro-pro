import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  folderLinkFor,
  linkFor,
  listFolderLinks,
  listLinks,
  setFolderLinkActive,
  setLinkActive,
  type MediaResult,
  type SharedFolderLink,
  type SharedLink,
} from './api';

/** Una fila de la lista: un simulacro o una biblioteca compartidos. */
interface Row {
  key: string;
  kind: 'exam' | 'folder';
  title: string;
  url: string;
  views: number;
  copies: number;
  is_active: boolean;
  created_at: string;
  raw: SharedLink | SharedFolderLink;
}

const examRow = (l: SharedLink): Row => ({
  key: `e-${l.id}`, kind: 'exam', title: l.exams?.title ?? 'Simulacro', url: linkFor(l.short_id),
  views: l.views, copies: l.copies, is_active: l.is_active, created_at: l.created_at, raw: l,
});
const folderRow = (l: SharedFolderLink): Row => ({
  key: `f-${l.id}`, kind: 'folder', title: l.folders?.name ?? 'Biblioteca', url: folderLinkFor(l.short_id),
  views: l.views, copies: l.copies, is_active: l.is_active, created_at: l.created_at, raw: l,
});

/** Estadísticas del creador: cuántas veces se abrió cada enlace (de simulacros y de bibliotecas), cuántas copias se guardaron y botón para desactivarlo. */
export default function SharedLinksPage() {
  const qc = useQueryClient();
  const links = useQuery({ queryKey: ['shared-links'], queryFn: listLinks });
  const folderLinks = useQuery({ queryKey: ['shared-folder-links'], queryFn: listFolderLinks });
  const [copied, setCopied] = useState('');
  const [note, setNote] = useState('');

  const toggle = useMutation({
    mutationFn: (r: Row): Promise<MediaResult> =>
      r.kind === 'folder'
        ? setFolderLinkActive(r.raw as SharedFolderLink, !r.is_active)
        : setLinkActive(r.raw as SharedLink, !r.is_active),
    onSuccess: (res, r) => {
      setNote(
        !r.is_active && res.status === 'nodrive'
          ? 'Enlace activado. Conecta tu Drive (botón Compartir) para que se vean sus imágenes y audios.'
          : '',
      );
      qc.invalidateQueries({ queryKey: [r.kind === 'folder' ? 'shared-folder-links' : 'shared-links'] });
    },
  });

  const copy = async (r: Row) => {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopied(r.key);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* el enlace se puede seleccionar a mano */
    }
  };

  const list = [...(links.data ?? []).map(examRow), ...(folderLinks.data ?? []).map(folderRow)].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const loading = links.isLoading || folderLinks.isLoading;
  const loaded = links.data && folderLinks.data;
  const tv = list.reduce((a, l) => a + l.views, 0);
  const tc = list.reduce((a, l) => a + l.copies, 0);
  const err = (links.error ?? folderLinks.error) as Error | null;

  return (
    <div className="space-y-4 p-4">
      <Link to="/stats" className="text-sm font-bold text-sky-500">← Progreso</Link>
      <h1 className="text-2xl font-extrabold">Compartidos</h1>
      {loading && <p className="text-sm text-slate-500">Cargando…</p>}
      {err && <p className="text-sm text-red-500">{err.message}</p>}
      {loaded && !list.length && (
        <p className="text-sm text-slate-500">Aún no compartes nada. Abre un simulacro o una biblioteca y pulsa «🔗 Compartir».</p>
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
          <li key={l.key} className="space-y-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
            <div className="flex items-start justify-between gap-2">
              <b className="min-w-0 break-words">
                <span aria-hidden="true">{l.kind === 'folder' ? '📁 ' : '📝 '}</span>
                {l.title}
                <span className="ml-1.5 text-xs font-normal text-slate-500">{l.kind === 'folder' ? 'Biblioteca' : 'Simulacro'}</span>
              </b>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold ${l.is_active ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                {l.is_active ? 'Activo' : 'Desactivado'}
              </span>
            </div>
            <p className="break-all text-xs text-slate-500">{l.url}</p>
            <div className="flex gap-4 text-sm">
              <span>👁 <b>{l.views}</b> {l.views === 1 ? 'vez abierto' : 'veces abierto'}</span>
              <span>💾 <b>{l.copies}</b> {l.copies === 1 ? 'copia' : 'copias'}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => copy(l)} className="rounded-xl border-2 border-slate-300 py-2 text-sm font-bold dark:border-slate-600">
                {copied === l.key ? '✓ Copiado' : 'Copiar enlace'}
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
