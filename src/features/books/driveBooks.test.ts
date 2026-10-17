// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/drive', () => ({
  DriveError: class DriveError extends Error {
    code = 'other';
  },
  driveContext: async () => ({ token: 'tok', folder: 'FOLDER' }),
  forgetToken: vi.fn(),
}));

import { bookKey, deleteCloudBook, downloadCloudBook, fileNameFor, getRemoteProgress, listCloudBooks, pickProgress, pushRemoteProgress, uploadBookToDrive } from './driveBooks';

/** Un Drive de mentira: guarda archivos en memoria y responde como la API de Google. */
interface F {
  id: string;
  name: string;
  parents: string[];
  appProperties: Record<string, string>;
  blob: Blob;
}
let files: F[] = [];
let calls: { method: string; url: string }[] = [];
let n = 0;

function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = String(input);
  const method = init.method ?? 'GET';
  calls.push({ method, url });
  const json = (o: unknown, status = 200, headers: Record<string, string> = {}) => Promise.resolve(new Response(JSON.stringify(o), { status, headers }));
  const idOf = (u: string) => decodeURIComponent(u.split('/files/')[1].split('?')[0]);

  if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
    if (url.includes('uploadType=resumable')) {
      const meta = JSON.parse(String(init.body));
      files.push({ id: `id${++n}`, name: meta.name, parents: meta.parents, appProperties: meta.appProperties, blob: new Blob() });
      return Promise.resolve(new Response('{}', { headers: { Location: `https://upload.example/session/id${n}` } }));
    }
    return (async () => {
      const text = await (init.body as Blob).text();
      const meta = JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]);
      files.push({ id: `id${++n}`, name: meta.name, parents: meta.parents, appProperties: meta.appProperties, blob: init.body as Blob });
      return json({ id: `id${n}` });
    })();
  }
  if (url.startsWith('https://upload.example/session/')) {
    const f = files.find((x) => x.id === url.split('/').pop())!;
    f.blob = init.body as Blob;
    return json({ id: f.id });
  }
  if (method === 'GET' && url.includes('?q=')) {
    const out = files.filter((f) => f.parents.includes('FOLDER') && f.appProperties.sp === 'book');
    return json({ files: out.map((f) => ({ id: f.id, name: f.name, size: String(f.blob.size), appProperties: f.appProperties })) });
  }
  if (method === 'GET' && url.includes('alt=media')) return Promise.resolve(new Response(files.find((f) => f.id === idOf(url))!.blob));
  if (method === 'GET' && url.includes('fields=appProperties')) return json({ appProperties: files.find((f) => f.id === idOf(url))!.appProperties });
  if (method === 'PATCH') {
    const f = files.find((x) => x.id === idOf(url))!;
    f.appProperties = { ...f.appProperties, ...JSON.parse(String(init.body)).appProperties };
    return json({ id: f.id });
  }
  if (method === 'DELETE') {
    files = files.filter((f) => f.id !== idOf(url));
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return json({ error: 'sin ruta' }, 404);
}

beforeEach(() => {
  files = [];
  calls = [];
  n = 0;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const epub = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'application/epub+zip' });

describe('identificador y nombre', () => {
  it('bookKey es estable y corto; fileNameFor limpia caracteres que Drive no quiere', async () => {
    const a = await bookKey('mary and her family|ana pérez');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await bookKey('mary and her family|ana pérez')).toBe(a);
    expect(await bookKey('otro|')).not.toBe(a);
    expect(fileNameFor('Mary: "and" her/family?')).toBe('Mary and her family.epub');
    expect(fileNameFor('   ')).toBe('Libro.epub');
  });
});

describe('subir y listar', () => {
  it('sube un EPUB pequeño de una vez y aparece en la lista con su nombre y tamaño', async () => {
    const id = await uploadBookToDrive(epub(1000), 'abc123', 'Mary and her family');
    expect(id).toBe('id1');
    expect(calls.some((c) => c.url.includes('uploadType=multipart'))).toBe(true);
    const list = await listCloudBooks();
    expect(list).toEqual([{ id: 'id1', title: 'Mary and her family', size: expect.any(Number), bid: 'abc123', progress: null }]);
    expect(list[0].size).toBeGreaterThan(1000);
  });

  it('un EPUB grande se sube en dos pasos y llega completo', async () => {
    const big = epub(5 * 1024 * 1024);
    const id = await uploadBookToDrive(big, 'big1', 'Big book');
    expect(calls.some((c) => c.url.includes('uploadType=resumable'))).toBe(true);
    expect(calls.some((c) => c.method === 'PUT')).toBe(true);
    expect((await downloadCloudBook(id)).size).toBe(big.size);
  });

  it('el mismo libro no se duplica en Drive', async () => {
    const a = await uploadBookToDrive(epub(500), 'same', 'Libro');
    const b = await uploadBookToDrive(epub(500), 'same', 'Libro');
    expect(b).toBe(a);
    expect(files).toHaveLength(1);
  });

  it('solo lista los libros de la app, no otros archivos de la carpeta', async () => {
    files.push({ id: 'img', name: 'img-1.jpg', parents: ['FOLDER'], appProperties: {}, blob: new Blob(['x']) });
    await uploadBookToDrive(epub(300), 'k1', 'Uno');
    expect((await listCloudBooks()).map((b) => b.title)).toEqual(['Uno']);
  });

  it('subir con progreso lo deja guardado en el archivo', async () => {
    const id = await uploadBookToDrive(epub(300), 'k2', 'Dos', { chapter: 3, scroll: 0.25 });
    expect(await getRemoteProgress(id)).toMatchObject({ chapter: 3, scroll: 0.25 });
  });

  it('borrar quita el libro de Drive', async () => {
    const id = await uploadBookToDrive(epub(300), 'k3', 'Tres');
    await deleteCloudBook(id);
    expect(await listCloudBooks()).toEqual([]);
  });
});

describe('progreso', () => {
  it('pickProgress elige el más reciente (o el que exista)', () => {
    const a = { chapter: 1, scroll: 0.1, updatedAt: 100 };
    const b = { chapter: 4, scroll: 0.9, updatedAt: 200 };
    expect(pickProgress(a, b)).toBe(b);
    expect(pickProgress(b, a)).toBe(b);
    expect(pickProgress(null, a)).toBe(a);
    expect(pickProgress(a, null)).toBe(a);
    expect(pickProgress(null, null)).toBeNull();
  });

  it('un valor guardado dañado no rompe la lectura', async () => {
    files.push({ id: 'x', name: 'x.epub', parents: ['FOLDER'], appProperties: { sp: 'book', bid: 'b', ch: 'abc', sc: 'z', ts: '1' }, blob: new Blob(['x']) });
    expect((await listCloudBooks())[0].progress).toBeNull();
  });

  it('pushRemoteProgress envía de inmediato con now y agrupa los envíos seguidos', async () => {
    vi.useFakeTimers();
    const id = await uploadBookToDrive(epub(300), 'k4', 'Cuatro');
    calls = [];
    pushRemoteProgress(id, 2, 0.5, { now: true });
    await vi.advanceTimersByTimeAsync(0);
    expect((await getRemoteProgress(id))?.chapter).toBe(2);

    calls = [];
    pushRemoteProgress(id, 2, 0.6); // justo después de enviar: espera
    pushRemoteProgress(id, 2, 0.7);
    pushRemoteProgress(id, 3, 0.1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(await getRemoteProgress(id)).toMatchObject({ chapter: 3, scroll: 0.1 });
  });
});
