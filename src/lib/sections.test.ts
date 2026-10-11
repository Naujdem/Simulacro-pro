import { describe, expect, it } from 'vitest';
import { boundaryAt, groupBySection, sectionRanges, sectionStats } from './sections';

const q = (section?: string | null) => ({ section });
const r = (correct: boolean, timeMs = 1000) => ({ correct, timeMs });

describe('sections', () => {
  it('simulacros sin secciones (o con una sola) no se dividen', () => {
    expect(sectionRanges([q(), q(null), q(undefined)])).toEqual([]);
    expect(sectionRanges([q('General'), q('General')])).toEqual([]);
    const same = [q('A'), q('A')];
    expect(groupBySection(same)).toBe(same);
  });
  it('tramos por sección', () => {
    expect(sectionRanges([q('A'), q('A'), q('B'), q('C'), q('C')])).toEqual([
      { name: 'A', start: 0, end: 2 },
      { name: 'B', start: 2, end: 3 },
      { name: 'C', start: 3, end: 5 },
    ]);
  });
  it('null cuenta como "General"', () => {
    expect(sectionRanges([q('A'), q(null)]).map((x) => x.name)).toEqual(['A', 'General']);
  });
  it('groupBySection es estable y respeta el orden de aparición', () => {
    const qs = [{ section: 'B', n: 1 }, { section: 'A', n: 2 }, { section: 'B', n: 3 }];
    expect(groupBySection(qs).map((x) => x.n)).toEqual([1, 3, 2]);
  });
  it('estadísticas de una sección', () => {
    const ranges = sectionRanges([q('A'), q('A'), q('A'), q('B')]);
    const results = [r(true, 2000), r(false, 3000), r(true, 500)];
    expect(sectionStats(ranges[0], results)).toMatchObject({ total: 3, answered: 3, correct: 2, wrong: 1, timeMs: 5500 });
    expect(sectionStats(ranges[1], results)).toMatchObject({ total: 1, answered: 0, correct: 0, wrong: 0, timeMs: 0 });
  });
  it('boundaryAt: solo donde empieza una sección que no es la primera', () => {
    const ranges = sectionRanges([q('A'), q('A'), q('B'), q('B'), q('C')]);
    expect([0, 1, 2, 3, 4, 5].map((i) => boundaryAt(ranges, i))).toEqual([-1, -1, 1, -1, 2, -1]);
  });
});
