import { norm } from './text';
import type { QType } from './importParser';

export interface Question {
  id: string;
  exam_id?: string; // simulacro al que pertenece (lo necesita el Repaso Rápido, que mezcla varios)
  type: QType;
  prompt: string;
  options: { id: string; text: string }[] | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answer: any;
  explanation?: string | null;
  imagen_url?: string | null;
  /** Lectura (texto) a la que pertenece la pregunta, si es de comprensión lectora. */
  reading_id?: string | null;
}

export type Response =
  | { type: 'multiple_choice'; selected: string[] }
  | { type: 'true_false'; value: boolean | null }
  | { type: 'fill_blank'; blanks: string[] }
  | { type: 'short_answer'; text: string }
  /** Ids de las palabras (opciones) en el orden en que el estudiante las puso. */
  | { type: 'order_words'; order: string[] };

function lev(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length][b.length];
}

// Ignora tildes/mayúsculas y tolera 1 error de tipeo en palabras largas
export const close = (expected: string, given: string) => {
  const a = norm(expected);
  const b = norm(given);
  if (!b) return false;
  return a === b || (a.length >= 6 && lev(a, b) <= 1);
};

export function checkAnswer(q: Question, r: Response): boolean {
  switch (r.type) {
    case 'multiple_choice':
      return [...r.selected].sort().join() === [...q.answer.correct].sort().join();
    case 'true_false':
      return r.value === q.answer.value;
    case 'fill_blank':
      return (q.answer.blanks as string[][]).every((alts, i) =>
        alts.some((a) => close(a, r.blanks[i] ?? '')),
      );
    case 'short_answer':
      return (q.answer.accepted as string[]).some((a) => close(a, r.text));
    case 'order_words': {
      // Se compara la oración armada con la correcta ignorando mayúsculas, tildes y puntuación
      const words = new Map((q.options ?? []).map((o) => [o.id, o.text]));
      const given = norm(r.order.map((id) => words.get(id) ?? '').join(' '));
      return (q.answer.accepted as string[]).some((a) => norm(a) === given);
    }
  }
}

export function correctText(q: Question): string {
  switch (q.type) {
    case 'multiple_choice':
      return q
        .options!.filter((o) => q.answer.correct.includes(o.id))
        .map((o) => o.text)
        .join(' · ');
    case 'true_false':
      return q.answer.value ? 'Verdadero' : 'Falso';
    case 'fill_blank':
      return (q.answer.blanks as string[][]).map((b) => b[0]).join(' · ');
    default:
      return q.answer.accepted?.[0] ?? '';
  }
}
