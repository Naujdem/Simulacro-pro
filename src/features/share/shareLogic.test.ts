import { describe, expect, it } from 'vitest';
import {
  collectMediaRefs,
  copyAllMedia,
  copyFolderMessage,
  copyMessage,
  countExamsIn,
  folderContents,
  folderShareUrl,
  folderTrail,
  makeShortId,
  shareUrl,
  treeIds,
  type SharedFolderExamRow,
  type SharedFolderNode,
} from './shareLogic';

describe('makeShortId / shareUrl', () => {
  it('genera 8 caracteres legibles', () => {
    const id = makeShortId((n) => Math.floor(Math.random() * n));
    expect(id).toMatch(/^[a-z2-9]{8}$/);
    expect(id).not.toMatch(/[lo01]/);
  });
  it('usa el aleatorio que le pasen', () => expect(makeShortId(() => 0, 4)).toBe('aaaa'));
  it('arma el enlace sin barras dobles', () => {
    expect(shareUrl('https://simulacro-pro.vercel.app/', 'abc123')).toBe('https://simulacro-pro.vercel.app/s/abc123');
  });
});

describe('collectMediaRefs', () => {
  it('junta imágenes y audios gd:, sin repetir, e ignora URLs y vacíos', () => {
    expect(
      collectMediaRefs([
        { imagen_url: 'gd:A', audio_url: null },
        { imagen_url: 'gd:A', audio_url: 'gd:B' },
        { imagen_url: 'https://x.com/a.png' },
        { imagen_url: '' },
        {},
      ]),
    ).toEqual(['gd:A', 'gd:B']);
  });
});

describe('copyAllMedia', () => {
  it('copia todos y arma el mapa viejo → nuevo', async () => {
    const o = await copyAllMedia(['gd:A', 'gd:B'], async (r) => r.replace('gd:', 'gd:new-'));
    expect(o).toEqual({ map: { 'gd:A': 'gd:new-A', 'gd:B': 'gd:new-B' }, total: 2, copied: 2, failed: [] });
  });
  it('si uno falla, lo salta y sigue con los demás', async () => {
    const o = await copyAllMedia(['gd:A', 'gd:B', 'gd:C'], async (r) => {
      if (r === 'gd:B') throw new Error('403');
      return 'gd:n' + r.slice(3);
    });
    expect(o.map).toEqual({ 'gd:A': 'gd:nA', 'gd:C': 'gd:nC' });
    expect(o.failed).toEqual(['gd:B']);
    expect([o.copied, o.total]).toEqual([2, 3]);
  });
  it('avisa el progreso y no pasa del límite de copias simultáneas', async () => {
    let running = 0, peak = 0; const seen: number[] = [];
    await copyAllMedia(Array.from({ length: 10 }, (_, i) => 'gd:' + i), async (r) => {
      peak = Math.max(peak, ++running);
      await new Promise((ok) => setTimeout(ok, 5));
      running--;
      return r;
    }, (d) => seen.push(d), 3);
    expect(peak).toBeLessThanOrEqual(3);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('sin archivos no hace nada', async () => expect(await copyAllMedia([], async (r) => r)).toEqual({ map: {}, total: 0, copied: 0, failed: [] }));
});

describe('copyMessage', () => {
  it('éxito total, parcial y sin archivos', () => {
    expect(copyMessage({ map: {}, total: 0, copied: 0, failed: [] })).toEqual({ text: '¡Listo! El simulacro se guardó en tu cuenta.', warn: false });
    expect(copyMessage({ map: {}, total: 5, copied: 5, failed: [] }).text).toContain('Se copiaron 5 de 5 archivos');
    const p = copyMessage({ map: {}, total: 5, copied: 3, failed: ['a', 'b'] });
    expect(p.warn).toBe(true);
    expect(p.text).toContain('No se pudieron copiar algunos archivos'.toLowerCase().replace('no', 'no'));
    expect(p.text).toContain('Se copiaron 3 de 5 archivos');
  });
});

describe('bibliotecas compartidas', () => {
  // raíz (R) → A → B ; R → C. Los simulacros: e1 en R, e2 en A, e3 en B, e4 en C.
  const folders: SharedFolderNode[] = [
    { id: 'A', parent_id: 'R', name: 'Orgánica' },
    { id: 'B', parent_id: 'A', name: 'Alcanos' },
    { id: 'C', parent_id: 'R', name: 'Inorgánica' },
  ];
  const ex = (id: string, folder_id: string | null): SharedFolderExamRow => ({
    id, folder_id, title: id, description: null, subject: null, question_count: 1, time_limit_min: null,
  });
  const exams = [ex('e1', 'R'), ex('e2', 'A'), ex('e3', 'B'), ex('e4', 'C')];

  it('arma el enlace /b/ sin barras dobles', () => {
    expect(folderShareUrl('https://simulacro-pro.vercel.app/', 'abc123')).toBe('https://simulacro-pro.vercel.app/b/abc123');
  });

  it('treeIds incluye la raíz y todas las subbibliotecas, y corta ciclos', () => {
    expect([...treeIds(folders, 'A')].sort()).toEqual(['A', 'B']);
    expect([...treeIds(folders, 'R')].sort()).toEqual(['A', 'B', 'C', 'R']);
    const ciclo = [{ id: 'X', parent_id: 'Y' }, { id: 'Y', parent_id: 'X' }];
    expect([...treeIds(ciclo, 'X')].sort()).toEqual(['X', 'Y']);
  });

  it('folderContents separa subbibliotecas y simulacros directos', () => {
    const r = folderContents(folders, exams, 'R');
    expect(r.folders.map((f) => f.id)).toEqual(['A', 'C']);
    expect(r.exams.map((e) => e.id)).toEqual(['e1']);
    expect(folderContents(folders, exams, 'B').folders).toEqual([]);
  });

  it('countExamsIn cuenta también los de las subbibliotecas', () => {
    expect(countExamsIn(folders, exams, 'R')).toBe(4);
    expect(countExamsIn(folders, exams, 'A')).toBe(2);
    expect(countExamsIn(folders, exams, 'C')).toBe(1);
  });

  it('folderTrail da el camino hasta la carpeta (vacío en la raíz)', () => {
    expect(folderTrail(folders, 'B').map((f) => f.id)).toEqual(['A', 'B']);
    expect(folderTrail(folders, 'R')).toEqual([]);
  });

  it('copyFolderMessage: éxito total, parcial y sin archivos', () => {
    expect(copyFolderMessage({ map: {}, total: 0, copied: 0, failed: [] }, 3)).toEqual({
      text: '¡Listo! La biblioteca (3 simulacros) se guardó en tu cuenta.',
      warn: false,
    });
    expect(copyFolderMessage({ map: {}, total: 0, copied: 0, failed: [] }, 1).text).toContain('(1 simulacro)');
    expect(copyFolderMessage({ map: {}, total: 4, copied: 4, failed: [] }, 2).text).toContain('Se copiaron 4 de 4 archivos');
    const p = copyFolderMessage({ map: {}, total: 4, copied: 3, failed: ['gd:x'] }, 2);
    expect(p.warn).toBe(true);
    expect(p.text).toContain('se copiaron 3 de 4');
  });
});
