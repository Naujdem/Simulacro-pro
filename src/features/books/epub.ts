import JSZip from 'jszip';

/*
 * Lector de libros EPUB: un .epub es un .zip con capítulos en XHTML. Aquí se abre, se lee el orden de los capítulos y
 * sus títulos (índice), y de cada capítulo se saca el texto por párrafos y títulos. Todo en el dispositivo, sin servidor.
 * Libros con protección (DRM) no se pueden abrir.
 */

export interface Block {
  /** h = título dentro del capítulo, p = párrafo. */
  t: 'h' | 'p';
  text: string;
}
export interface Chapter {
  title: string;
  blocks: Block[];
}
export interface ParsedBook {
  title: string;
  author: string;
  chapters: Chapter[];
  cover: Blob | null;
}

/* ───────────── Ayudas de XML ───────────── */

const local = (el: Element): string => (el.localName || el.tagName.split(':').pop() || '').toLowerCase();

/** Todos los elementos con ese nombre (sin importar el prefijo: dc:title y title cuentan igual). */
function all(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((e) => local(e) === name);
}

function parseXml(text: string, mime: DOMParserSupportedType = 'application/xml'): Document {
  return new DOMParser().parseFromString(text.replace(/^﻿/, ''), mime);
}

/** XHTML bien formado; si el libro trae errores de formato se vuelve a leer como HTML normal. */
function parseXhtml(text: string): Document {
  const doc = parseXml(text, 'application/xhtml+xml');
  if (doc.getElementsByTagName('parsererror').length || !all(doc, 'body').length) return parseXml(text, 'text/html');
  return doc;
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');

/** Ruta dentro del .zip de un enlace relativo (sin #ancla, con %20 → espacio, con ../ resuelto). */
export function resolvePath(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
  const parts = (clean.startsWith('/') ? clean.slice(1) : dirOf(base) + clean).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

const clean = (s: string) =>
  s
    .replace(/[   ]/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

/* ───────────── Texto de un capítulo ───────────── */

const SKIP = new Set(['script', 'style', 'nav', 'svg', 'head', 'title', 'math', 'audio', 'video', 'img', 'image', 'object', 'iframe', 'canvas', 'rt', 'rp']);
const BLOCK = new Set(['p', 'li', 'blockquote', 'pre', 'dt', 'dd', 'figcaption', 'caption', 'td', 'th', 'summary']);
const CONTAINER = new Set(['div', 'section', 'article', 'body', 'ul', 'ol', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'figure', 'aside', 'dl', 'main', 'header', 'footer', 'details', 'html']);
const isHead = (n: string) => /^h[1-6]$/.test(n);
const isBlockLike = (n: string) => BLOCK.has(n) || CONTAINER.has(n) || isHead(n);

/** Texto de un elemento: los <br> son saltos de línea y se ignora lo que no es texto (imágenes, scripts…). */
function textOf(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (node.nodeType !== 1) return '';
  const el = node as Element;
  const name = local(el);
  if (SKIP.has(name)) return '';
  if (name === 'br') return '\n';
  let s = '';
  el.childNodes.forEach((c) => (s += textOf(c)));
  return s;
}

function walk(el: Element, out: Block[]) {
  const name = local(el);
  if (SKIP.has(name) || name === 'br' || name === 'hr') return;
  const push = (t: Block['t'], raw: string) => {
    const text = clean(raw);
    if (text) out.push({ t, text });
  };
  if (isHead(name)) return push('h', textOf(el).replace(/\n/g, ' '));
  if (!Array.from(el.children).some((c) => isBlockLike(local(c)) || isHead(local(c)))) return push('p', textOf(el));
  // Mezcla de texto suelto y bloques: el texto suelto forma su propio párrafo
  let buf = '';
  const flush = () => {
    push('p', buf);
    buf = '';
  };
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) buf += n.nodeValue ?? '';
    else if (n.nodeType === 1) {
      const c = n as Element;
      if (isBlockLike(local(c))) {
        flush();
        walk(c, out);
      } else buf += textOf(c);
    }
  });
  flush();
}

/** Párrafos y títulos de un archivo XHTML, en orden. */
export function extractBlocks(xhtml: string): Block[] {
  const doc = parseXhtml(xhtml);
  const body = all(doc, 'body')[0] ?? doc.documentElement;
  const out: Block[] = [];
  if (body) walk(body, out);
  return out;
}

/* ───────────── El libro ───────────── */

interface Item {
  id: string;
  href: string;
  type: string;
  props: string;
}

// Las fuentes "ofuscadas" no son DRM; cualquier otro cifrado sí.
const FONT_ALGOS = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];

export async function parseEpub(data: Blob | ArrayBuffer | Uint8Array): Promise<ParsedBook> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error('El archivo no es un EPUB válido (no se pudo abrir como libro).');
  }
  const names = Object.keys(zip.files);
  const find = (path: string) => zip.file(path) ?? zip.file(names.find((n) => n.toLowerCase() === path.toLowerCase()) ?? '');
  const read = async (path: string) => (await find(path)?.async('string')) ?? null;

  const container = await read('META-INF/container.xml');
  if (!container) throw new Error('El archivo no es un EPUB válido (falta META-INF/container.xml).');

  const enc = await read('META-INF/encryption.xml');
  if (enc) {
    const algos = Array.from(enc.matchAll(/Algorithm="([^"]+)"/g)).map((m) => m[1]);
    if (algos.some((a) => !FONT_ALGOS.includes(a) && !/xmlenc#(sha|ripemd)/i.test(a) && !/xmldsig/i.test(a))) {
      throw new Error('Este libro tiene protección (DRM) y no se puede abrir. Usa una copia sin protección.');
    }
  }

  const opfPath = all(parseXml(container), 'rootfile')[0]?.getAttribute('full-path');
  const opfText = opfPath ? await read(opfPath) : null;
  if (!opfPath || !opfText) throw new Error('El EPUB está incompleto (no se encontró su archivo de contenido).');
  const opf = parseXml(opfText);

  const text = (name: string) => clean(all(opf, name)[0]?.textContent ?? '');
  const title = text('title') || 'Libro sin título';
  const author = text('creator');

  const manifest = new Map<string, Item>();
  for (const it of all(opf, 'item')) {
    const id = it.getAttribute('id');
    const href = it.getAttribute('href');
    if (id && href) manifest.set(id, { id, href: resolvePath(opfPath, href), type: it.getAttribute('media-type') ?? '', props: it.getAttribute('properties') ?? '' });
  }
  let spine = all(opf, 'itemref')
    .filter((r) => r.getAttribute('linear') !== 'no')
    .map((r) => manifest.get(r.getAttribute('idref') ?? ''))
    .filter((i): i is Item => !!i);
  spine = spine.filter((i) => /x?html/.test(i.type) || /\.x?html?$/i.test(i.href));
  if (!spine.length) throw new Error('El EPUB no tiene capítulos que se puedan leer.');

  // Índice: EPUB 3 (nav) o EPUB 2 (toc.ncx) → título por archivo
  const tocTitles = new Map<string, string>();
  const addToc = (path: string, label: string) => {
    const t = clean(label.replace(/\n/g, ' '));
    if (t && !tocTitles.has(path)) tocTitles.set(path, t);
  };
  const navItem = [...manifest.values()].find((i) => i.props.split(/\s+/).includes('nav'));
  const navText = navItem ? await read(navItem.href) : null;
  if (navItem && navText) {
    const navs = all(parseXhtml(navText), 'nav');
    const toc = navs.find((n) => (n.getAttribute('epub:type') ?? '').includes('toc')) ?? navs[0];
    if (toc) for (const a of all(toc, 'a')) if (a.getAttribute('href')) addToc(resolvePath(navItem.href, a.getAttribute('href')!), textOf(a));
  }
  if (!tocTitles.size) {
    const ncxId = all(opf, 'spine')[0]?.getAttribute('toc');
    const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((i) => i.type.includes('dtbncx'));
    const ncxText = ncx ? await read(ncx.href) : null;
    if (ncx && ncxText) {
      for (const p of all(parseXml(ncxText), 'navPoint'.toLowerCase())) {
        const src = all(p, 'content')[0]?.getAttribute('src');
        const label = all(p, 'text')[0]?.textContent ?? '';
        if (src) addToc(resolvePath(ncx.href, src), label);
      }
    }
  }

  // Capítulos: uno por archivo con título en el índice (o que empieza con un título grande); el resto continúa el anterior
  const chapters: Chapter[] = [];
  for (const item of spine) {
    const xhtml = await read(item.href);
    if (!xhtml) continue;
    const blocks = extractBlocks(xhtml);
    if (!blocks.length) continue;
    const tocTitle = tocTitles.get(item.href);
    const startsWithHeading = blocks[0].t === 'h';
    if (!chapters.length || tocTitle || startsWithHeading) {
      const t = tocTitle ?? (startsWithHeading ? blocks[0].text : '') ?? '';
      chapters.push({ title: t || `Sección ${chapters.length + 1}`, blocks });
    } else {
      chapters[chapters.length - 1].blocks.push(...blocks);
    }
  }
  if (!chapters.length) throw new Error('No encontré texto en este EPUB (¿son solo imágenes?).');

  return { title, author, chapters, cover: await readCover(opf, manifest, zip, find) };
}

async function readCover(opf: Document, manifest: Map<string, Item>, zip: JSZip, find: (p: string) => JSZip.JSZipObject | null): Promise<Blob | null> {
  try {
    const metaId = all(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    const item = [...manifest.values()].find((i) => i.props.split(/\s+/).includes('cover-image')) ?? (metaId ? manifest.get(metaId) : undefined);
    if (!item || !item.type.startsWith('image/')) return null;
    const bytes = await (find(item.href) ?? zip.file(item.href))?.async('uint8array');
    if (!bytes || bytes.length > 3_000_000) return null;
    return new Blob([bytes as BlobPart], { type: item.type });
  } catch {
    return null;
  }
}
