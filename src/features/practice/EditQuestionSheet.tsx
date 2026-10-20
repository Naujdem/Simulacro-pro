import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Question } from '@/lib/grading';
import { updateQuestion, type EditableQuestion } from '@/features/exams/api';
import { QuestionEditor, clean, problem } from '@/features/exams/EditExamPage';
import { applyEdit, toEditable } from './editSync';

interface Props {
  /** La pregunta ORIGINAL (con sus opciones en el orden guardado, no mezcladas). */
  question: Question;
  /** Simulacro al que pertenece la pregunta (en el Repaso Rápido es el de origen). */
  examId: string;
  onClose: () => void;
  /** Se llama con la pregunta ya guardada, para que la sesión use la versión nueva. */
  onSaved: (q: Question) => void;
}

/** Panel para corregir una pregunta sin salir de la práctica. Guarda solo esa pregunta, directo en el simulacro. */
export default function EditQuestionSheet({ question, examId, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const [initial] = useState(() => JSON.stringify(toEditable(question)));
  const [q, setQ] = useState<EditableQuestion>(() => toEditable(question));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(q) !== initial;

  const close = () => {
    if (saving) return;
    if (!dirty || confirm('¿Descartar los cambios sin guardar?')) onClose();
  };

  async function save() {
    const issue = problem(q);
    if (issue) {
      setError(`Corrige esto antes de guardar: ${issue}`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const cleaned = clean(q);
      await updateQuestion(cleaned);
      // El formulario de "Editar simulacro" y las listas que muestran esta pregunta deben volver a leerla
      qc.removeQueries({ queryKey: ['exam-edit', examId] });
      void qc.invalidateQueries({ queryKey: ['exam-wrong'] });
      void qc.invalidateQueries({ queryKey: ['review-entries'] });
      onSaved(applyEdit(question, cleaned));
      onClose();
    } catch (e) {
      setError(`${(e as Error).message || 'No se pudo guardar.'} Revisa tu conexión e inténtalo de nuevo.`);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Editar pregunta">
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl bg-slate-50 shadow-xl sm:rounded-3xl dark:bg-slate-900">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-lg font-bold">Editar pregunta</h2>
          <button type="button" onClick={close} aria-label="Cerrar" className="px-2 text-2xl text-slate-400">
            ✕
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <p className="text-xs text-slate-500">
            Los cambios se guardan en el simulacro (no solo en esta sesión). Aquí las opciones salen en su orden original.
          </p>
          <QuestionEditor index={0} heading="Esta pregunta" d={{ key: question.id, q }} onPatch={(p) => setQ((cur) => ({ ...cur, ...p }))} />
          {error && (
            <p role="alert" className="whitespace-pre-line text-sm font-bold text-red-600">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-3 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-700">
          <button type="button" onClick={close} disabled={saving} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
