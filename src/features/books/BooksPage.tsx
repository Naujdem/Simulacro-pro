import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/Icon';
import { parseEpub } from './epub';
import { listBooks, listProgress, removeBook, requestPersistence, saveBook, type BookMeta, type Progress } from './store';

/** Portada guardada en el dispositivo (o un cuadro con el ícono si el libro no trae). */
function Cover({ blob, title }: { blob: Blob | null; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? (
    <img src={url} alt={`Portada de ${title}`} className="h-24 w-16 shrink-0 rounded-md object-cover shadow" />
  ) : (
    <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-500 dark:bg-slate-700">
      <Icon name="library" size={28} />
    </div>
  );
}

const fmtMB = (b: number) => `${(b / 1_000_000).toFixed(1)} MB`;

/** Sección Libros: agregar libros EPUB (se guardan en este dispositivo) y abrirlos para leer. */
export default function BooksPage() {
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    listBooks()
      .then(setBooks)
      .catch((e: Error) => {
        setBooks([]);
        setError(e.message);
      });
    listProgress()
      .then(setProgress)
      .catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    const done: string[] = [];
    const problems: string[] = [];
    for (const f of files) {
      try {
        setMsg(`Leyendo «${f.name}»…`);
        const book = await parseEpub(f);
        await saveBook(book, f);
        done.push(book.title);
      } catch (err) {
        problems.push(`«${f.name}»: ${(err as Error).message}`);
      }
    }
    if (done.length) {
      requestPersistence();
      setMsg(`✅ Agregado: ${done.join(', ')}`);
    } else setMsg('');
    if (problems.length) setError(problems.join('\n'));
    setBusy(false);
    refresh();
  }

  async function remove(b: BookMeta) {
    if (!window.confirm(`¿Quitar «${b.title}» de este dispositivo?`)) return;
    try {
      await removeBook(b.id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Libros</h1>
      <p className="text-sm text-slate-500">
        Agrega libros en formato <b>EPUB</b> (sin protección DRM) y léelos aquí. Toca cualquier palabra para traducirla, ver el diccionario y guardarla en Vocabulario. Los
        libros se guardan solo en este dispositivo.
      </p>

      <label className={`btn-primary block w-full cursor-pointer text-center ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        {busy ? 'Agregando…' : '➕ Agregar libro (.epub)'}
        <input type="file" multiple accept=".epub,application/epub+zip" onChange={onFiles} className="hidden" disabled={busy} />
      </label>
      {msg && (
        <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="whitespace-pre-line text-sm font-bold text-red-600">
          {error}
        </p>
      )}

      {books === null && <p className="text-sm text-slate-500">Cargando…</p>}
      {books?.length === 0 && !busy && <p className="card p-6 text-center text-sm text-slate-500">Aún no tienes libros. Agrega tu primer EPUB con el botón de arriba.</p>}

      <ul className="space-y-3">
        {books?.map((b) => (
          <li key={b.id} className="card flex items-center gap-3 p-3">
            <Link to={`/books/${encodeURIComponent(b.id)}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Cover blob={b.cover} title={b.title} />
              <div className="min-w-0">
                <p className="line-clamp-2 font-bold leading-snug">{b.title}</p>
                {b.author && <p className="truncate text-sm text-slate-500">{b.author}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  {b.chapterCount} capítulos · {b.wordCount.toLocaleString('es')} palabras · {fmtMB(b.size)}
                </p>
                {progress.get(b.id) && (
                  <p className="mt-0.5 text-xs font-bold text-sky-600 dark:text-sky-400">
                    Vas en el capítulo {Math.min(progress.get(b.id)!.chapter + 1, b.chapterCount)} de {b.chapterCount}
                  </p>
                )}
              </div>
            </Link>
            <button onClick={() => remove(b)} aria-label={`Quitar ${b.title}`} className="btn-ghost shrink-0 px-2">
              <Icon name="trash" size={20} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
