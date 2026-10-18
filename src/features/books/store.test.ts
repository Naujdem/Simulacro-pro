// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { ParsedBook } from './epub';
import { getActivities, getBook, getProgress, listBooks, listProgress, removeBook, saveActivities, saveBook, saveProgress } from './store';

const book = (title: string): ParsedBook => ({
  title,
  author: 'Ana',
  chapters: [
    { title: 'Uno', blocks: [{ t: 'p', text: 'Hello world' }] },
    { title: 'Dos', blocks: [{ t: 'p', text: 'Second chapter' }] },
  ],
  cover: null,
});
const file = new Blob(['epub'], { type: 'application/epub+zip' });

describe('libros en el dispositivo', () => {
  it('guarda, lista y abre un libro; el mismo libro no se duplica', async () => {
    const meta = await saveBook(book('Mary'), file);
    await saveBook(book('Mary'), file);
    expect((await listBooks()).map((b) => b.title)).toEqual(['Mary']);
    const got = await getBook(meta.id);
    expect(got?.chapters).toHaveLength(2);
    expect(got?.meta).toMatchObject({ chapterCount: 2, wordCount: 4 });
  });

  it('guarda el progreso, lo actualiza y lo borra junto con el libro', async () => {
    const meta = await saveBook(book('Progress book'), file);
    expect(await getProgress(meta.id)).toBeNull();
    await saveProgress(meta.id, 1, 0.42);
    await saveProgress(meta.id, 1, 5); // fuera de rango: se limita a 1
    expect(await getProgress(meta.id)).toMatchObject({ chapter: 1, scroll: 1 });
    expect((await listProgress()).get(meta.id)?.chapter).toBe(1);
    await removeBook(meta.id);
    expect(await getBook(meta.id)).toBeNull();
    expect(await getProgress(meta.id)).toBeNull();
  });
});

describe('actividades con IA', () => {
  const acts = { mcq: [{ question: 'Q?', options: ['a', 'b'], correct: 1, explanation: '' }], tf: [], vocab: [], speaking: [] };
  it('se guardan por capítulo y se borran junto con el libro (sin tocar los de otro libro)', async () => {
    const a = await saveBook(book('Libro A'), file);
    const b = await saveBook(book('Libro B'), file);
    expect(await getActivities(a.id, 0)).toBeNull();
    await saveActivities(a.id, 0, acts);
    await saveActivities(a.id, 1, acts);
    await saveActivities(b.id, 0, acts);
    expect(await getActivities(a.id, 1)).toEqual(acts);
    await removeBook(a.id);
    expect(await getActivities(a.id, 0)).toBeNull();
    expect(await getActivities(a.id, 1)).toBeNull();
    expect(await getActivities(b.id, 0)).toEqual(acts);
  });
});

describe('actualizar desde la versión 1 de la base', () => {
  it('conserva los libros que ya estaban guardados y agrega el progreso', async () => {
    // Base "vieja": solo los 3 almacenes de la versión 1, con un libro adentro
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('simulapro-books');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('simulapro-books', 1);
      req.onupgradeneeded = () => {
        for (const s of ['meta', 'content', 'file']) req.result.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['meta', 'content'], 'readwrite');
        tx.objectStore('meta').put({ id: 'viejo|', title: 'Viejo', author: '', chapterCount: 1, wordCount: 2, addedAt: 1, cover: null, size: 4 });
        tx.objectStore('content').put({ id: 'viejo|', chapters: [{ title: 'Uno', blocks: [{ t: 'p', text: 'Hi there' }] }] });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    expect((await listBooks()).map((b) => b.title)).toEqual(['Viejo']);
    await saveProgress('viejo|', 0, 0.3);
    expect((await getProgress('viejo|'))?.scroll).toBeCloseTo(0.3);
    expect(await getBook('viejo|')).not.toBeNull();
  });
});
