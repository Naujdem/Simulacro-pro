import { describe, expect, it } from 'vitest';
import { cleanJsonText, describeSummary, parseImportJson } from './jsonImport';

const FULL = {
  version: 1,
  bibliotecas: [
    {
      nombre: 'Inglés B1',
      color: '#0ea5e9',
      descripcion: 'Gramática',
      simulacros: [
        {
          titulo: 'B',
          orden: 2,
          preguntas: [{ tipo: 'true_false', enunciado: 'x', correcta: true }],
        },
        {
          titulo: 'A',
          tema: 'Gramática',
          descripcion: 'd',
          orden: 1,
          preguntas: [
            { tipo: 'multiple_choice', enunciado: 'She ___ here', opciones: ['have', 'has', 'had'], correcta: 1, explicacion: 'e' },
            { tipo: 'fill_blank', enunciado: 'I have ___ it and ___ it', correcta: [['done', 'did'], 'saw'] },
            { tipo: 'order_words', palabras: ['lived', 'has', 'here', 'She'], correcta: 'She has lived here.' },
            { tipo: 'transform', original: 'She has finished.', forma: 'Negativa', correcta: 'She has not finished.' },
          ],
          lecturas: [
            {
              titulo: 'Trip',
              texto: 'Tom went to London.',
              preguntas: [{ tipo: 'multiple_choice', enunciado: 'Where?', opciones: ['Paris', 'London'], correcta: [1] }],
            },
          ],
        },
      ],
    },
  ],
  fichas: [{ frente: 'f', reverso: 'r', mazo: 'Inglés::Gramática' }, { frente: 'f2', reverso: 'r2' }],
};

const ok = (x: unknown) => {
  const r = parseImportJson(typeof x === 'string' ? x : JSON.stringify(x));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r;
};
const errs = (x: unknown) => {
  const r = parseImportJson(typeof x === 'string' ? x : JSON.stringify(x));
  if (r.ok) throw new Error('debía fallar');
  return r.errors;
};
const oneQ = (q: object) => ({ simulacros: [{ titulo: 'T', preguntas: [q] }] });

describe('parseImportJson: caso completo', () => {
  const r = ok(FULL);
  it('cuenta todo', () => {
    expect(r.summary).toMatchObject({ folders: 1, exams: 2, questions: 6, readings: 1, cards: 2, decks: 2 });
    expect(describeSummary(r.summary)).toBe('1 biblioteca, 2 simulacros, 6 preguntas, 1 lectura, 2 fichas en 2 mazos');
  });
  it('ordena los simulacros por "orden"', () => {
    expect(r.plan.folders[0].exams.map((e) => [e.title, e.position])).toEqual([['A', 0], ['B', 1]]);
  });
  it('convierte al formato de la base de datos', () => {
    const [mc, fb, ow, tr, rd] = r.plan.folders[0].exams[0].questions;
    expect(mc).toMatchObject({ type: 'multiple_choice', options: [{ id: 'a', text: 'have' }, { id: 'b', text: 'has' }, { id: 'c', text: 'had' }], answer: { correct: ['b'] }, explanation: 'e' });
    expect(fb).toMatchObject({ prompt: 'I have {{1}} it and {{2}} it', answer: { blanks: [['done', 'did'], ['saw']] } });
    expect(ow.type).toBe('order_words');
    expect(ow.options!.map((o) => o.text).sort()).toEqual(['She', 'has', 'here', 'lived']);
    expect(ow.answer).toEqual({ accepted: ['She has lived here.'] });
    expect(tr).toMatchObject({ prompt: 'She has finished.', answer: { accepted: ['She has not finished.'], form: 'negativa' } });
    expect(rd).toMatchObject({ readingIndex: 0, answer: { correct: ['b'] } });
    expect(r.plan.folders[0].exams[0].readings).toEqual([{ title: 'Trip', body: 'Tom went to London.' }]);
  });
  it('fichas: mazo opcional', () => {
    expect(r.plan.cards).toEqual([{ front: 'f', back: 'r', deck: 'Inglés::Gramática' }, { front: 'f2', back: 'r2', deck: null }]);
  });
});

describe('parseImportJson: entrada del chat', () => {
  it('acepta ```json …``` y texto alrededor', () => {
    const t = 'Claro, aquí está:\n```json\n' + JSON.stringify(oneQ({ tipo: 'true_false', enunciado: 'x', correcta: false })) + '\n```\nEspero que sirva.';
    expect(ok(t).summary.questions).toBe(1);
  });
  it('acepta comillas curvas como delimitadores', () => {
    expect(ok('{“simulacros”:[{“titulo”:“T”,“preguntas”:[{“tipo”:“true_false”,“enunciado”:“x”,“correcta”:true}]}]}').summary.exams).toBe(1);
  });
  it('JSON roto: dice línea y columna', () => {
    const e = errs('{\n "simulacros": [\n  {"titulo": "T",}\n ]\n}');
    expect(e[0]).toMatch(/no es un JSON válido/);
    expect(e[0]).toMatch(/línea 3/);
  });
  it('vacío o sin contenido', () => {
    expect(errs('   ')[0]).toMatch(/Pega primero/);
    expect(errs({ version: 1 })[0]).toMatch(/nada que importar/);
    expect(errs('[1,2]')[0]).toMatch(/debe empezar con/);
  });
  it('cleanJsonText deja el JSON intacto', () => {
    expect(cleanJsonText('{"a":1}')).toBe('{"a":1}');
  });
});

describe('parseImportJson: errores con ubicación', () => {
  it('tipo desconocido', () => {
    const e = errs(oneQ({ tipo: 'essay', enunciado: 'x' }));
    expect(e[0]).toMatch(/Simulacro 1 \(«T»\) › preguntas › Pregunta 1: "tipo" debe ser uno de: multiple_choice/);
  });
  it('multiple_choice: índice fuera de rango y texto en vez de número', () => {
    expect(errs(oneQ({ tipo: 'multiple_choice', enunciado: 'x', opciones: ['a', 'b'], correcta: 2 }))[0]).toMatch(/empezando en 0.*0 a 1/);
    expect(errs(oneQ({ tipo: 'multiple_choice', enunciado: 'x', opciones: ['a', 'b'], correcta: 'B' }))[0]).toMatch(/llegó "B"/);
    expect(errs(oneQ({ tipo: 'multiple_choice', enunciado: 'x', opciones: ['a'], correcta: 0 }))[0]).toMatch(/al menos 2/);
  });
  it('true_false con comillas', () => {
    expect(errs(oneQ({ tipo: 'true_false', enunciado: 'x', correcta: 'true' }))[0]).toMatch(/true o false, sin comillas/);
  });
  it('fill_blank: sin ___ y cantidad distinta de respuestas', () => {
    expect(errs(oneQ({ tipo: 'fill_blank', enunciado: 'sin hueco', correcta: 'a' }))[0]).toMatch(/___/);
    expect(errs(oneQ({ tipo: 'fill_blank', enunciado: 'a ___ b ___', correcta: 'a' }))[0]).toMatch(/2 espacio.*1 respuesta/);
  });
  it('fill_blank: un hueco con alternativas planas', () => {
    expect(ok(oneQ({ tipo: 'fill_blank', enunciado: 'I ___ it', correcta: ['saw', 'seen'] })).plan.looseExams[0].questions[0].answer).toEqual({ blanks: [['saw', 'seen']] });
  });
  it('order_words: palabras que no coinciden', () => {
    const e = errs(oneQ({ tipo: 'order_words', palabras: ['She', 'has', 'lived'], correcta: 'She has lived here' }));
    expect(e[0]).toMatch(/faltan en palabras: here/);
  });
  it('order_words: ya ordenadas se desordenan con aviso', () => {
    const r = ok(oneQ({ tipo: 'order_words', palabras: ['She', 'has', 'lived'], correcta: 'She has lived' }));
    expect(r.warnings.join()).toMatch(/ya en orden/);
    expect(r.plan.looseExams[0].questions[0].options!.map((o) => o.text)).toEqual(['has', 'lived', 'She']);
  });
  it('transform: forma inválida', () => {
    expect(errs(oneQ({ tipo: 'transform', original: 'a', forma: 'pasiva', correcta: 'b' }))[0]).toMatch(/afirmativa, negativa, interrogativa/);
  });
  it('lectura sin texto o sin preguntas', () => {
    const e = errs({ simulacros: [{ titulo: 'T', lecturas: [{ titulo: 'L', preguntas: [] }] }] });
    expect(e.join('\n')).toMatch(/Lectura 1: falta "texto"/);
    expect(e.join('\n')).toMatch(/al menos 1 pregunta/);
  });
  it('simulacro sin título o vacío', () => {
    expect(errs({ simulacros: [{ preguntas: [] }] })[0]).toMatch(/Simulacro 1: falta "titulo"/);
    expect(errs({ simulacros: [{ titulo: 'T' }] })[0]).toMatch(/no tiene preguntas ni lecturas/);
  });
  it('ficha incompleta y biblioteca sin nombre', () => {
    expect(errs({ fichas: [{ frente: 'a' }] })[0]).toBe('Ficha 1: falta "reverso".');
    expect(errs({ bibliotecas: [{}] })[0]).toBe('Biblioteca 1: falta "nombre".');
  });
  it('color inválido: aviso y color automático', () => {
    const r = ok({ bibliotecas: [{ nombre: 'X', color: 'azul', simulacros: [] }] });
    expect(r.warnings.join()).toMatch(/color/);
    expect(r.plan.folders[0].color).toMatch(/^#/);
  });
  it('limita la cantidad de errores mostrados', () => {
    const many = { fichas: Array.from({ length: 80 }, () => ({})) };
    expect(errs(many).length).toBeLessThanOrEqual(27);
  });
});

describe('ejemplo y guía de la pantalla', () => {
  it('el ejemplo del botón "Ver ejemplo" es válido y trae un tipo de cada uno', async () => {
    const { JSON_EXAMPLE } = await import('@/features/import/jsonPrompt');
    const r = ok(JSON_EXAMPLE);
    expect(r.summary.byType).toMatchObject({ multiple_choice: 2, true_false: 2, fill_blank: 1, order_words: 1, transform: 1 });
    expect(r.summary).toMatchObject({ folders: 1, exams: 1, readings: 1, cards: 1 });
    expect(r.warnings).toEqual([]);
  });
});
