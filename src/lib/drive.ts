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

async function ensureFolder(token: string): Promise<string> {
  if (folderId) return folderId;
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

// Reduce la imagen (máx. 1024 px, JPEG) para que ocupe poco en tu Drive y cargue rápido.
export async function shrinkImage(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
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

// Sube la imagen (ya reducida) y devuelve la referencia "gd:<id>".
export async function uploadImage(file: Blob): Promise<string> {
  const blob = await shrinkImage(file);
  const token = await getToken();
  const parent = await ensureFolder(token);
  const boundary = `simulapro${Date.now()}`;
  const meta = { name: `img-${Date.now()}.jpg`, mimeType: 'image/jpeg', parents: [parent] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (r.status === 401) cached = null;
  if (!r.ok) throw new DriveError('other', `Drive respondió ${r.status} al subir la imagen.`);
  return makeRef(((await r.json()) as { id: string }).id);
}

// Descarga la imagen con tu permiso y devuelve una URL local (se guarda en memoria para no repetir).
const urlCache = new Map<string, Promise<string>>();

export function imageUrlFor(ref: string): Promise<string> {
  if (/^https?:\/\//.test(ref)) return Promise.resolve(ref);
  const id = driveIdOf(ref);
  if (!id) return Promise.reject(new Error('referencia inválida'));
  let p = urlCache.get(id);
  if (!p) {
    p = (async () => {
      const token = await getToken();
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Drive ${r.status}`);
      return URL.createObjectURL(await r.blob());
    })();
    urlCache.set(id, p);
    p.catch(() => urlCache.delete(id)); // si falla, se puede reintentar después
  }
  return p;
}
