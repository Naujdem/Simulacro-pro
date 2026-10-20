import { describe, expect, it } from 'vitest';
import { canSkipOver, moveToEndOfScope, skipScopeEnd } from './skip';

const q = (id: string, section?: string) => ({ id, section: section ?? null });
const ids = (qs: { id: string }[]) => qs.map((x) => x.id).join(',');
// Dos secciones: A (3 preguntas) y B (2 preguntas)
const dos = [q('a1', 'A'), q('a2', 'A'), q('a3', 'A'), q('b1', 'B'), q('b2', 'B')];

describe('saltar preguntas', () => {
  it('en el simulacro completo la pregunta va al final de SU sección', () => {
    expect(skipScopeEnd(dos, 0, true)).toBe(3);
    expect(ids(moveToEndOfScope(dos, 0, true))).toBe('a2,a3,a1,b1,b2');
    expect(ids(moveToEndOfScope(dos, 3, true))).toBe('a1,a2,a3,b2,b1');
  });

  it('las secciones no cambian de tamaño ni de lugar (las pausas siguen donde estaban)', () => {
    const moved = moveToEndOfScope(dos, 1, true);
    expect(moved.map((x) => x.section)).toEqual(dos.map((x) => x.section));
  });

  it('en los repasos (sin secciones) va al final de toda la cola', () => {
    expect(skipScopeEnd(dos, 0, false)).toBe(5);
    expect(ids(moveToEndOfScope(dos, 0, false))).toBe('a2,a3,b1,b2,a1');
  });

  it('con una sola sección o sin secciones, también al final de la cola', () => {
    const una = [q('x1'), q('x2'), q('x3')];
    expect(ids(moveToEndOfScope(una, 0, true))).toBe('x2,x3,x1');
  });

  it('solo mueve preguntas por responder: lo anterior a `index` no se toca', () => {
    const moved = moveToEndOfScope(dos, 1, true);
    expect(ids(moved.slice(0, 1))).toBe('a1');
    expect(ids(moved)).toBe('a1,a3,a2,b1,b2');
  });

  it('no se puede saltar la única pregunta que queda en la sección (ni en la cola)', () => {
    expect(canSkipOver(dos, 2, true)).toBe(false); // a3 es la última de A
    expect(moveToEndOfScope(dos, 2, true)).toBe(dos);
    expect(canSkipOver(dos, 4, true)).toBe(false); // b2, última de todo
    expect(canSkipOver(dos, 4, false)).toBe(false);
    expect(canSkipOver([q('solo')], 0, false)).toBe(false);
  });

  it('con varias saltadas se pueden ir rotando sin perder ninguna', () => {
    let cola = dos.slice(0, 3);
    cola = moveToEndOfScope(cola, 0, true);
    cola = moveToEndOfScope(cola, 0, true);
    expect(ids(cola)).toBe('a3,a1,a2');
    expect([...cola].map((x) => x.id).sort().join()).toBe('a1,a2,a3');
  });
});
