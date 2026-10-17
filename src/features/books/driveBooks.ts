import { DriveError, driveContext, forgetToken } from '@/lib/drive';

/*
 * Libros en tu Google Drive (carpeta «SimulaPro»). Cada EPUB es un archivo normal de Drive, y dónde vas leyendo viaja
 * como propiedades del mismo archivo (appProperties): no hace falta ninguna tabla en Supabase.
 * La app solo ve los archivos que ella misma subió (permiso drive.file).
 */

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const EPUB_MIME = 'application/epub+zip';
const RESUMABLE_OVER = 4 * 1024 * 1024; // más grande que esto se sube en dos pasos (más seguro con conexiones lentas)
const PUSH_EVERY_MS = 10_000;

export interface RemoteProgress {
  chapter: number;
  scroll: number;
  updatedAt: number;
}

export interface CloudBook {
  /** Id del archivo en Drive. */
  id: string;
  /** Nombre del archivo sin «.epub». */
  title: string;
  size: number;
  /** Identificador estable del libro (ver bookKey). */
  bid: string;
  progress: RemoteProgress | null;
}

/** Identificador corto y estable de un libro: igual en todos los dispositivos para el mismo título y autor. */
export async function bookKey(localId: string): Promise<string> {
  const bytes = new TextEncoder().encode(localId);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Nombre de archivo seguro para Drive, a partir del título. */
export const fileNameFor = (title: string) => `${title.replace(/[\\/:*?"<>|%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Libro'}.epub`;

type Props = Record<string, string> | undefined;

function readProgress(p: Props): RemoteProgress | null {
  if (!p || p.ch === undefined) return null;
  const chapter = Number(p.ch);
  const scroll = Number(p.sc ?? 0);
  const updatedAt = Number(p.ts ?? 0);
  if (!Number.isFinite(chapter) || chapter < 0) return null;
  return { chapter, scroll: Number.isFinite(scroll) ? Math.min(1, Math.max(0, scroll)) : 0, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
}

const progressProps = (chapter: number, scroll: number): Record<string, string> => ({
  ch: String(chapter),
  sc: scroll.toFixed(4),
  ts: String(Date.now()),
});

/** De dos lugares donde ibas, el más reciente. */
export function pickProgress<T extends { updatedAt: number }>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

/** Llamada a Drive con el permiso del usuario; si Google responde 401 se pide un token nuevo la próxima vez. */
async function call(url: string, init: RequestInit & { token: string }, what: string): Promise<Response> {
  const { token, ...rest } = init;
  let r: Response;
  try {
    r = await fetch(url, { ...rest, headers: { ...(rest.headers ?? {}), Authorization: `Bearer ${token}` } });
  } catch {
    throw new DriveError('other', 'Sin conexión con Google Drive.');
  }
  if (r.status === 401) forgetToken();
  if (!r.ok) throw new DriveError('other', `Drive respondió ${r.status} al ${what}.`);
  return r;
}

export async function listCloudBooks(): Promise<CloudBook[]> {
  const { token, folder } = await driveContext();
  const q = encodeURIComponent(`'${folder}' in parents and appProperties has { key='sp' and value='book' } and trashed=false`);
  const fields = encodeURIComponent('files(id,name,size,appProperties)');
  const r = await call(`${API}?q=${q}&fields=${fields}&pageSize=200&spaces=drive`, { token }, 'listar los libros');
  const data = (await r.json()) as { files?: { id: string; name: string; size?: string; appProperties?: Record<string, string> }[] };
  return (data.files ?? []).map((f) => ({
    id: f.id,
    title: f.name.replace(/\.epub$/i, ''),
    size: Number(f.size ?? 0),
    bid: f.appProperties?.bid ?? '',
    progress: readProgress(f.appProperties),
  }));
}

/** Sube el EPUB a tu Drive y devuelve el id del archivo. Si ese libro ya está en tu Drive, no lo duplica. */
export async function uploadBookToDrive(file: Blob, bid: string, title: string, progress?: { chapter: number; scroll: number }): Promise<string> {
  const existing = (await listCloudBooks()).find((b) => b.bid === bid);
  if (existing) return existing.id;

  const { token, folder } = await driveContext();
  const meta = {
    name: fileNameFor(title),
    mimeType: EPUB_MIME,
    parents: [folder],
    appProperties: { sp: 'book', bid, ...(progress ? progressProps(progress.chapter, progress.scroll) : {}) },
  };

  if (file.size > RESUMABLE_OVER) {
    // Paso 1: Drive entrega una dirección de subida. Paso 2: se envía el archivo a esa dirección.
    const start = await call(`${UPLOAD}?uploadType=resumable&fields=id`, {
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': EPUB_MIME, 'X-Upload-Content-Length': String(file.size) },
      body: JSON.stringify(meta),
    }, 'preparar la subida del libro');
    const where = start.headers.get('Location');
    if (!where) throw new DriveError('other', 'Drive no entregó la dirección de subida del libro.');
    const done = await call(where, { token, method: 'PUT', headers: { 'Content-Type': EPUB_MIME }, body: file }, 'subir el libro');
    return ((await done.json()) as { id: string }).id;
  }

  const boundary = `simulapro${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${EPUB_MIME}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);
  const r = await call(`${UPLOAD}?uploadType=multipart&fields=id`, { token, method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }, 'subir el libro');
  return ((await r.json()) as { id: string }).id;
}

export async function downloadCloudBook(driveId: string): Promise<Blob> {
  const { token } = await driveContext();
  const r = await call(`${API}/${encodeURIComponent(driveId)}?alt=media`, { token }, 'descargar el libro');
  return r.blob();
}

export async function getRemoteProgress(driveId: string): Promise<RemoteProgress | null> {
  const { token } = await driveContext();
  const r = await call(`${API}/${encodeURIComponent(driveId)}?fields=appProperties`, { token }, 'leer el progreso');
  return readProgress(((await r.json()) as { appProperties?: Record<string, string> }).appProperties);
}

export async function deleteCloudBook(driveId: string): Promise<void> {
  const { token } = await driveContext();
  const r = await fetch(`${API}/${encodeURIComponent(driveId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) forgetToken();
  if (!r.ok && r.status !== 404) throw new DriveError('other', `Drive respondió ${r.status} al borrar el libro.`);
}

/* ───────────── Guardar dónde vas (sin saturar a Drive) ───────────── */

const last = new Map<string, number>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

async function patchProgress(driveId: string, chapter: number, scroll: number, keepalive: boolean): Promise<void> {
  const { token } = await driveContext();
  last.set(driveId, Date.now());
  const r = await fetch(`${API}/${encodeURIComponent(driveId)}?fields=id`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ appProperties: progressProps(chapter, scroll) }),
    keepalive, // sigue enviándose aunque la página se cierre
  });
  if (r.status === 401) forgetToken();
}

/**
 * Guarda dónde vas en el archivo de Drive. Como mucho una vez cada 10 segundos (lo último que pase en ese rato se
 * envía al final); con `now` se envía ya (al cambiar de capítulo o al salir). Nunca lanza error: es secundario.
 */
export function pushRemoteProgress(driveId: string, chapter: number, scroll: number, opts: { now?: boolean } = {}): void {
  const send = (keepalive: boolean) => {
    clearTimeout(pending.get(driveId));
    pending.delete(driveId);
    patchProgress(driveId, chapter, scroll, keepalive).catch(() => {});
  };
  if (opts.now) return send(true);
  clearTimeout(pending.get(driveId));
  const wait = Math.max(0, PUSH_EVERY_MS - (Date.now() - (last.get(driveId) ?? 0)));
  pending.set(driveId, setTimeout(() => send(false), wait));
}
