import { describe, expect, it } from 'vitest';
import { collectMediaRefs, copyAllMedia, copyMessage, makeShortId, shareUrl } from './shareLogic';

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
