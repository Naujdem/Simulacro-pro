// Selección de preguntas del Simulacro Sorpresa (sin pantalla ni base de datos, para poder probarla).

/** Mezcla Fisher-Yates (no modifica la lista original). `rng` se puede fijar en las pruebas. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Elige `n` preguntas al azar (todas si hay menos). */
export function pickRandom<T>(items: readonly T[], n: number, rng: () => number = Math.random): T[] {
  return shuffle(items, rng).slice(0, Math.max(0, n));
}

/** Preguntas disponibles en las bibliotecas elegidas (suma de `question_count` de sus simulacros). */
export function availableQuestions(
  exams: { folder_id: string | null; question_count: number }[],
  folderIds: ReadonlySet<string>,
): number {
  return exams.filter((e) => e.folder_id && folderIds.has(e.folder_id)).reduce((a, e) => a + e.question_count, 0);
}

/** Bibliotecas mínimas que hay que elegir: 2, o 1 si el usuario solo tiene una. */
export const minLibraries = (libraryCount: number) => Math.min(2, Math.max(1, libraryCount));
