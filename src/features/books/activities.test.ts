import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { chapterText, generateActivities, parseActivities } from './activities';

const good = {
  comprension: [
    { pregunta: 'Who is a famous singer?', opciones: ['Leo', 'Vanessa', 'Jennifer'], correcta: 0, explicacion: 'Leo es cantante.' },
    { pregunta: 'What color are his eyes?', opciones: ['Blue', 'Green', 'Brown'], correcta: 'a', explicacion: 'Azules.' },
    { pregunta: 'How old is he?', opciones: ['36', '30', '40'], correcta: '36', explicacion: 'Tiene 36.' },
  ],
  verdadero_falso: [
    { afirmacion: 'Leo is small.', verdadero: true, explicacion: 'Sí.' },
    { afirmacion: 'Vanessa is tall.', verdadero: 'falso', explicacion: 'No.' },
  ],
  vocabulario: [
    { palabra: 'wavy', traduccion: 'ondulado' },
    { palabra: 'Wavy', traduccion: 'repetida' },
    { palabra: 'brunette', traduccion: 'morena' },
  ],
  conversacion: ['Describe your best friend.', 'What do you like to do?'],
};

describe('parseActivities', () => {
  it('acepta la respuesta buena y la correcta sigue siendo la misma tras mezclar las opciones', () => {
    for (const rnd of [() => 0, () => 0.5, () => 0.99, Math.random]) {
      const a = parseActivities(good, rnd)!;
      expect(a.mcq).toHaveLength(3);
      expect(a.mcq.map((q) => q.options[q.correct])).toEqual(['Leo', 'Blue', '36']);
      expect(a.mcq.every((q) => q.options.length === 3)).toBe(true);
    }
  });

  it('entiende verdadero/falso en español y quita palabras repetidas', () => {
    const a = parseActivities(good)!;
    expect(a.tf.map((t) => t.answer)).toEqual([true, false]);
    expect(a.vocab).toEqual([
      { word: 'wavy', translation: 'ondulado' },
      { word: 'brunette', translation: 'morena' },
    ]);
    expect(a.speaking).toHaveLength(2);
  });

  it('descarta preguntas incompletas o con respuesta imposible, pero conserva las buenas', () => {
    const a = parseActivities({
      comprension: [
        { pregunta: 'Sin opciones', opciones: [], correcta: 0 },
        { pregunta: 'Una sola opción', opciones: ['x'], correcta: 0 },
        { pregunta: 'Opciones repetidas', opciones: ['a', 'A', 'b'], correcta: 0 },
        { pregunta: 'Correcta fuera de rango', opciones: ['a', 'b'], correcta: 7 },
        { pregunta: 'Correcta desconocida', opciones: ['a', 'b'], correcta: 'zzz' },
        { pregunta: '', opciones: ['a', 'b'], correcta: 0 },
        { pregunta: 'Buena', opciones: ['a', 'b'], correcta: 1 },
      ],
      verdadero_falso: [{ afirmacion: 'Sin respuesta' }, { afirmacion: 'Con respuesta', verdadero: false }],
    })!;
    expect(a.mcq.map((q) => q.question)).toEqual(['Buena']);
    expect(a.tf.map((t) => t.statement)).toEqual(['Con respuesta']);
  });

  it('si no queda ninguna pregunta utilizable devuelve null (basura, vacío, formatos raros)', () => {
    expect(parseActivities(null)).toBeNull();
    expect(parseActivities('hola')).toBeNull();
    expect(parseActivities([])).toBeNull();
    expect(parseActivities({})).toBeNull();
    expect(parseActivities({ comprension: 'no es lista', verdadero_falso: 5 })).toBeNull();
    expect(parseActivities({ vocabulario: [{ palabra: 'a', traduccion: 'b' }] })).toBeNull(); // solo vocabulario no basta
  });

  it('limita las cantidades y los textos largos', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ pregunta: `Q${i}`.padEnd(500, 'x'), opciones: ['a', 'b'], correcta: 0 }));
    const a = parseActivities({ comprension: many })!;
    expect(a.mcq).toHaveLength(6);
    expect(a.mcq[0].question.length).toBe(300);
  });
});

describe('chapterText', () => {
  it('un capítulo corto se envía completo; uno largo, el principio y el final', () => {
    expect(chapterText([{ t: 'p', text: 'Hello' }, { t: 'p', text: 'World' }])).toBe('Hello\n\nWorld');
    const long = chapterText([{ t: 'p', text: 'A'.repeat(5000) }, { t: 'p', text: 'B'.repeat(5000) }], 1000);
    expect(long.length).toBeLessThanOrEqual(1010);
    expect(long.startsWith('AAAA')).toBe(true);
    expect(long.endsWith('BBBB')).toBe(true);
    expect(long).toContain('[…]');
  });
});

describe('generateActivities', () => {
  beforeEach(() => invoke.mockReset());
  const input = { title: 'Mary', chapter: 'One', text: 'x'.repeat(200), provider: 'openrouter' as const };

  it('pide a la función y devuelve las actividades ya revisadas', async () => {
    invoke.mockResolvedValue({ data: { ok: true, actividades: good, proveedor: 'gemini' }, error: null });
    const r = await generateActivities(input);
    expect(invoke).toHaveBeenCalledWith('ia-actividades', { body: { titulo: 'Mary', capitulo: 'One', texto: input.text, proveedor: 'openrouter' } });
    expect(r.provider).toBe('gemini');
    expect(r.activities.mcq).toHaveLength(3);
  });
  it('errores claros: función no desplegada, IA caída y respuesta inservible', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('x') });
    await expect(generateActivities(input)).rejects.toThrow(/ia-actividades/);
    invoke.mockResolvedValue({ data: { ok: false, mensaje: 'Gemini no respondió: alta demanda' }, error: null });
    await expect(generateActivities(input)).rejects.toThrow(/alta demanda/);
    invoke.mockResolvedValue({ data: { ok: true, actividades: { comprension: [] } }, error: null });
    await expect(generateActivities(input)).rejects.toThrow(/utilizables/);
  });
});
