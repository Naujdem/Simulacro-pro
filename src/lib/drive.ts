import { supabase } from './supabase';

// Subida de imágenes a TU Google Drive (carpeta "SimulaPro").
// En la base de datos solo se guarda una referencia corta: "gd:<id del archivo>".
// El permiso permanente de Google lo guarda la Edge Function "drive-token" (nunca el navegador).

const GCLIENT = '1051206554875-tmlvl2prc4vhppl81vkrs3pd3ikoieuv.apps.googleusercontent.com';
const GSCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'SimulaPro';
const MAX_SIDE = 1024;
const QUALITY = 0.8;

export type DriveErrorCode = 'noconnect' | 'reconnect' | 'other';

export class DriveError extends Error {
  code: DriveErrorCode;
  constructor(code: DriveErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/* ───────────── Referencias gd:<id> ───────────── */

export const makeRef = (fileId: string) => `gd:${fileId}`;
export const driveIdOf = (ref: string | null | undefined): string | null =>
  ref && ref.startsWith('gd:') ? ref.slice(3) : null;

/* ───────────── Google Identity Services ───────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type G = any;
let gisPromise: Promise<void> | null = null;

// Cargar el script antes del clic evita que el navegador bloquee la ventana emergente.
export function preloadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    if ((window as G).google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new DriveError('other', 'No se pudo cargar Google. Revisa tu conexión.'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function requestCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const g = (window as G).google;
    if (!g?.accounts?.oauth2) {
      reject(new DriveError('other', 'Google aún no cargó. Intenta de nuevo en unos segundos.'));
      return;
    }
    const client = g.accounts.oauth2.initCodeClient({
      client_id: GCLIENT,
      scope: GSCOPE,
      ux_mode: 'popup',
      prompt: 'consent',
      callback: (resp: { code?: string; error?: string }) => {
        if (resp.code) resolve(resp.code);
        else reject(new DriveError('other', 'No se concedió el permiso de Google Drive.'));
      },
      error_callback: () => reject(new DriveError('other', 'Se cerró la ventana de Google o fue bloqueada.')),
    });
    client.requestCode();
  });
}

/* ───────────── Token de acceso (dura 1 hora) ───────────── */

interface TokenReply {
  access_token?: string;
  expires_in?: number;
  error?: string;
  message?: string;
}

let cached: { token: string; exp: number } | null = null;
let inflight: Promise<string> | null = null;

async function callFn(body: Record<string, unknown>): Promise<TokenReply> {
  const { data, error } = await supabase.functions.invoke('drive-token', { body });
  if (error) {
    throw new DriveError(
      'other',
      'No se pudo hablar con la función drive-token. Revisa que esté desplegada (y que "Verify JWT" no cause error 401).',
    );
  }
  return (data ?? {}) as TokenReply;
}

function keep(r: TokenReply): string {
  if (!r.access_token) throw new DriveError('other', r.message || 'Google no entregó el permiso.');
  cached = { token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 - 60_000 };
  return r.access_token;
}

// Pide un token. Si el usuario nunca conectó Drive (o revocó el permiso) lanza DriveError 'noconnect'/'reconnect'.
export function getToken(): Promise<string> {
  if (cached && cached.exp > Date.now()) return Promise.resolve(cached.token);
  if (inflight) return inflight;
  inflight = (async () => {
    const r = await callFn({ action: 'token' });
    if (r.error === 'noconnect' || r.error === 'reconnect') {
      cached = null;
      throw new DriveError(r.error, 'Falta conectar Google Drive.');
    }
    if (r.error) throw new DriveError('other', r.message || 'Error de Google Drive.');
    return keep(r);
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Olvida el token guardado (por ejemplo, cuando Google responde 401): el siguiente uso pide uno nuevo. */
export function forgetToken(): void {
  cached = null;
}

// Debe llamarse directamente desde un clic del usuario (abre la ventana de Google).
export async function connectDrive(): Promise<void> {
  await preloadGis();
  const code = await requestCode();
  const r = await callFn({ action: 'connect', code });
  if (r.error) throw new DriveError('other', r.message || 'No se pudo conectar Google Drive.');
  keep(r);
}

/* ───────────── Carpeta, subida y lectura ───────────── */

let folderId: string | null = null;
let folderPromise: Promise<string> | null = null;

// Varias subidas en paralelo comparten la misma búsqueda/creación de la carpeta (así no se crean carpetas duplicadas).
function ensureFolder(token: string): Promise<string> {
  if (folderId) return Promise.resolve(folderId);
  if (!folderPromise) {
    folderPromise = findOrCreateFolder(token).finally(() => {
      folderPromise = null;
    });
  }
  return folderPromise;
}

async function findOrCreateFolder(token: string): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` };
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const found = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`, {
    headers: auth,
  });
  if (!found.ok) throw new DriveError('other', `Drive respondió ${found.status} al buscar la carpeta.`);
  const list = (await found.json()) as { files?: { id: string }[] };
  if (list.files?.length) return (folderId = list.files[0].id);

  const made = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!made.ok) throw new DriveError('other', `Drive respondió ${made.status} al crear la carpeta.`);
  return (folderId = ((await made.json()) as { id: string }).id);
}

/** Token y carpeta «SimulaPro» del usuario (se crea si no existe), para otros módulos que guardan archivos en su Drive. */
export async function driveContext(): Promise<{ token: string; folder: string }> {
  const token = await getToken();
  return { token, folder: await ensureFolder(token) };
}

// Un JPEG que ya cabe en MAX_SIDE y pesa menos que esto no gana nada al recomprimirlo.
const KEEP_JPEG_BELOW = 300 * 1024;

export interface ShrinkOptions {
  /** Sube tal cual los JPEG que ya son pequeños (en px y en peso), sin volver a codificarlos. */
  keepSmallJpeg?: boolean;
}

// Reduce la imagen (máx. 1024 px, JPEG) para que ocupe poco en tu Drive y cargue rápido.
export async function shrinkImage(file: Blob, opts: ShrinkOptions = {}): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (opts.keepSmallJpeg && scale === 1 && file.type === 'image/jpeg' && file.size <= KEEP_JPEG_BELOW) {
    bmp.close?.();
    return file;
  }
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new DriveError('other', 'No se pudo procesar la imagen.'))),
      'image/jpeg',
      QUALITY,
    ),
  );
}

/* ───────────── Subida con reintentos ───────────── */

const MAX_TRIES = 4;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const backoff = (attempt: number) => Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 300;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Cuando Google pide frenar, todas las subidas en curso esperan juntas hasta esta hora.
let pauseUntil = 0;

async function isRateLimited(r: Response): Promise<boolean> {
  if (r.status === 429) return true;
  if (r.status !== 403) return false;
  try {
    return /rateLimitExceeded|userRateLimitExceeded/i.test(await r.clone().text());
  } catch {
    return false;
  }
}

/**
 * Sube un archivo a la carpeta SimulaPro y devuelve la referencia "gd:<id>".
 * Reintenta ante cortes de red, errores 5xx y límites de velocidad de Google, y renueva el permiso si caduca (401).
 */
async function uploadMultipart(blob: Blob, name: string, mime: string, what: string): Promise<string> {
  const boundary = `simulapro${uid()}`;
  let renewed = false;

  for (let attempt = 1; ; attempt++) {
    const wait = pauseUntil - Date.now();
    if (wait > 0) await sleep(wait);

    const token = await getToken();
    const parent = await ensureFolder(token);
    const meta = { name, mimeType: mime, parents: [parent] };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ]);

    let r: Response;
    try {
      r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
    } catch {
      if (attempt >= MAX_TRIES) throw new DriveError('other', `Sin conexión con Drive al subir ${what}.`);
      await sleep(backoff(attempt));
      continue;
    }

    if (r.ok) return makeRef(((await r.json()) as { id: string }).id);

    if (r.status === 401) {
      cached = null;
      if (!renewed) {
        renewed = true; // un solo intento más con un permiso nuevo
        continue;
      }
    } else if (attempt < MAX_TRIES) {
      if (await isRateLimited(r)) {
        pauseUntil = Math.max(pauseUntil, Date.now() + backoff(attempt));
        continue;
      }
      if (r.status >= 500) {
        await sleep(backoff(attempt));
        continue;
      }
    }
    throw new DriveError('other', `Drive respondió ${r.status} al subir ${what}.`);
  }
}

// Sube la imagen (ya reducida) y devuelve la referencia "gd:<id>".
export async function uploadImage(file: Blob, opts: ShrinkOptions = {}): Promise<string> {
  const blob = await shrinkImage(file, opts);
  return uploadMultipart(blob, `img-${uid()}.jpg`, 'image/jpeg', 'la imagen');
}

// Subir archivos de audio a Google Drive (en la carpeta "SimulaPro")
export async function uploadAudio(file: Blob): Promise<string> {
  const mime = file.type || 'audio/mpeg';
  return uploadMultipart(file, `audio-${uid()}.mp3`, mime, 'el audio');
}

// Descarga la imagen/audio con tu permiso y devuelve una URL local (se guarda en memoria para no repetir).
const urlCache = new Map<string, Promise<string>>();

export function imageUrlFor(ref: string): Promise<string> {
  if (/^https?:\/\//.test(ref)) return Promise.resolve(ref);
  const id = driveIdOf(ref);
  if (!id) return Promise.reject(new Error('referencia inválida'));
  let p = urlCache.get(id);
  if (!p) {
    p = (async () => {
      // Mirando un simulacro compartido: el archivo es del creador y se pide a su enlace (no hace falta tener Drive)
      if (shareContext) return URL.createObjectURL(await fetchSharedFile(shareContext, ref));
      const token = await getToken();
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Drive ${r.status}`);
      return URL.createObjectURL(await r.blob());
    })();
    urlCache.set(id, p);
    p.catch(() => urlCache.delete(id));
  }
  return p;
}

// Convertir una referencia gd:<id> a una URL blob jugable para <audio>
export function audioUrlFor(ref: string): Promise<string> {
  return imageUrlFor(ref);
}

/* ───────────── Simulacros compartidos por enlace ───────────── */

// Mientras se mira /s/<enlace>, las imágenes y audios se piden a la función "drive-public" con ese enlace.
let shareContext: string | null = null;
export function setShareContext(shortId: string | null): void {
  if (shareContext !== shortId) urlCache.clear(); // no mezclar archivos de enlaces distintos
  shareContext = shortId;
}

/** Descarga un archivo del creador a través de su enlace (la función del servidor comprueba que pertenezca a ese simulacro). */
export async function fetchSharedFile(shortId: string, ref: string): Promise<Blob> {
  const id = driveIdOf(ref);
  if (!id) throw new DriveError('other', 'referencia inválida');
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const { data } = await supabase.auth.getSession();
  let r: Response;
  try {
    r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-public`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${data.session?.access_token ?? key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ short_id: shortId, file_id: id }),
    });
  } catch {
    throw new DriveError('other', 'Sin conexión con el servidor de archivos.');
  }
  if (!r.ok) throw new DriveError('other', `No se pudo leer el archivo (${r.status}).`);
  const blob = await r.blob();
  if (!blob.size || blob.type.startsWith('text/')) throw new DriveError('other', 'El archivo no es accesible.');
  return blob;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
};

/** Sube un archivo tal cual (sin reducirlo) a la carpeta SimulaPro del usuario actual. */
async function uploadRaw(blob: Blob, prefix: string): Promise<string> {
  const token = await getToken();
  const parent = await ensureFolder(token);
  const mime = blob.type || 'application/octet-stream';
  const boundary = `simulapro${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const meta = { name: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${EXT[mime] ?? 'bin'}`, mimeType: mime, parents: [parent] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (r.status === 401) cached = null;
  if (!r.ok) throw new DriveError('other', `Drive respondió ${r.status} al subir el archivo.`);
  return makeRef(((await r.json()) as { id: string }).id);
}

/**
 * Copia un archivo (imagen o audio) del Drive del creador al Drive del usuario actual y devuelve la referencia nueva.
 * Se descarga con el enlace compartido (el creador deja sus archivos legibles por enlace al compartir) y se sube
 * con el permiso del usuario actual. `shortId` es el enlace del simulacro (por defecto, el que se está viendo).
 */
export async function copyDriveFile(oldRef: string, shortId: string | null = shareContext): Promise<string> {
  if (!shortId) throw new DriveError('other', 'Falta el enlace del simulacro.');
  const blob = await fetchSharedFile(shortId, oldRef);
  return uploadRaw(blob, blob.type.startsWith('audio/') ? 'audio' : 'img');
}

/** ¿Tiene el usuario actual su Drive conectado? (no abre ninguna ventana) */
export async function driveConnected(): Promise<boolean> {
  try {
    await getToken();
    return true;
  } catch (e) {
    if (e instanceof DriveError && (e.code === 'noconnect' || e.code === 'reconnect')) return false;
    throw e;
  }
}

/**
 * El creador deja sus archivos legibles (o ya no) por quien tenga el enlace. Es lo que permite copiarlos sin
 * pedirle nada al creador. Devuelve cuántos se pudieron cambiar y cuántos no.
 */
export async function setFilesPublic(refs: string[], on: boolean): Promise<{ done: number; failed: number }> {
  const token = await getToken();
  const auth = { Authorization: `Bearer ${token}` };
  let done = 0;
  let failed = 0;
  const one = async (ref: string) => {
    const id = driveIdOf(ref);
    if (!id) return;
    try {
      if (on) {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        });
        if (!r.ok) throw new Error(String(r.status));
      } else {
        const l = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions?fields=permissions(id,type)`, { headers: auth });
        if (!l.ok) throw new Error(String(l.status));
        const list = ((await l.json()) as { permissions?: { id: string; type: string }[] }).permissions ?? [];
        for (const perm of list.filter((x) => x.type === 'anyone')) {
          const d = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions/${perm.id}`, { method: 'DELETE', headers: auth });
          if (!d.ok && d.status !== 404) throw new Error(String(d.status));
        }
      }
      done++;
    } catch {
      failed++;
    }
  };
  for (let i = 0; i < refs.length; i += 4) await Promise.all(refs.slice(i, i + 4).map(one));
  return { done, failed };
}
