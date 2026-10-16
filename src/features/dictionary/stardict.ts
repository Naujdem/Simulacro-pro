import he from 'he';
import { baseForms } from '@/features/ai/dictionary';

/*
 * Lector de diccionarios StarDict (el formato que usa KOReader): un diccionario son 3 archivos con el mismo nombre
 *   nombre.ifo         datos del diccionario (título, cantidad de palabras, formato de las definiciones)
 *   nombre.idx(.gz)    lista de palabras con la posición y el tamaño de su definición
 *   nombre.dict(.dz)   las definiciones
 *   nombre.syn         (opcional) formas alternativas que llevan a otra palabra
 * Todo se lee en memoria: sin servidor, sin IA, sin conexión.
 */

export interface StarDictInfo {
  name: string;
  wordCount: number;
  synCount: number;
  /** 32 (normal) o 64 bits para las posiciones del .idx. */
  offsetBits: 32 | 64;
  sameTypeSequence: string;
}

export function parseIfo(text: string): StarDictInfo {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (!/^StarDict's dict ifo file/i.test(lines[0] ?? '')) throw new Error('El archivo .ifo no es de un diccionario StarDict.');
  const kv = new Map<string, string>();
  for (const l of lines.slice(1)) {
    const i = l.indexOf('=');
    if (i > 0) kv.set(l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim());
  }
  return {
    name: kv.get('bookname') || 'Diccionario',
    wordCount: Number(kv.get('wordcount')) || 0,
    synCount: Number(kv.get('synwordcount')) || 0,
    offsetBits: kv.get('idxoffsetbits') === '64' ? 64 : 32,
    sameTypeSequence: kv.get('sametypesequence') ?? '',
  };
}

/** Descomprime gzip (también .dz de dictzip, que es gzip con datos extra). Si no está comprimido, lo devuelve igual. */
export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 2 || data[0] !== 0x1f || data[1] !== 0x8b) return data;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const utf8 = new TextDecoder('utf-8');

/** Lista de (palabra, posición, tamaño) del .idx. */
export function parseIdx(buf: Uint8Array, offsetBits: 32 | 64): { word: string; offset: number; size: number }[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const step = offsetBits === 64 ? 12 : 8;
  const out: { word: string; offset: number; size: number }[] = [];
  let p = 0;
  while (p < buf.length) {
    let e = p;
    while (e < buf.length && buf[e] !== 0) e++;
    if (e + 1 + step > buf.length) break; // archivo cortado
    const word = utf8.decode(buf.subarray(p, e));
    const offset = offsetBits === 64 ? Number(view.getBigUint64(e + 1)) : view.getUint32(e + 1);
    const size = view.getUint32(e + 1 + (offsetBits === 64 ? 8 : 4));
    out.push({ word, offset, size });
    p = e + 1 + step;
  }
  return out;
}

/** .syn: palabra alternativa → número de entrada del .idx. */
export function parseSyn(buf: Uint8Array): { word: string; index: number }[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: { word: string; index: number }[] = [];
  let p = 0;
  while (p < buf.length) {
    let e = p;
    while (e < buf.length && buf[e] !== 0) e++;
    if (e + 5 > buf.length) break;
    out.push({ word: utf8.decode(buf.subarray(p, e)), index: view.getUint32(e + 1) });
    p = e + 5;
  }
  return out;
}

const TEXT_TYPES = new Set(['m', 'l', 't', 'y', 'g', 'x', 'h', 'k', 'w']);

/** Quita las etiquetas (html, xdxf, pango…) y deja texto con saltos de línea. */
export function toPlainText(raw: string, type: string): string {
  let s = raw;
  if (type !== 'm' && type !== 'l' && type !== 't' && type !== 'y') {
    s = s
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*(p|div|li|tr|blockquote|dd|dt|k)\s*>/gi, '\n')
      .replace(/<\s*(li|dd)[^>]*>/gi, '• ')
      .replace(/<[^>]*>/g, '');
    s = he.decode(s);
  }
  return s
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Lee los campos de una definición según `sametypesequence` (o el tipo escrito delante de cada campo). */
export function decodeEntry(data: Uint8Array, sameTypeSequence: string): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const parts: string[] = [];
  let p = 0;
  const seq = sameTypeSequence ? [...sameTypeSequence] : null;
  for (let i = 0; p < data.length; i++) {
    let type: string;
    if (seq) {
      if (i >= seq.length) break;
      type = seq[i];
    } else {
      type = String.fromCharCode(data[p++]);
    }
    const last = seq ? i === seq.length - 1 : false;
    let end: number;
    if (last) {
      end = data.length;
    } else if (type >= 'A' && type <= 'Z') {
      if (p + 4 > data.length) break;
      const size = view.getUint32(p);
      p += 4;
      end = p + size;
    } else {
      end = p;
      while (end < data.length && data[end] !== 0) end++;
    }
    if (TEXT_TYPES.has(type)) {
      const text = toPlainText(utf8.decode(data.subarray(p, Math.min(end, data.length))), type);
      if (text) parts.push(type === 't' ? `/${text}/` : text);
    }
    p = end + (last ? 0 : type >= 'A' && type <= 'Z' ? 0 : 1);
  }
  return parts.join('\n');
}

export interface StarDictFiles {
  ifo: string;
  /** Ya descomprimidos. */
  idx: Uint8Array;
  dict: Uint8Array;
  syn?: Uint8Array;
}

export interface DictHit {
  headword: string;
  text: string;
}

const norm = (w: string) => w.normalize('NFC').toLowerCase().trim();

export class StarDict {
  readonly info: StarDictInfo;
  private words: { word: string; offset: number; size: number }[];
  private index = new Map<string, number[]>();

  constructor(private files: StarDictFiles) {
    this.info = parseIfo(files.ifo);
    this.words = parseIdx(files.idx, this.info.offsetBits);
    this.words.forEach((w, i) => {
      const k = norm(w.word);
      const list = this.index.get(k);
      if (list) list.push(i);
      else this.index.set(k, [i]);
    });
    if (files.syn) {
      for (const s of parseSyn(files.syn)) {
        if (s.index >= this.words.length) continue;
        const k = norm(s.word);
        const list = this.index.get(k);
        if (!list) this.index.set(k, [s.index]);
        else if (!list.includes(s.index)) list.push(s.index);
      }
    }
  }

  get size(): number {
    return this.words.length;
  }

  /** Definiciones de la palabra exacta (sin importar mayúsculas). */
  exact(word: string): DictHit[] {
    const ids = this.index.get(norm(word)) ?? [];
    const hits: DictHit[] = [];
    for (const i of ids.slice(0, 5)) {
      const w = this.words[i];
      if (w.offset + w.size > this.files.dict.length) continue; // .dict incompleto
      const text = decodeEntry(this.files.dict.subarray(w.offset, w.offset + w.size), this.info.sameTypeSequence);
      if (text) hits.push({ headword: w.word, text });
    }
    return hits;
  }

  /** Como KOReader: busca la palabra y, si no está, su forma base ("played" → "play"). */
  lookup(word: string): DictHit[] {
    for (const form of baseForms(word)) {
      const hits = this.exact(form);
      if (hits.length) return hits;
    }
    return [];
  }
}
