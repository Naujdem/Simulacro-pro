import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QType } from '@/lib/importParser';
import { fetchExamForEdit, saveExamEdits, type EditableQuestion } from './api';

// Cada pregunta del formulario lleva una "key" propia para que React no se confunda al borrar o agregar.
type Draft = { key: string; q: EditableQuestion };

const TYPE_LABEL: Record<QType, string> = {
  multiple_choice: 'Opción múltiple',
  true_false: 'Verdadero / Falso',
  fill_blank: 'Completar espacios',
  short_answer: 'Respuesta corta',
};

const LETTERS = 'abcdefghij'.split('');

let counter = 0;
const newKey = () => `new-${Date.now()}-${counter++}`;

const blankQuestion = (type: QType): EditableQuestion => {
  const base = { id: null, type, prompt: '', explanation: null };
  switch (type) {
    case 'multiple_choice':
      return { ...base, options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: '' })), answer: { correct: [] } };
    case 'true_false':
      return { ...base, options: null, answer: { value: true } };
    case 'fill_blank':
      return { ...base, options: null, answer: { blanks: [] } };
    default:
      return { ...base, options: null, answer: { accepted: [] } };
  }
};

// Devuelve el problema de la pregunta, o null si está bien.
const problem = (q: EditableQuestion): string | null => {
  if (!q.prompt.trim()) return 'falta el enunciado.';
  switch (q.type) {
    case 'multiple_choice': {
      const filled = (q.options ?? []).filter((o) => o.text.trim());
      const correct = (q.answer?.correct ?? []) as string[];
      if (filled.length < 2) return 'necesita al menos 2 opciones con texto.';
      if (!correct.some((id) => filled.some((o) => o.id === id))) return 'marca al menos una respuesta correcta.';
      return null;
    }
    case 'true_false':
      return typeof q.answer?.value === 'boolean' ? null : 'elige Verdadero o Falso.';
    case 'fill_blank': {
      const blanks = (q.answer?.blanks ?? []) as string[][];
      const slots = (q.prompt.match(/\{\{\d+\}\}/g) ?? []).length;
      if (!slots) return 'escribe {{1}} en el enunciado donde va el espacio.';
      if (blanks.length !== slots)
        return `el enunciado tiene ${slots} espacio(s) pero hay ${blanks.length} respuesta(s) (sepáralas con ;).`;
      return null;
    }
    default:
      return ((q.answer?.accepted ?? []) as string[]).length ? null : 'escribe al menos una respuesta aceptada.';
  }
};

// Limpia la pregunta antes de guardar: quita opciones vacías y respuestas correctas que ya no existen.
const clean = (q: EditableQuestion): EditableQuestion => {
  if (q.type !== 'multiple_choice') return q;
  const opts = (q.options ?? []).filter((o) => o.text.trim()).map((o) => ({ id: o.id, text: o.text.trim() }));
  const correct = ((q.answer?.correct ?? []) as string[]).filter((id) => opts.some((o) => o.id === id));
  return { ...q, options: opts, answer: { correct } };
};

export default function EditExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const data = useQuery({
    queryKey: ['exam-edit', examId],
    queryFn: () => fetchExamForEdit(examId!),
    enabled: !!examId,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  });

  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newType, setNewType] = useState<QType>('multiple_choice');

  // Copia los datos de Supabase al formulario una sola vez
  useEffect(() => {
    if (!data.data || loaded) return;
    const { exam, questions } = data.data;
    setTitle(exam.title);
    setSubject(exam.subject ?? '');
    setDescription(exam.description ?? '');
    setDrafts(questions.map((q) => ({ key: q.id!, q })));
    setLoaded(true);
  }, [data.data, loaded]);

  const patch = (key: string, p: Partial<EditableQuestion>) => {
    setDrafts((xs) => xs.map((d) => (d.key === key ? { ...d, q: { ...d.q, ...p } } : d)));
    setDirty(true);
  };

  const removeQuestion = (d: Draft) => {
    if (
      d.q.id &&
      !confirm(
        'Al guardar se eliminará esta pregunta y también la etiqueta (Mal/Ok/Bien/Excelente) que le pusiste. ¿Continuar?',
      )
    )
      return;
    if (d.q.id) setDeleted((xs) => [...xs, d.q.id!]);
    setDrafts((xs) => xs.filter((x) => x.key !== d.key));
    setDirty(true);
  };

  const addQuestion = () => {
    setDrafts((xs) => [...xs, { key: newKey(), q: blankQuestion(newType) }]);
    setDirty(true);
  };

  const cancel = () => {
    if (!dirty || confirm('¿Descartar los cambios sin guardar?')) nav(-1);
  };

  async function save() {
    setError('');
    if (!title.trim()) {
      setError('El título no puede estar vacío.');
      return;
    }
    if (!drafts.length) {
      setError('El simulacro debe tener al menos una pregunta.');
      return;
    }
    const bad = drafts.map((d, i) => ({ i, p: problem(d.q) })).filter((x) => x.p);
    if (bad.length) {
      setError(bad.map((b) => `Pregunta ${b.i + 1}: ${b.p}`).join('\n'));
      return;
    }

    setSaving(true);
    try {
      await saveExamEdits(
        examId!,
        { title, subject, description },
        drafts.map((d) => clean(d.q)),
        deleted,
      );
      qc.removeQueries({ queryKey: ['exam-edit', examId] });
      await qc.invalidateQueries({ queryKey: ['exams'] });
      nav(-1);
    } catch (e) {
      setError(
        `${(e as Error).message || 'No se pudo guardar.'}\nRevisa tu conexión. Si habías agregado preguntas nuevas, sal y vuelve a abrir el simulacro antes de reintentar, para no duplicarlas.`,
      );
      setSaving(false);
    }
  }

  const field =
    'w-full rounded-xl border-2 border-slate-200 bg-transparent p-3 outline-none focus:border-sky-400 dark:border-slate-700';

  if (data.isError) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-slate-500">No se pudo cargar este simulacro.</p>
        <button onClick={() => nav(-1)} className="font-bold text-sky-600">
          Volver
        </button>
      </div>
    );
  }

  if (!loaded) return <p className="p-6">Cargando…</p>;

  return (
    <div className="space-y-4 p-4 pb-28">
      <header className="flex items-center gap-3">
        <button onClick={cancel} className="rounded-xl px-2 py-1 text-lg" aria-label="Volver">
          ←
        </button>
        <h1 className="text-2xl font-extrabold">Editar simulacro</h1>
      </header>

      <input className={field} placeholder="Título" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={field}
          placeholder="Tema / asignatura"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
        />
        <input
          className={field}
          placeholder="Descripción (opcional)"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
        />
      </div>

      <p className="text-sm font-bold text-slate-500">
        {drafts.length} {drafts.length === 1 ? 'pregunta' : 'preguntas'}
      </p>

      {drafts.map((d, i) => (
        <QuestionEditor key={d.key} index={i} d={d} onPatch={(p) => patch(d.key, p)} onRemove={() => removeQuestion(d)} />
      ))}

      <div className="flex gap-2">
        <select
          className="flex-1 rounded-2xl border-2 bg-transparent px-3 py-3 text-sm font-bold dark:border-slate-700"
          value={newType}
          onChange={(e) => setNewType(e.target.value as QType)}
        >
          {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <button onClick={addQuestion} className="rounded-2xl border-2 border-dashed px-4 py-3 text-sm font-bold text-slate-500">
          + Agregar pregunta
        </button>
      </div>

      {error && <p className="whitespace-pre-line rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={cancel} disabled={saving} className="rounded-2xl border-2 py-4 font-bold disabled:opacity-50">
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-2xl bg-green-500 py-4 font-extrabold uppercase text-white disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

// Campo de texto que conserva lo que escribes tal cual (para poder teclear "|", ";" y "/" sin que se borren).
function RawInput({
  initial,
  placeholder,
  onParsed,
  className,
}: {
  initial: string;
  placeholder: string;
  onParsed: (raw: string) => void;
  className: string;
}) {
  const [raw, setRaw] = useState(initial);
  return (
    <input
      className={className}
      value={raw}
      placeholder={placeholder}
      onChange={(e) => {
        setRaw(e.target.value);
        onParsed(e.target.value);
      }}
    />
  );
}

function QuestionEditor({
  index,
  d,
  onPatch,
  onRemove,
}: {
  index: number;
  d: Draft;
  onPatch: (p: Partial<EditableQuestion>) => void;
  onRemove: () => void;
}) {
  const q = d.q;
  const f = 'w-full rounded-lg border bg-transparent p-2 text-sm outline-none focus:border-sky-400 dark:border-slate-600';
  const opts = q.options ?? [];
  const correct = (q.answer?.correct ?? []) as string[];
  const issue = problem(q);

  const addOption = () => {
    const id = LETTERS.find((l) => !opts.some((o) => o.id === l));
    if (!id) return;
    onPatch({ options: [...opts, { id, text: '' }] });
  };

  return (
    <div
      className={`space-y-2 rounded-2xl border-l-4 bg-white p-3 shadow-sm dark:bg-slate-800 ${
        issue ? 'border-amber-400' : 'border-green-400'
      }`}
    >
      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
        <span>
          Pregunta {index + 1} · {TYPE_LABEL[q.type]}
          {!q.id && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">nueva</span>}
        </span>
        <button onClick={onRemove} aria-label="Eliminar pregunta" className="text-red-500">
          Eliminar
        </button>
      </div>

      <textarea
        className={f}
        rows={3}
        value={q.prompt}
        onChange={(e) => onPatch({ prompt: e.target.value })}
        placeholder="Enunciado"
      />
      {q.type === 'fill_blank' && (
        <p className="text-xs text-slate-500">Escribe {'{{1}}'}, {'{{2}}'}… en el enunciado donde van los espacios.</p>
      )}

      {q.type === 'multiple_choice' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Marca ✔ la(s) respuesta(s) correcta(s).</p>
          {opts.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Opción ${o.id.toUpperCase()} es correcta`}
                checked={correct.includes(o.id)}
                onChange={(e) =>
                  onPatch({
                    answer: { correct: e.target.checked ? [...correct, o.id] : correct.filter((x) => x !== o.id) },
                  })
                }
              />
              <span className="w-5 text-sm font-bold uppercase">{o.id}</span>
              <input
                className={f}
                value={o.text}
                placeholder={`Opción ${o.id.toUpperCase()}`}
                onChange={(e) => onPatch({ options: opts.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })}
              />
              {opts.length > 2 && (
                <button
                  aria-label={`Quitar opción ${o.id.toUpperCase()}`}
                  className="px-1 text-slate-400"
                  onClick={() =>
                    onPatch({
                      options: opts.filter((x) => x.id !== o.id),
                      answer: { correct: correct.filter((x) => x !== o.id) },
                    })
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {opts.length < LETTERS.length && (
            <button onClick={addOption} className="text-sm font-bold text-sky-600">
              + Agregar opción
            </button>
          )}
        </div>
      )}

      {q.type === 'true_false' && (
        <select
          className={f}
          value={String(q.answer?.value)}
          onChange={(e) => onPatch({ answer: { value: e.target.value === 'true' } })}
        >
          <option value="true">Verdadero</option>
          <option value="false">Falso</option>
        </select>
      )}

      {q.type === 'short_answer' && (
        <RawInput
          className={f}
          placeholder="Respuestas aceptadas (separa con |)"
          initial={((q.answer?.accepted ?? []) as string[]).join(' | ')}
          onParsed={(raw) =>
            onPatch({
              answer: {
                accepted: raw
                  .split('|')
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            })
          }
        />
      )}

      {q.type === 'fill_blank' && (
        <RawInput
          className={f}
          placeholder="Respuestas por espacio (; entre espacios, / alternativas)"
          initial={((q.answer?.blanks ?? []) as string[][]).map((b) => b.join('/')).join('; ')}
          onParsed={(raw) =>
            onPatch({
              answer: {
                blanks: raw
                  .split(';')
                  .map((p) =>
                    p
                      .split('/')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                  .filter((b) => b.length),
              },
            })
          }
        />
      )}

      <input
        className={f}
        placeholder="Explicación (opcional)"
        value={q.explanation ?? ''}
        onChange={(e) => onPatch({ explanation: e.target.value || null })}
      />

      {issue && <p className="text-xs text-amber-600">⚠ {issue}</p>}
    </div>
  );
}
