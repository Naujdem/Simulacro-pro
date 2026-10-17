import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '@/components/Icon';
import { connectDrive, driveConnected } from '@/lib/drive';
import { parseEpub } from './epub';
import { bookKey, deleteCloudBook, downloadCloudBook, listCloudBooks, pickProgress, uploadBookToDrive, type CloudBook } from './driveBooks';
import { getBookFile, listBooks, listProgress, removeBook, requestPersistence, saveBook, setDriveId, type BookMeta, type Progress } from './store';

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

/** off = aún no conectaste Drive · error = no se pudo consultar (¿sin conexión?) */
type DriveState = 'checking' | 'on' | 'off' | 'error';

/** Sección Libros: agrega EPUB (se guardan en este dispositivo y en tu Google Drive) y ábrelos para leer. */
export default function BooksPage() {
  const nav = useNavigate();
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [bids, setBids] = useState<Map<string, string>>(new Map()); // id local → identificador estable
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [drive, setDrive] = useState<DriveState>('checking');
  const [cloud, setCloud] = useState<CloudBook[]>([]);
  const [working, setWorking] = useState<Set<string>>(new Set()); // libros subiendo o bajando
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const list = await listBooks();
      setBooks(list);
      setBids(new Map(await Promise.all(list.map(async (b) => [b.id, await bookKey(b.id)] as const))));
    } catch (e) {
      setBooks([]);
      setError((e as Error).message);
    }
    listProgress()
      .then(setProgress)
      .catch(() => {});
  }, []);

  const refreshCloud = useCallback(async () => {
    try {
      setCloud(await listCloudBooks());
    } catch (e) {
      setError(`No se pudo leer tu Google Drive: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    refresh();
    driveConnected()
      .then((ok) => {
        setDrive(ok ? 'on' : 'off');
        if (ok) refreshCloud();
      })
      .catch(() => setDrive('error'));
  }, [refresh, refreshCloud]);

  // Un libro que ya está en tu Drive y en este dispositivo queda enlazado (así se sincroniza el progreso)
  useEffect(() => {
    if (!books || !cloud.length) return;
    let changed = false;
    Promise.all(
      books.map(async (b) => {
        const c = cloud.find((x) => x.bid && x.bid === bids.get(b.id));
        if (c && b.driveId !== c.id) {
          await setDriveId(b.id, c.id);
          changed = true;
        }
      }),
    )
      .then(() => {
        if (changed) refresh();
      })
      .catch(() => {});
  }, [books, cloud, bids, refresh]);

  const mark = (id: string, on: boolean) =>
    setWorking((w) => {
      const n = new Set(w);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  async function connect() {
    setError('');
    try {
      await connectDrive();
      setDrive('on');
      setMsg('✅ Google Drive conectado. Tus libros nuevos se guardarán también allí.');
      refreshCloud();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Sube un libro de este dispositivo a tu Drive y lo enlaza. */
  async function toDrive(meta: BookMeta, file?: Blob) {
    const blob = file ?? (await getBookFile(meta.id));
    if (!blob) throw new Error('No encontré el archivo del libro en este dispositivo.');
    const p = progress.get(meta.id);
    const id = await uploadBookToDrive(blob, await bookKey(meta.id), meta.title, p ? { chapter: p.chapter, scroll: p.scroll } : undefined);
    await setDriveId(meta.id, id);
  }

  async function uploadOne(b: BookMeta) {
    setError('');
    mark(b.id, true);
    try {
      await toDrive(b);
      setMsg(`✅ «${b.title}» guardado en tu Drive`);
      refresh();
      refreshCloud();
    } catch (e) {
      setError(`No se pudo subir «${b.title}» a Drive: ${(e as Error).message}`);
    } finally {
      mark(b.id, false);
    }
  }

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
        const meta = await saveBook(book, f);
        done.push(book.title);
        if (drive === 'on') {
          try {
            setMsg(`Guardando «${book.title}» en tu Drive…`);
            await toDrive(meta, f);
          } catch (err) {
            problems.push(`«${book.title}» quedó en este dispositivo, pero no se pudo subir a Drive: ${(err as Error).message}`);
          }
        }
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
    if (drive === 'on') refreshCloud();
  }

  async function download(c: CloudBook) {
    setError('');
    mark(c.id, true);
    try {
      const blob = await downloadCloudBook(c.id);
      const book = await parseEpub(blob);
      const meta = await saveBook(book, blob, c.id);
      requestPersistence();
      nav(`/books/${encodeURIComponent(meta.id)}`);
    } catch (e) {
      setError(`No se pudo descargar «${c.title}»: ${(e as Error).message}`);
      mark(c.id, false);
    }
  }

  async function remove(b: BookMeta) {
    if (!window.confirm(`¿Quitar «${b.title}» de este dispositivo?`)) return;
    try {
      await removeBook(b.id);
      if (b.driveId && window.confirm(`¿Borrar también la copia de «${b.title}» en tu Google Drive?\n\nAceptar: borrarla de Drive.\nCancelar: dejarla en Drive (podrás volver a descargarla).`)) {
        await deleteCloudBook(b.driveId);
      }
    } catch (err) {
      setError((err as Error).message);
    }
    refresh();
    if (drive === 'on') refreshCloud();
  }

  async function removeCloud(c: CloudBook) {
    if (!window.confirm(`¿Borrar «${c.title}» de tu Google Drive? No se puede deshacer.`)) return;
    try {
      await deleteCloudBook(c.id);
      refreshCloud();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Libros que están en tu Drive pero no en este dispositivo
  const localBids = new Set(bids.values());
  const localDriveIds = new Set((books ?? []).map((b) => b.driveId).filter(Boolean));
  const cloudOnly = cloud.filter((c) => !localDriveIds.has(c.id) && !(c.bid && localBids.has(c.bid)));

  const where = (b: BookMeta) => {
    const p = pickProgress(progress.get(b.id) ?? null, cloud.find((c) => c.id === b.driveId)?.progress ?? null);
    return p ? `Vas en el capítulo ${Math.min(p.chapter + 1, b.chapterCount)} de ${b.chapterCount}` : '';
  };

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Libros</h1>
      <p className="text-sm text-slate-500">
        Agrega libros en formato <b>EPUB</b> (sin protección DRM) y léelos aquí. Toca cualquier palabra para traducirla, ver el diccionario y guardarla en Vocabulario.
      </p>

      {drive === 'off' && (
        <div className="card space-y-2 p-4">
          <p className="text-sm">
            ☁ <b>Guarda tus libros en tu Google Drive</b> para leerlos en cualquier dispositivo y no perder dónde ibas. Van a la carpeta «SimulaPro».
          </p>
          <button onClick={connect} className="btn-secondary w-full">
            Conectar Google Drive
          </button>
        </div>
      )}
      {drive === 'error' && <p className="text-xs text-slate-500">No se pudo consultar Google Drive (¿sin conexión?). Tus libros del dispositivo se pueden leer igual.</p>}

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
      {books?.length === 0 && cloudOnly.length === 0 && !busy && <p className="card p-6 text-center text-sm text-slate-500">Aún no tienes libros. Agrega tu primer EPUB con el botón de arriba.</p>}

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
                {where(b) && <p className="mt-0.5 text-xs font-bold text-sky-600 dark:text-sky-400">{where(b)}</p>}
                <p className="mt-0.5 text-xs text-slate-500">{b.driveId ? '☁ En tu Drive' : drive === 'on' ? 'Solo en este dispositivo' : ''}</p>
              </div>
            </Link>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {drive === 'on' && !b.driveId && (
                <button onClick={() => uploadOne(b)} disabled={working.has(b.id)} className="btn-ghost px-2 text-xs">
                  {working.has(b.id) ? 'Subiendo…' : '☁ Subir'}
                </button>
              )}
              <button onClick={() => remove(b)} aria-label={`Quitar ${b.title}`} className="btn-ghost px-2">
                <Icon name="trash" size={20} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {cloudOnly.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">En tu Drive (aún no están en este dispositivo)</h2>
          <ul className="space-y-3">
            {cloudOnly.map((c) => (
              <li key={c.id} className="card flex items-center gap-3 p-3">
                <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400 dark:bg-slate-700">
                  <Icon name="library" size={28} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-bold leading-snug">{c.title}</p>
                  <p className="mt-1 text-xs text-slate-500">☁ {c.size ? fmtMB(c.size) : 'En Drive'}</p>
                  {c.progress && <p className="mt-0.5 text-xs font-bold text-sky-600 dark:text-sky-400">Vas en el capítulo {c.progress.chapter + 1}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button onClick={() => download(c)} disabled={working.has(c.id)} className="btn-secondary px-3 text-sm">
                    {working.has(c.id) ? 'Descargando…' : '⬇ Leer'}
                  </button>
                  <button onClick={() => removeCloud(c)} aria-label={`Borrar ${c.title} de Drive`} className="btn-ghost px-2">
                    <Icon name="trash" size={20} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
