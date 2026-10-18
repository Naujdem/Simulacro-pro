import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Cada prueba carga drive.ts de cero: el token y la carpeta guardados en memoria no se arrastran de una a otra.
let tokenCalls = 0;
vi.mock('./supabase', () => ({
  supabase: {
    functions: {
      invoke: async () => ({ data: { access_token: `tok${++tokenCalls}`, expires_in: 3600 }, error: null }),
    },
  },
}));

type Upload = { status: number; body?: unknown };
let uploadScript: Upload[] = [];
let uploadAuth: string[] = [];
let folderSearches = 0;
let folderCreations = 0;

function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = String(input);
  const json = (o: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(o), { status }));
  if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
    uploadAuth.push((init.headers as Record<string, string>).Authorization);
    const next = uploadScript.shift() ?? { status: 200 };
    return json(next.body ?? { id: `file${uploadAuth.length}` }, next.status);
  }
  if (init.method === 'POST') {
    folderCreations++;
    return json({ id: 'FOLDER' });
  }
  folderSearches++;
  return json({ files: [] });
}

async function load() {
  vi.resetModules();
  return import('./drive');
}

/** Deja correr los temporizadores (esperas de reintento) hasta que la promesa termine. */
async function settle<T>(p: Promise<T>): Promise<T> {
  const done = p.then(
    (v) => ({ ok: true as const, v }),
    (e) => ({ ok: false as const, e }),
  );
  for (let i = 0; i < 50; i++) await vi.advanceTimersByTimeAsync(1000);
  const r = await done;
  if (!r.ok) throw r.e;
  return r.v;
}

beforeEach(() => {
  vi.useFakeTimers();
  tokenCalls = 0;
  uploadScript = [];
  uploadAuth = [];
  folderSearches = 0;
  folderCreations = 0;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const audio = () => new Blob(['abc'], { type: 'audio/mpeg' });

describe('subida a Drive', () => {
  it('devuelve la referencia gd:<id>', async () => {
    const { uploadAudio } = await load();
    expect(await settle(uploadAudio(audio()))).toBe('gd:file1');
  });

  it('con varias subidas a la vez crea la carpeta una sola vez', async () => {
    const { uploadAudio } = await load();
    const refs = await settle(Promise.all(Array.from({ length: 8 }, () => uploadAudio(audio()))));
    expect(refs).toHaveLength(8);
    expect(folderSearches).toBe(1);
    expect(folderCreations).toBe(1);
  });

  it('reintenta ante un error 503 y termina bien', async () => {
    const { uploadAudio } = await load();
    uploadScript = [{ status: 503, body: {} }, { status: 503, body: {} }];
    expect(await settle(uploadAudio(audio()))).toBe('gd:file3');
    expect(uploadAuth).toHaveLength(3);
  });

  it('reintenta ante 429 (límite de velocidad)', async () => {
    const { uploadAudio } = await load();
    uploadScript = [{ status: 429, body: {} }];
    expect(await settle(uploadAudio(audio()))).toBe('gd:file2');
  });

  it('reintenta ante un 403 por límite de velocidad, pero no ante un 403 de permisos', async () => {
    const { uploadAudio } = await load();
    uploadScript = [{ status: 403, body: { error: { errors: [{ reason: 'userRateLimitExceeded' }] } } }];
    expect(await settle(uploadAudio(audio()))).toBe('gd:file2');

    uploadAuth = [];
    uploadScript = [{ status: 403, body: { error: { errors: [{ reason: 'forbidden' }] } } }];
    await expect(settle(uploadAudio(audio()))).rejects.toThrow('Drive respondió 403 al subir el audio.');
    expect(uploadAuth).toHaveLength(1);
  });

  it('reintenta si se corta la red', async () => {
    const { uploadAudio } = await load();
    const base = fakeFetch;
    let failed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (!failed && String(input).includes('/upload/')) {
          failed = true;
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return base(input, init);
      }),
    );
    expect(await settle(uploadAudio(audio()))).toBe('gd:file1');
  });

  it('si el permiso caducó (401) pide uno nuevo y vuelve a intentar una vez', async () => {
    const { uploadAudio } = await load();
    uploadScript = [{ status: 401, body: {} }];
    expect(await settle(uploadAudio(audio()))).toBe('gd:file2');
    expect(uploadAuth).toEqual(['Bearer tok1', 'Bearer tok2']);
  });

  it('un 401 que se repite no entra en bucle', async () => {
    const { uploadAudio } = await load();
    uploadScript = [{ status: 401, body: {} }, { status: 401, body: {} }, { status: 401, body: {} }];
    await expect(settle(uploadAudio(audio()))).rejects.toThrow('Drive respondió 401 al subir el audio.');
    expect(uploadAuth).toHaveLength(2);
  });

  it('se rinde tras 4 intentos con un mensaje claro', async () => {
    const { uploadAudio } = await load();
    uploadScript = Array.from({ length: 10 }, () => ({ status: 500, body: {} }));
    await expect(settle(uploadAudio(audio()))).rejects.toThrow('Drive respondió 500 al subir el audio.');
    expect(uploadAuth).toHaveLength(4);
  });

  it('un error que no se arregla reintentando (404) falla enseguida', async () => {
    const { uploadAudio } = await load();
    uploadScript = [{ status: 404, body: {} }];
    await expect(settle(uploadAudio(audio()))).rejects.toThrow('Drive respondió 404 al subir el audio.');
    expect(uploadAuth).toHaveLength(1);
  });
});

describe('shrinkImage', () => {
  const bitmap = (w: number, h: number) => ({ width: w, height: h, close: vi.fn() });

  it('con keepSmallJpeg devuelve tal cual un JPEG pequeño', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap(800, 600)));
    const { shrinkImage } = await load();
    const file = new Blob([new Uint8Array(50_000)], { type: 'image/jpeg' });
    expect(await shrinkImage(file, { keepSmallJpeg: true })).toBe(file);
  });

  it('sin keepSmallJpeg sigue recomprimiendo (comportamiento de siempre)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap(800, 600)));
    const { shrinkImage } = await load();
    const file = new Blob([new Uint8Array(50_000)], { type: 'image/jpeg' });
    // En el entorno de pruebas no hay <canvas>: llegar a usarlo prueba que no se saltó el recompresionado.
    await expect(shrinkImage(file)).rejects.toThrow();
  });

  it('un JPEG más grande que 1024 px o muy pesado también se recomprime', async () => {
    const { shrinkImage } = await load();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap(3000, 2000)));
    await expect(shrinkImage(new Blob([new Uint8Array(50_000)], { type: 'image/jpeg' }), { keepSmallJpeg: true })).rejects.toThrow();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap(800, 600)));
    await expect(shrinkImage(new Blob([new Uint8Array(400_000)], { type: 'image/jpeg' }), { keepSmallJpeg: true })).rejects.toThrow();
  });

  it('un PNG pequeño también se convierte a JPEG (así conserva el fondo blanco)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap(100, 100)));
    const { shrinkImage } = await load();
    await expect(shrinkImage(new Blob([new Uint8Array(1000)], { type: 'image/png' }), { keepSmallJpeg: true })).rejects.toThrow();
  });
});
