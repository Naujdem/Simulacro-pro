import type { Chapter, ParsedBook } from './epub';

/*
 * Los libros viven en este dispositivo (IndexedDB): el archivo original, el texto ya separado por capítulos y los datos
 * del libro (título, portada…). Se leen sin conexión. Cada dispositivo tiene los suyos.
 */

const DB = 'simulapro-books';
const META = 'meta';
const CONTENT = 'content';
const FILE = 'file';
const PROGRESS = 'progress';

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  chapterCount: number;
  wordCount: number;
  addedAt: number;
  cover: Blob | null;
  /** Tamaño del .epub en bytes. */
  size: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Este navegador no permite guardar libros.'));
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      // Crea solo los almacenes que faltan: así quien ya tenía la versión 1 conserva sus libros
      for (const s of [META, CONTENT, FILE, PROGRESS]) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('No se pudo abrir el almacenamiento de libros.'));
  });
}

async function run<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const req = fn(tx);
      tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
      tx.onerror = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'No hay espacio suficiente en el dispositivo.' : 'No se pudo guardar el libro.'));
      tx.onabort = tx.onerror;
    });
  } finally {
    db.close();
  }
}

/** El mismo libro (título + autor) se reemplaza en vez de duplicarse. */
export const bookId = (title: string, author: string) => `${title}|${author}`.toLowerCase().replace(/\s+/g, ' ').trim();

export async function saveBook(book: ParsedBook, file: Blob): Promise<BookMeta> {
  const words = book.chapters.reduce((n, c) => n + c.blocks.reduce((m, b) => m + b.text.split(/\s+/).filter(Boolean).length, 0), 0);
  const meta: BookMeta = {
    id: bookId(book.title, book.author),
    title: book.title,
    author: book.author,
    chapterCount: book.chapters.length,
    wordCount: words,
    addedAt: Date.now(),
    cover: book.cover,
    size: file.size,
  };
  await run([META, CONTENT, FILE], 'readwrite', (tx) => {
    tx.objectStore(META).put(meta);
    tx.objectStore(CONTENT).put({ id: meta.id, chapters: book.chapters });
    tx.objectStore(FILE).put({ id: meta.id, file });
  });
  return meta;
}

export async function listBooks(): Promise<BookMeta[]> {
  const all = await run<BookMeta[]>([META], 'readonly', (tx) => tx.objectStore(META).getAll());
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getBook(id: string): Promise<{ meta: BookMeta; chapters: Chapter[] } | null> {
  const [meta, content] = await Promise.all([
    run<BookMeta | undefined>([META], 'readonly', (tx) => tx.objectStore(META).get(id)),
    run<{ chapters: Chapter[] } | undefined>([CONTENT], 'readonly', (tx) => tx.objectStore(CONTENT).get(id)),
  ]);
  return meta && content ? { meta, chapters: content.chapters } : null;
}

export async function removeBook(id: string): Promise<void> {
  await run([META, CONTENT, FILE, PROGRESS], 'readwrite', (tx) => {
    for (const s of [META, CONTENT, FILE, PROGRESS]) tx.objectStore(s).delete(id);
  });
}

/** Dónde ibas: capítulo (desde 0) y posición dentro del capítulo (0 a 1). */
export interface Progress {
  id: string;
  chapter: number;
  scroll: number;
  updatedAt: number;
}

export async function getProgress(id: string): Promise<Progress | null> {
  return (await run<Progress | undefined>([PROGRESS], 'readonly', (tx) => tx.objectStore(PROGRESS).get(id))) ?? null;
}

export async function saveProgress(id: string, chapter: number, scroll: number): Promise<void> {
  const p: Progress = { id, chapter, scroll: Math.min(1, Math.max(0, scroll)), updatedAt: Date.now() };
  await run([PROGRESS], 'readwrite', (tx) => {
    tx.objectStore(PROGRESS).put(p);
  });
}

export async function listProgress(): Promise<Map<string, Progress>> {
  const all = await run<Progress[]>([PROGRESS], 'readonly', (tx) => tx.objectStore(PROGRESS).getAll());
  return new Map(all.map((p) => [p.id, p]));
}

/** Pide al navegador que no borre los libros al liberar espacio. No es crítico si falla. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* nada */
  }
}
