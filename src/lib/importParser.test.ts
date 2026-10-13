import { describe, expect, it } from 'vitest';
import { parseQuestions } from './importParser';
import { checkAnswer } from './grading';

describe('parseQuestions', () => {
  it('Formato 1: opción múltiple + V/F', () => {
    const r = parseQuestions(`1. ¿Cuál es la capital de Francia?
A) Madrid
B) París
C) Roma
D) Berlín
Respuesta: B

2. Las plantas absorben dióxido de carbono.
Verdadero`);
    expect(r).toHaveLength(2);
    expect(r[0].type).toBe('multiple_choice');
    expect(r[0].options).toHaveLength(4);
    expect(r[0].answer).toEqual({ correct: ['b'] });
    expect(r[0].confidence).toBe(1);
    expect(r[1].type).toBe('true_false');
    expect(r[1].answer).toEqual({ value: true });
  });

  it('Formato 2: Pregunta / Opciones / Correcta', () => {
    const r = parseQuestions(`Pregunta: ¿Cuál es la capital de Francia?
Opciones: Madrid | París | Roma | Berlín
Correcta: París`);
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('multiple_choice');
    expect(r[0].answer).toEqual({ correct: ['b'] });
  });

  it('completar espacios con alternativas', () => {
    const r = parseQuestions(`1. La capital de Francia es ___.
Respuesta: París/Paris`);
    expect(r[0].type).toBe('fill_blank');
    expect(r[0].prompt).toContain('{{1}}');
    expect(r[0].answer).toEqual({ blanks: [['París', 'Paris']] });
  });

  it('respuesta corta y explicación', () => {
    const r = parseQuestions(`1. ¿Cómo se llama el proceso por el que las plantas producen glucosa?
Respuesta: fotosíntesis
Explicación: Usa luz solar, agua y CO2.`);
    expect(r[0].type).toBe('short_answer');
    expect(r[0].answer).toEqual({ accepted: ['fotosíntesis'] });
    expect(r[0].explanation).toMatch(/luz solar/);
  });

  it('Explicación opcional: opción múltiple (formato 1)', () => {
    const r = parseQuestions(`1. ¿Cuál es la capital de Francia?
A) Madrid
B) París
C) Roma
D) Berlín
Respuesta: B
Explicación: París es una ciudad francesa

2. ¿Cuál es la capital de Italia?
A) Madrid
B) París
C) Roma
D) Berlín
Respuesta: C`);
    expect(r).toHaveLength(2);
    expect(r[0].options).toHaveLength(4);
    expect(r[0].answer).toEqual({ correct: ['b'] });
    expect(r[0].explanation).toBe('París es una ciudad francesa');
    expect(r[0].confidence).toBe(1);
    // sin explicación no pasa nada
    expect(r[1].explanation).toBeUndefined();
    expect(r[1].confidence).toBe(1);
  });

  it('Explicación opcional: verdadero/falso', () => {
    const r = parseQuestions(`2. Las plantas absorben dióxido de carbono.
Verdadero
Explicación: Lo usan en la fotosíntesis.`);
    expect(r[0].type).toBe('true_false');
    expect(r[0].answer).toEqual({ value: true });
    expect(r[0].explanation).toBe('Lo usan en la fotosíntesis.');
  });

  it('Explicación opcional: formato Pregunta / Opciones / Correcta', () => {
    const r = parseQuestions(`Pregunta: ¿Cuál es la capital de Italia?
Opciones: Madrid | París | Roma | Berlín
Correcta: Roma
Explicación: Roma es la capital desde 1871.`);
    expect(r[0].type).toBe('multiple_choice');
    expect(r[0].answer).toEqual({ correct: ['c'] });
    expect(r[0].explanation).toBe('Roma es la capital desde 1871.');
  });

  it('la explicación puede ocupar varias líneas sin confundirse con opciones', () => {
    const r = parseQuestions(`1. ¿Cuál es la capital de Francia?
A) Madrid
B) París
Respuesta: B
Explicación: París es la capital.
A. diferencia de Madrid, está en Francia.`);
    expect(r[0].options).toHaveLength(2);
    expect(r[0].explanation).toBe('París es la capital. A. diferencia de Madrid, está en Francia.');
  });

  it('Explicación con el texto en la línea de abajo', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid
B) París
Respuesta: B
Explicación:
París es la capital de Francia.
Es la sede del gobierno.`);
    expect(r).toHaveLength(1);
    expect(r[0].answer).toEqual({ correct: ['b'] });
    expect(r[0].confidence).toBe(1);
    expect(r[0].explanation).toBe('París es la capital de Francia. Es la sede del gobierno.');
  });

  it('una lista numerada dentro de la explicación no crea preguntas nuevas', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid
B) París
Respuesta: B
Explicación: Hay dos razones:
1. Es la sede del gobierno.
2. Es la ciudad más grande.`);
    expect(r).toHaveLength(1);
    expect(r[0].answer).toEqual({ correct: ['b'] });
    expect(r[0].explanation).toBe('Hay dos razones: 1. Es la sede del gobierno. 2. Es la ciudad más grande.');
  });

  it('tras una explicación con lista, la pregunta siguiente sí se separa', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid
B) París
Respuesta: B
Explicación: Hay dos razones:
1. Es la sede del gobierno.
2. Es la ciudad más grande.

2. ¿Capital de Italia?
A) Roma
B) Lisboa
Respuesta: A

3. Las plantas absorben CO2.
Verdadero
Explicación: Lo usan al hacer fotosíntesis.

Pregunta: La capital de Perú es ___.
Respuesta: Lima`);
    expect(r).toHaveLength(4);
    expect(r[0].explanation).toContain('2. Es la ciudad más grande.');
    expect(r[1].answer).toEqual({ correct: ['a'] });
    expect(r[1].explanation).toBeUndefined();
    expect(r[2].type).toBe('true_false');
    expect(r[2].explanation).toBe('Lo usan al hacer fotosíntesis.');
    expect(r[3].type).toBe('fill_blank');
  });

  it('multi-selección', () => {
    const r = parseQuestions(`1. Son planetas:
A) Marte
B) Luna
C) Venus
Respuesta: A, C`);
    expect(r[0].answer).toEqual({ correct: ['a', 'c'] });
  });

  it('marca baja confianza si falta la respuesta', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid
B) París`);
    expect(r[0].confidence).toBeLessThan(0.6);
    expect(r[0].warnings.length).toBeGreaterThan(0);
  });

  it('ignora números de página', () => {
    const r = parseQuestions(`1. Pregunta uno?
A) x
B) y
Respuesta: A
Página 2
2. Pregunta dos?
A) x
B) y
Respuesta: B`);
    expect(r).toHaveLength(2);
  });

  describe('enunciado con lista numerada', () => {
    const Q109 = `109. Las siguientes acciones corresponden a este tipo de situaciones que sean constitutivas de presuntos delitos contra la libertad, integridad y formación sexual, referidos en el título IV del libro II de la Ley 599 de 2000 o cuando constituyen cualquier otro delito en la Ley Penal Colombiana vigente. Entre otras se mencionan las siguientes:
1. Agredir físicamente causando lesiones e incapacidad a cualquier miembro de la comunidad educativa.
2. Vender, distribuir o presionar la adquisición o consumo de sustancias psicoactivas o restringidas por la Ley.
3. Pertenecer o conformar grupos de pandillas delincuenciales u otras que atenten contra el bienestar de la comunidad educativa.
4. Amenazas a compañeros, docentes, directivas o cualquier miembro de la comunidad educativa a través de cualquier miembro.
5. Portar, suministrar o utilizar cualquier tipo de arma o artefacto que afecte la integridad física o psicológica de cualquier miembro de la Comunidad Educativa.
6. Utilizar elementos detonantes, sustancias químicas u otras que sean empleadas con el propósito de causar daño o alterar la convivencia pacífica.
7. Cometer conducta sexual abusiva con cualquier miembro de la comunidad educativa.
8. Participar o realizar adulteración en documentos, firmas, daño o desaparición de notas en planillas, o el sabotaje de material para impedir una evaluación o un resultado final.
9. Fomentar, incentivar y conformar grupos que atenten contra la integridad moral, física, la libertad de culto, la diversidad sexual y la discriminación racial de los integrantes de la comunidad educativa en forma escrita, oral, presencial y virtual.
10. Portar, mostrar, publicar o manejar cualquier tipo de material pornográfico o realizar conductas que atenten contra el pudor y la integridad de los miembros de la comunidad educativa.
A) tipo I
B) tipo I y II
C) tipo II
D) tipo III
Respuesta: D
Explicación: Todas estas acciones corresponden a faltas Tipo III, ya que son constitutivas de presuntos delitos contra la libertad, integridad y formación sexual, o cualquier otro delito en la Ley Penal Colombiana vigente.`;

    it('la lista dentro del enunciado no se parte en preguntas', () => {
      const r = parseQuestions(Q109);
      expect(r).toHaveLength(1);
      expect(r[0].type).toBe('multiple_choice');
      expect(r[0].options).toHaveLength(4);
      expect(r[0].answer).toEqual({ correct: ['d'] });
      expect(r[0].confidence).toBe(1);
      expect(r[0].explanation).toMatch(/^Todas estas acciones/);
    });

    it('conserva la lista completa en el enunciado, un ítem por línea', () => {
      const [q] = parseQuestions(Q109);
      const lines = q.prompt.split('\n');
      expect(lines).toHaveLength(11); // intro + 10 ítems
      expect(lines[0]).toMatch(/^Las siguientes acciones .* las siguientes:$/);
      expect(lines[1]).toMatch(/^1\. Agredir/);
      expect(lines[10]).toMatch(/^10\. Portar, mostrar/);
    });

    it('la pregunta siguiente sí se separa y la numeración que reinicia no la confunde', () => {
      const r = parseQuestions(`${Q109}

110. ¿Cuál es la capital de Francia?
A) Madrid
B) París
Respuesta: B

111. Marque lo correcto:
1. Uno
2. Dos
A) x
B) y
Respuesta: A`);
      expect(r).toHaveLength(3);
      expect(r[1].prompt).toBe('¿Cuál es la capital de Francia?');
      expect(r[1].answer).toEqual({ correct: ['b'] });
      expect(r[2].prompt.split('\n')).toHaveLength(3);
      expect(r[2].answer).toEqual({ correct: ['a'] });
    });

    it('lista que empieza en 1 dentro de la pregunta 1', () => {
      const r = parseQuestions(`1. Marque lo correcto:
1. Uno
2. Dos
A) x
B) y
Respuesta: B

2. ¿Otra?
A) m
B) n
Respuesta: A`);
      expect(r).toHaveLength(2);
      expect(r[0].prompt.split('\n')).toHaveLength(3);
      expect(r[0].answer).toEqual({ correct: ['b'] });
      expect(r[1].answer).toEqual({ correct: ['a'] });
    });

    it('preguntas numeradas seguidas sin opciones ni respuesta siguen separándose', () => {
      const r = parseQuestions(`1. ¿Pregunta uno?
2. ¿Pregunta dos?
3. ¿Pregunta tres?`);
      expect(r).toHaveLength(3);
    });

    it('una pregunta sin respuesta no se come a la siguiente', () => {
      const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid
B) París

2. ¿Capital de Italia?
A) Roma
B) Lisboa
Respuesta: A`);
      expect(r).toHaveLength(2);
      expect(r[0].confidence).toBeLessThan(0.6);
      expect(r[1].answer).toEqual({ correct: ['a'] });
    });
  });

  it('líneas en blanco dentro de una sola pregunta no la parten', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?

A) Madrid
B) París

Respuesta: B`);
    expect(r).toHaveLength(1);
    expect(r[0].options).toHaveLength(2);
    expect(r[0].answer).toEqual({ correct: ['b'] });
  });

  it('ignora las cercas de código (\`\`\`) del texto pegado', () => {
    const r = parseQuestions(`\`\`\`
1. ¿Capital de Francia?
A) Madrid
B) París
Respuesta: B
\`\`\``);
    expect(r).toHaveLength(1);
    expect(r[0].prompt).toBe('¿Capital de Francia?');
    expect(r[0].answer).toEqual({ correct: ['b'] });
  });

  it('opciones en una sola línea', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid B) París C) Roma D) Berlín
Respuesta: B`);
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('multiple_choice');
    expect(r[0].options?.map((o) => o.text)).toEqual(['Madrid', 'París', 'Roma', 'Berlín']);
    expect(r[0].answer).toEqual({ correct: ['b'] });
  });

  it('no parte una opción cuyo texto menciona letras no consecutivas', () => {
    const r = parseQuestions(`1. ¿Cuál plan?
A) Plan A. y también el plan B. de ahorro
B) Ninguno
Respuesta: A`);
    expect(r[0].options).toHaveLength(2);
    expect(r[0].options?.[0].text).toBe('Plan A. y también el plan B. de ahorro');
  });

  it('reconoce "Rta:" y "Resp.:" como respuesta', () => {
    for (const marca of ['Rta: B', 'Resp.: B', 'Clave: B']) {
      const r = parseQuestions(`1. ¿Capital de Francia?\nA) Madrid\nB) París\n${marca}`);
      expect(r[0].answer).toEqual({ correct: ['b'] });
      expect(r[0].confidence).toBe(1);
    }
  });

  it('una lista a) b) en el enunciado no se confunde con las opciones A) B) C)', () => {
    const r = parseQuestions(`1. Considere las afirmaciones:
a) El sol es una estrella.
b) La luna es una estrella.
Son correctas:
A) solo a
B) solo b
C) a y b
Respuesta: A`);
    expect(r).toHaveLength(1);
    expect(r[0].options?.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(r[0].options?.[0].text).toBe('solo a');
    expect(r[0].prompt).toMatch(/^Considere las afirmaciones:\na\) El sol es una estrella\.\nb\) La luna/);
    expect(r[0].answer).toEqual({ correct: ['a'] });
  });

  it('lista con números romanos en el enunciado: un ítem por línea', () => {
    const r = parseQuestions(`1. Considere las afirmaciones:
I. El sol es una estrella.
II. La luna es una estrella.
Son correctas:
A. solo I
B. solo II
C. I y II
Respuesta: A`);
    expect(r).toHaveLength(1);
    expect(r[0].prompt.split('\n')).toEqual([
      'Considere las afirmaciones:',
      'I. El sol es una estrella.',
      'II. La luna es una estrella. Son correctas:',
    ]);
    expect(r[0].options).toHaveLength(3);
  });
});

describe('checkAnswer', () => {
  it('tolera tildes, mayúsculas y un error de tipeo', () => {
    const q = { id: '1', type: 'short_answer' as const, prompt: '', options: null, answer: { accepted: ['fotosíntesis'] } };
    expect(checkAnswer(q, { type: 'short_answer', text: 'Fotosintesis' })).toBe(true);
    expect(checkAnswer(q, { type: 'short_answer', text: 'fotosintesys' })).toBe(true);
    expect(checkAnswer(q, { type: 'short_answer', text: 'respiración' })).toBe(false);
  });

  it('multiple_choice exige el conjunto exacto', () => {
    const q = { id: '1', type: 'multiple_choice' as const, prompt: '', options: [], answer: { correct: ['a', 'c'] } };
    expect(checkAnswer(q, { type: 'multiple_choice', selected: ['c', 'a'] })).toBe(true);
    expect(checkAnswer(q, { type: 'multiple_choice', selected: ['a'] })).toBe(false);
  });
});
