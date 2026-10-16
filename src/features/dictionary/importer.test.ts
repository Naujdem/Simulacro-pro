import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildDictionary, groupDictionaries, untar } from './importer';

const enc = new TextEncoder();
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

function tarOf(files: Record<string, Uint8Array>): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const [name, data] of Object.entries(files)) {
    const h = new Uint8Array(512);
    h.set(enc.encode(name));
    h.set(enc.encode(data.length.toString(8).padStart(11, '0')), 124);
    h[156] = 48;
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const b of blocks) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

const dict = enc.encode('hola');
const idx = new Uint8Array([...enc.encode('hello'), 0, ...u32(0), ...u32(4)]);
const ifo = enc.encode("StarDict's dict ifo file\nbookname=Mini\nwordcount=1\nsametypesequence=m\n");

describe('untar + groupDictionaries', () => {
  it('lee un .tar con carpeta y agrupa los tres archivos por nombre', () => {
    const named = untar(tarOf({ 'mini/mini.ifo': ifo, 'mini/mini.idx': idx, 'mini/mini.dict.dz': new Uint8Array(gzipSync(dict)) }));
    expect([...named.keys()].sort()).toEqual(['mini.dict.dz', 'mini.idx', 'mini.ifo']);
    const groups = groupDictionaries(named);
    expect([...groups.keys()]).toEqual(['mini']);
    expect(Object.keys(groups.get('mini')!).sort()).toEqual(['dict', 'idx', 'ifo']);
  });
  it('separa dos diccionarios distintos', () => {
    const named = new Map([['a.ifo', ifo], ['a.idx', idx], ['b.ifo', ifo], ['b.dict', dict]]);
    expect([...groupDictionaries(named).keys()].sort()).toEqual(['a', 'b']);
  });
});

describe('buildDictionary', () => {
  it('arma el diccionario con .dict.dz e .idx.gz comprimidos', async () => {
    const d = await buildDictionary('mini', { ifo, idx: new Uint8Array(gzipSync(idx)), dict: new Uint8Array(gzipSync(dict)) });
    expect(d).toMatchObject({ name: 'Mini', wordCount: 1 });
    expect(d.dict).toEqual(dict);
  });
  it('avisa en español qué archivos faltan', async () => {
    await expect(buildDictionary('mini', { ifo, idx })).rejects.toThrow(/faltan archivos: \.dict/);
  });
});
