// Selección de simulacros para el Super simulacro (sin pantalla ni base de datos, para poder probarla).

export interface PickableExam {
  id: string;
  question_count: number;
  /** Estrellas de dificultad (1 a 5); null o ausente = sin calificar. */
  difficulty?: number | null;
}

/** Segundos por pregunta que se suponen para calcular cuántas preguntas caben en el tiempo al autoseleccionar. */
export const PACE_SEC = 60;

/** Cuántas preguntas caben en `minutes` minutos al ritmo `paceSec` (mínimo 1). */
export const capacityFor = (minutes: number, paceSec: number = PACE_SEC): number => Math.max(1, Math.floor((minutes * 60) / paceSec));

/** Segundos que te tocan por pregunta, o null si no hay preguntas. */
export const secPerQuestion = (minutes: number, questions: number): number | null =>
  questions > 0 ? Math.round((minutes * 60) / questions) : null;

/** Recorre los simulacros en orden y se queda con los que caben en `capacity` preguntas. Si ninguno cabe, toma el primero. */
function fill(ordered: readonly PickableExam[], capacity: number): string[] {
  const usable = ordered.filter((e) => e.question_count > 0);
  const ids: string[] = [];
  let total = 0;
  for (const e of usable) {
    if (total + e.question_count <= capacity) {
      ids.push(e.id);
      total += e.question_count;
    }
  }
  if (!ids.length && usable.length) ids.push(usable[0].id);
  return ids;
}

const rated = (exams: readonly PickableExam[]) => exams.filter((e) => typeof e.difficulty === 'number');

/** Los más difíciles primero (los sin calificar no entran). A igual dificultad respeta el orden de la lista. */
export function pickHardest(exams: readonly PickableExam[], capacity: number): string[] {
  const sorted = rated(exams)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.difficulty as number) - (a.e.difficulty as number) || a.i - b.i)
    .map((x) => x.e);
  return fill(sorted, capacity);
}

/** Orden en que se reparte entre niveles: empieza por el medio para que el promedio quede cerca de 3. */
const BALANCED_ORDER = [3, 2, 4, 1, 5];

/** Mezcla niveles de dificultad por turnos (3, 2, 4, 1, 5, 3…) hasta llenar el tiempo. Los sin calificar no entran. */
export function pickBalanced(exams: readonly PickableExam[], capacity: number): string[] {
  const buckets = new Map<number, PickableExam[]>();
  for (const e of rated(exams)) {
    const d = e.difficulty as number;
    buckets.set(d, [...(buckets.get(d) ?? []), e]);
  }
  const ordered: PickableExam[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const d of BALANCED_ORDER) {
      const next = buckets.get(d)?.shift();
      if (next) {
        ordered.push(next);
        added = true;
      }
    }
  }
  return fill(ordered, capacity);
}
