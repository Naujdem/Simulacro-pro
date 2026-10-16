import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDictionary, groupDictionaries, readSources, unxz } from './importer';
import { StarDict } from './stardict';

const enc = new TextEncoder();
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

function hasXz(): boolean {
  try {
    execFileSync('xz', ['--version']);
    execFileSync('tar', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Crea eng-spa/eng-spa.{ifo,idx,dict.dz} dentro de un .stardict.tar.xz, como los de FreeDict. */
function makeTarXz(dir: string): string {
  const defs = ['hoy en día', 'jugar'].map((d) => enc.encode(d));
  const idx = new Uint8Array([...enc.encode('nowadays'), 0, ...u32(0), ...u32(defs[0].length), ...enc.encode('play'), 0, ...u32(defs[0].length), ...u32(defs[1].length)]);
  const ifo = "StarDict's dict ifo file\nversion=2.4.2\nbookname=FreeDict English-Spanish\nwordcount=2\nsametypesequence=m\n";
  const folder = path.join(dir, 'eng-spa');
  mkdirSync(folder);
  writeFileSync(path.join(folder, 'eng-spa.ifo'), ifo);
  writeFileSync(path.join(folder, 'eng-spa.idx'), idx);
  writeFileSync(path.join(folder, 'eng-spa.dict.dz'), gzipSync(new Uint8Array([...defs[0], ...defs[1]])));
  const out = path.join(dir, 'eng-spa.stardict.tar.xz');
  execFileSync('tar', ['-C', dir, '-cJf', out, 'eng-spa']);
  return out;
}

describe.skipIf(!hasXz())('.tar.xz', () => {
  it('unxz devuelve el contenido original', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xz-'));
    try {
      writeFileSync(path.join(dir, 'a.txt'), 'definición '.repeat(2000));
      execFileSync('xz', ['-k', path.join(dir, 'a.txt')]);
      const raw = await unxz(new Uint8Array(readFileSync(path.join(dir, 'a.txt.xz'))));
      expect(new TextDecoder().decode(raw)).toBe('definición '.repeat(2000));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('instala un .stardict.tar.xz completo y busca palabras', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xz-'));
    try {
      const file = makeTarXz(dir);
      const f = new File([readFileSync(file)], 'eng-spa.stardict.tar.xz');
      const groups = groupDictionaries(await readSources([f]));
      expect([...groups.keys()]).toEqual(['eng-spa']);
      const d = await buildDictionary('eng-spa', groups.get('eng-spa')!);
      expect(d).toMatchObject({ name: 'FreeDict English-Spanish', wordCount: 2 });
      const sd = new StarDict({ ifo: d.ifo, idx: d.idx, dict: d.dict });
      expect(sd.lookup('Nowadays')[0].text).toBe('hoy en día');
      expect(sd.lookup('played')[0].text).toBe('jugar');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('un .tar.xz dañado da un error claro en español', async () => {
    const f = new File([new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0, 1, 2, 3])], 'roto.tar.xz');
    await expect(readSources([f])).rejects.toThrow(/dañado o incompleto/);
  });
});
