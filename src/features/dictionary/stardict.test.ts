import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { StarDict, decodeEntry, gunzip, parseIfo, toPlainText } from './stardict';

const enc = new TextEncoder();
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** Arma un StarDict mínimo en memoria (como lo haría un .ifo/.idx/.dict real). */
function build(entries: [string, string][], opts: { sametype?: string; syn?: [string, number][] } = {}) {
  const sametype = opts.sametype ?? 'm';
  const defs = entries.map(([, d]) => enc.encode(d));
  const dict = cat(...defs);
  let off = 0;
  const idxParts: Uint8Array[] = [];
  entries.forEach(([w], i) => {
    idxParts.push(enc.encode(w), new Uint8Array([0]), u32(off), u32(defs[i].length));
    off += defs[i].length;
  });
  const ifo = `StarDict's dict ifo file\nversion=2.4.2\nbookname=Test en-es\nwordcount=${entries.length}\nidxfilesize=${cat(...idxParts).length}\nsametypesequence=${sametype}\n`;
  const syn = opts.syn ? cat(...opts.syn.flatMap(([w, i]) => [enc.encode(w), new Uint8Array([0]), u32(i)])) : undefined;
  return { ifo, idx: cat(...idxParts), dict, syn };
}

describe('parseIfo', () => {
  it('lee título, cantidad y formato', () => {
    const i = parseIfo("StarDict's dict ifo file\nbookname=FreeDict eng-spa\nwordcount=3\nidxoffsetbits=64\nsametypesequence=h\n");
    expect(i).toMatchObject({ name: 'FreeDict eng-spa', wordCount: 3, offsetBits: 64, sameTypeSequence: 'h' });
  });
  it('rechaza archivos que no son StarDict', () => {
    expect(() => parseIfo('hola')).toThrow();
  });
});

describe('StarDict', () => {
  const sd = new StarDict(build([['hello', 'hola'], ['Nowadays', 'hoy en día\nactualmente'], ['play', 'jugar'], ['study', 'estudiar']], { syn: [['hi', 0]] }));

  it('busca sin importar mayúsculas y devuelve la definición', () => {
    expect(sd.lookup('NOWADAYS')).toEqual([{ headword: 'Nowadays', text: 'hoy en día\nactualmente' }]);
  });
  it('encuentra la forma base de palabras conjugadas', () => {
    expect(sd.lookup('played')[0].text).toBe('jugar');
    expect(sd.lookup('studies')[0].text).toBe('estudiar');
  });
  it('usa las formas alternativas del .syn', () => {
    expect(sd.lookup('hi')[0].text).toBe('hola');
  });
  it('palabra ausente: sin resultados', () => {
    expect(sd.lookup('zzzz')).toEqual([]);
  });
  it('idx con posiciones de 64 bits', () => {
    const b = build([['cat', 'gato']]);
    const idx64 = cat(enc.encode('cat'), new Uint8Array([0]), u32(0), u32(0), u32(4));
    const ifo = b.ifo.replace('version=2.4.2', 'version=3.0.0\nidxoffsetbits=64');
    expect(new StarDict({ ifo, idx: idx64, dict: b.dict }).lookup('cat')[0].text).toBe('gato');
  });
});

describe('decodeEntry', () => {
  it('varios campos con sametypesequence "tm" (el último sin terminador)', () => {
    const data = cat(enc.encode('nau.ə.deɪz'), new Uint8Array([0]), enc.encode('hoy en día'));
    expect(decodeEntry(data, 'tm')).toBe('/nau.ə.deɪz/\nhoy en día');
  });
  it('sin sametypesequence: cada campo lleva su tipo delante', () => {
    const data = cat(enc.encode('m'), enc.encode('hola'), new Uint8Array([0]), enc.encode('h'), enc.encode('<b>adiós</b>'), new Uint8Array([0]));
    expect(decodeEntry(data, '')).toBe('hola\nadiós');
  });
  it('campos de tipo mayúscula (binarios) se saltan con su tamaño', () => {
    const data = cat(enc.encode('m'), enc.encode('texto'), new Uint8Array([0]), enc.encode('W'), u32(3), new Uint8Array([1, 2, 3]));
    expect(decodeEntry(data, '')).toBe('texto');
  });
});

describe('toPlainText', () => {
  it('convierte html en texto con saltos de línea y entidades', () => {
    expect(toPlainText('<p>jugar</p><p>to <i>play</i> &amp; run<br>otra línea</p>', 'h')).toBe('jugar\nto play & run\notra línea');
  });
  it('en texto plano (m) no toca los símbolos < >', () => {
    expect(toPlainText('a < b', 'm')).toBe('a < b');
  });
});

describe('gunzip', () => {
  it('descomprime gzip y deja pasar lo que no está comprimido', async () => {
    const raw = enc.encode('definición larga '.repeat(50));
    expect(await gunzip(new Uint8Array(gzipSync(raw)))).toEqual(raw);
    expect(await gunzip(raw)).toEqual(raw);
  });
});
