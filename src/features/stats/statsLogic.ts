// Cálculos de la pantalla de estadísticas (sin pantalla ni base de datos, para poder probarlos).

export type Range = '7d' | '30d' | 'all';
export const RANGES: { id: Range; label: string }[] = [
  { id: '7d', label: 'Última semana' },
  { id: '30d', label: 'Último mes' },
  { id: 'all', label: 'Todo el tiempo' },
];

/** Fecha desde la que se cuentan los datos (null = sin límite). */
export function rangeStart(range: Range, now = new Date()): string | null {
  if (range === 'all') return null;
  const d = new Date(now);
  d.setDate(d.getDate() - (range === '7d' ? 7 : 30));
  return d.toISOString();
}

export interface AnswerRow {
  question_id: string | null;
  is_correct: boolean;
  questions: { prompt: string; exams: { title: string; folder_id: string | null } | null } | null;
}

export interface BarItem {
  name: string;
  answered: number;
  correct: number;
  pct: number;
}

export const NO_LIBRARY = 'Sin biblioteca';

/** % de aciertos por biblioteca (carpeta). Las más practicadas primero; empates por nombre. */
export function accuracyByLibrary(rows: AnswerRow[], folders: { id: string; name: string }[]): BarItem[] {
  const names = new Map(folders.map((f) => [f.id, f.name]));
  const acc = new Map<string, { answered: number; correct: number }>();
  for (const r of rows) {
    const fid = r.questions?.exams?.folder_id;
    const name = (fid && names.get(fid)) || NO_LIBRARY;
    const a = acc.get(name) ?? { answered: 0, correct: 0 };
    a.answered++;
    if (r.is_correct) a.correct++;
    acc.set(name, a);
  }
  return [...acc.entries()]
    .map(([name, a]) => ({ name, ...a, pct: Math.round((100 * a.correct) / a.answered) }))
    .sort((x, y) => y.answered - x.answered || x.name.localeCompare(y.name));
}

export interface FailedItem {
  questionId: string;
  prompt: string;
  exam: string;
  wrong: number;
  answered: number;
}

/** Las preguntas con más fallos (solo las que se han fallado al menos una vez). */
export function mostFailed(rows: AnswerRow[], limit = 10): FailedItem[] {
  const acc = new Map<string, FailedItem>();
  for (const r of rows) {
    if (!r.question_id || !r.questions) continue;
    const it = acc.get(r.question_id) ?? {
      questionId: r.question_id,
      prompt: r.questions.prompt,
      exam: r.questions.exams?.title ?? '',
      wrong: 0,
      answered: 0,
    };
    it.answered++;
    if (!r.is_correct) it.wrong++;
    acc.set(r.question_id, it);
  }
  return [...acc.values()]
    .filter((x) => x.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.wrong / b.answered - a.wrong / a.answered || a.prompt.localeCompare(b.prompt))
    .slice(0, limit);
}

export interface AttemptPoint {
  id: string;
  score: number;
  finished_at: string;
  title: string;
}

/** Los últimos `limit` intentos, del más antiguo al más reciente (para dibujar la línea de izquierda a derecha). */
export function lastAttempts(rows: { id: string; score: number | string | null; finished_at: string | null; total: number; exams: { title: string } | null; mode?: string }[], limit = 10): AttemptPoint[] {
  return rows
    .filter((r) => r.finished_at && r.total > 0 && r.score != null)
    .sort((a, b) => b.finished_at!.localeCompare(a.finished_at!))
    .slice(0, limit)
    .reverse()
    .map((r) => ({
      id: r.id,
      score: Math.round(Number(r.score)),
      finished_at: r.finished_at!,
      title: r.mode === 'quick_review' ? 'Repaso Rápido' : r.mode === 'surprise' ? 'Simulacro Sorpresa' : r.mode === 'super' ? 'Super simulacro' : (r.exams?.title ?? 'Simulacro eliminado'),
    }));
}

/** Diferencia entre el último intento y el promedio de los anteriores (null si no hay con qué comparar). */
export function trend(points: AttemptPoint[]): number | null {
  if (points.length < 2) return null;
  const prev = points.slice(0, -1);
  const avg = prev.reduce((a, p) => a + p.score, 0) / prev.length;
  return Math.round(points[points.length - 1].score - avg);
}
