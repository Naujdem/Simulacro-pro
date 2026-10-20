import type { Question, Response } from '@/lib/grading';
import type { EditableQuestion } from '@/features/exams/api';

/*
 * Editar una pregunta mientras se practica: pasar de Question a lo que edita el formulario y volver, y ajustar la
 * respuesta que el estudiante ya tenía puesta para que siga teniendo sentido con la pregunta editada.
 */

export const toEditable = (q: Question): EditableQuestion => ({
  id: q.id,
  type: q.type,
  prompt: q.prompt,
  options: q.options,
  answer: q.answer,
  explanation: q.explanation ?? null,
  imagen_url: q.imagen_url ?? null,
});

/** La pregunta de la sesión con los cambios ya guardados (conserva sección, lectura y simulacro de origen). */
export const applyEdit = (q: Question, e: EditableQuestion): Question => ({
  ...q,
  prompt: e.prompt.trim(),
  options: e.options,
  answer: e.answer,
  explanation: e.explanation?.trim() || null,
  imagen_url: e.imagen_url || null,
});

/**
 * Adapta la respuesta puesta (marcada o escrita) a la pregunta editada: quita las opciones que ya no existen,
 * ajusta la cantidad de espacios en blanco, etc. Así, si corriges cuál era la correcta, tu respuesta se conserva
 * y se vuelve a calificar con la clave nueva.
 */
export function reconcileResponse(r: Response, q: Question): Response {
  const ids = new Set((q.options ?? []).map((o) => o.id));
  switch (r.type) {
    case 'multiple_choice':
      return { ...r, selected: r.selected.filter((id) => ids.has(id)) };
    case 'order_words':
      return ids.size && r.order.every((id) => ids.has(id)) ? r : { ...r, order: r.order.filter((id) => ids.has(id)) };
    case 'fill_blank': {
      const slots = (q.prompt.match(/\{\{\d+\}\}/g) ?? []).length;
      return { ...r, blanks: Array.from({ length: slots }, (_, i) => r.blanks[i] ?? '') };
    }
    default:
      return r;
  }
}
