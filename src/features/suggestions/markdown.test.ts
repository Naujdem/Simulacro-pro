import { describe, expect, it } from 'vitest';
import { cleanMarkdown, titleFrom } from './markdown';

describe('titleFrom', () => {
  it('usa el primer encabezado # y quita el énfasis', () => {
    expect(titleFrom('texto\n# Sugerencia de estudio: **Verbo To Be**\n## Temas', 'X')).toBe('Sugerencia de estudio: Verbo To Be');
  });
  it('no confunde ## con título y usa el de respaldo', () => {
    expect(titleFrom('## Temas a repasar', 'Mi simulacro')).toBe('Mi simulacro');
  });
  it('recorta títulos larguísimos', () => {
    expect(titleFrom('# ' + 'a'.repeat(400), 'X')).toHaveLength(160);
  });
});

describe('cleanMarkdown', () => {
  it('quita la cerca ```markdown que envuelve toda la respuesta', () => {
    expect(cleanMarkdown('```markdown\n# Hola\n\n- a\n```')).toBe('# Hola\n\n- a');
  });
  it('deja intacto un Markdown normal, incluso con bloques de código dentro', () => {
    const t = '# Hola\n\n```\ncode\n```\n\nfin';
    expect(cleanMarkdown(t)).toBe(t);
  });
});
