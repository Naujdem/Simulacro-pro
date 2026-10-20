import TimedField from '@/components/TimedField';
import { parseMinutes } from '@/lib/timer';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageField, useImageUpload } from '@/components/ImageField';
import type { QType } from '@/lib/importParser';
import { norm } from '@/lib/text';
import { fetchExamForEdit, saveExamEdits, type EditableQuestion } from './api';

// Cada pregunta del formulario lleva una "key" propia para que React no se confunda al borrar o agregar.
export type Draft = { key: string; q: EditableQuestion };

const TYPE_LABEL: Record<QType, string> = {
  multiple_choice: 'Opción múltiple',
  true_false: 'Verdadero / Falso',
  fill_blank: 'Completar espacios',
  short_answer: 'Respuesta corta',
  order_words: 'Ordenar palabras',
  transform: 'Transformar oración',
};

const LETTERS = 'abcdefghij'.split('');

let counter = 0;
const newKey = () => `new-${Date.now()}-${counter++}`;

const blankQuestion = (type: QType): EditableQuestion => {
  const base = { id: null, type, prompt: '', explanation: null, imagen_url: null };
  switch (type) {
    case 'multiple_choice':
      return { ...base, options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: '' })), answer: { correct: [] } };
    case 'true_false':
      return { ...base, options: null, answer: { value: true } };
    case 'fill_blank':
      return { ...base, options: null, answer: { blanks: [] } };
    case 'order_words':
      return { ...base, prompt: 'Ordena las palabras para formar la oración', options: [], answer: { accepted: [] } };
    case 'transform':
      return { ...base, options: null, answer: { accepted: [], form: 'negativa' } };
    default:
      return { ...base, options: null, answer: { accepted: [] } };
  }
};

// Devuelve el problema de la pregunta, o null si está bien.
export const problem = (q: EditableQuestion): string | null => {
  if (!q.prompt.trim()) return 'falta el enunciado.';
  switch (q.type) {
    case 'multiple_choice': {
      const filled = (q.options ?? []).filter((o) => o.text.trim() || o.imagen_url);
      const correct = (q.answer?.correct ?? []) as string[];
      if (filled.length < 2) return 'necesita al menos 2 opciones con texto o imagen.';
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
    case 'order_words': {
      const sentence = ((q.answer?.accepted ?? []) as string[])[0] ?? '';
      const words = (q.options ?? []).map((o) => norm(o.text)).filter(Boolean).sort().join('|');
      const want = sentence
        .split(/\s+/)
        .map((w) => norm(w))
        .filter(Boolean)
        .sort()
        .join('|');
      if (!sentence.trim()) return 'escribe la oración correcta.';
      return words === want ? null : 'las palabras deben ser exactamente las de la oración correcta.';
    }
    default:
      return ((q.answer?.accepted ?? []) as string[]).length ? null : 'escribe al menos una respuesta aceptada.';
  }
};

// Limpia la pregunta antes de guardar: quita opciones vacías y respuestas correctas que ya no existen.
export const clean = (q: EditableQuestion): EditableQuestion => {
  if (q.type !== 'multiple_choice') return q;
  const opts = (q.options ?? [])
    .filter((o) => o.text.trim() || o.imagen_url)
    .map((o) => ({
      id: o.id,
      text: o.text.trim(),
      imagen_url: o.imagen_url || null,
    }));
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
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState('60');
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
    setTimed(!!exam.time_limit_min);
    setMinutes(exam.time_limit_min ? String(exam.time_limit_min) : '60');
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

    if (timed && parseMinutes(minutes) === null) {
      setError('Escribe un tiempo límite entre 1 y 600 minutos (o desmarca “examen cronometrado”).');
      return;
    }
    setSaving(true);
    try {
      await saveExamEdits(
        examId!,
        { title, subject, description, timeLimitMin: timed ? parseMinutes(minutes) : null },
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
    'w-full rounded-xl border border-slate-200 bg-transparent p-3 outline-none focus:border-sky-400 dark:border-slate-700';

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
        <h1 className="text-2xl font-bold">Editar simulacro</h1>
      </header>

      <input
        className={field}
        placeholder="Título"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setDirty(true);
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={field}
          placeholder="Tema / asignatura"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setDirty(true);
          }}
        />
        <input
          className={field}
          placeholder="Descripción (opcional)"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setDirty(true);
          }}
        />
      </div>

      <TimedField
        enabled={timed}
        minutes={minutes}
        onChange={(e, m) => {
          setTimed(e);
          setMinutes(m);
          setDirty(true);
        }}
      />

      <p className="text-sm font-bold text-slate-500">
        {drafts.length} {drafts.length === 1 ? 'pregunta' : 'preguntas'}
      </p>

      {drafts.map((d, i) => (
        <QuestionEditor key={d.key} index={i} d={d} onPatch={(p) => patch(d.key, p)} onRemove={() => removeQuestion(d)} />
      ))}

      <div className="flex gap-2">
        <select
          className="flex-1 rounded-2xl border bg-transparent px-3 py-3 text-sm font-bold dark:border-slate-700"
          value={newType}
          onChange={(e) => setNewType(e.target.value as QType)}
        >
          {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <button onClick={addQuestion} className="rounded-2xl border border-dashed px-4 py-3 text-sm font-bold text-slate-500">
          + Agregar pregunta
        </button>
      </div>

      {error && <p className="whitespace-pre-line rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={cancel} disabled={saving} className="rounded-2xl border py-4 font-bold disabled:opacity-50">
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-2xl bg-green-500 py-4 font-bold text-white disabled:opacity-50"
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

function OptionEditor({
  option,
  isCorrect,
  canRemove,
  fieldClass,
  onToggleCorrect,
  onTextChange,
  onImageChange,
  onRemove,
}: {
  option: { id: string; text: string; imagen_url?: string | null };
  isCorrect: boolean;
  canRemove: boolean;
  fieldClass: string;
  onToggleCorrect: (checked: boolean) => void;
  onTextChange: (text: string) => void;
  onImageChange: (url: string | null) => void;
  onRemove: () => void;
}) {
  const up = useImageUpload(option.imagen_url ?? null, onImageChange);

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-2 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label={`Opción ${option.id.toUpperCase()} es correcta`}
          checked={isCorrect}
          onChange={(e) => onToggleCorrect(e.target.checked)}
        />
        <span className="w-5 text-sm font-bold">{option.id}</span>
        <input
          className={fieldClass}
          value={option.text}
          placeholder={`Opción ${option.id.toUpperCase()} (texto opcional si hay imagen)`}
          onChange={(e) => onTextChange(e.target.value)}
        />
        {canRemove && (
          <button aria-label={`Quitar opción ${option.id.toUpperCase()}`} className="px-1 text-slate-400" onClick={onRemove}>
            ✕
          </button>
        )}
      </div>
      <div onPaste={up.onPaste}>
        <ImageField up={up} />
      </div>
    </div>
  );
}

export function QuestionEditor({
  index,
  d,
  onPatch,
  onRemove,
  heading,
}: {
  index: number;
  d: Draft;
  onPatch: (p: Partial<EditableQuestion>) => void;
  /** Sin esta función no aparece el botón "Eliminar" (al editar una sola pregunta mientras practicas no se puede borrar). */
  onRemove?: () => void;
  /** Reemplaza el "Pregunta N" del encabezado. */
  heading?: string;
}) {
  const q = d.q;
  const f = 'w-full rounded-lg border bg-transparent p-2 text-sm outline-none focus:border-sky-400 dark:border-slate-600';
  const opts = q.options ?? [];
  const correct = (q.answer?.correct ?? []) as string[];
  const issue = problem(q);
  const up = useImageUpload(q.imagen_url, (v) => onPatch({ imagen_url: v }));

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
          {heading ?? `Pregunta ${index + 1}`} · {TYPE_LABEL[q.type]}
          {!q.id && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">nueva</span>}
        </span>
        {onRemove && (
          <button onClick={onRemove} aria-label="Eliminar pregunta" className="text-red-500">
            Eliminar
          </button>
        )}
      </div>

      <div onPaste={up.onPaste} className="space-y-2">
        <textarea
          className={f}
          rows={3}
          value={q.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value })}
          placeholder="Enunciado"
        />
        <ImageField up={up} />
      </div>
      {q.type === 'fill_blank' && (
        <p className="text-xs text-slate-500">
          Escribe {'{{1}}'}, {'{{2}}'}… en el enunciado donde van los espacios.
        </p>
      )}

      {q.type === 'multiple_choice' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Marca ✔ la(s) respuesta(s) correcta(s). Puedes añadir imagen a cada opción.
          </p>
          {opts.map((o) => (
            <OptionEditor
              key={o.id}
              option={o}
              isCorrect={correct.includes(o.id)}
              canRemove={opts.length > 2}
              fieldClass={f}
              onToggleCorrect={(checked) =>
                onPatch({
                  answer: {
                    correct: checked ? [...correct, o.id] : correct.filter((x) => x !== o.id),
                  },
                })
              }
              onTextChange={(text) =>
                onPatch({
                  options: opts.map((x) => (x.id === o.id ? { ...x, text } : x)),
                })
              }
              onImageChange={(imagen_url) =>
                onPatch({
                  options: opts.map((x) => (x.id === o.id ? { ...x, imagen_url } : x)),
                })
              }
              onRemove={() =>
                onPatch({
                  options: opts.filter((x) => x.id !== o.id),
                  answer: { correct: correct.filter((x) => x !== o.id) },
                })
              }
            />
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

      {q.type === 'order_words' && (
        <RawInput
          className={f}
          placeholder="Palabras desordenadas (separa con |)"
          initial={opts.map((o) => o.text).join(' | ')}
          onParsed={(raw) =>
            onPatch({
              options: raw
                .split('|')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((text, i) => ({ id: `w${i + 1}`, text })),
            })
          }
        />
      )}

      {q.type === 'transform' && (
        <select
          className={f}
          value={(q.answer?.form as string) ?? 'negativa'}
          onChange={(e) => onPatch({ answer: { ...q.answer, form: e.target.value } })}
        >
          {['afirmativa', 'negativa', 'interrogativa'].map((x) => (
            <option key={x} value={x}>
              Forma {x}
            </option>
          ))}
        </select>
      )}

      {(q.type === 'short_answer' || q.type === 'transform' || q.type === 'order_words') && (
        <RawInput
          className={f}
          placeholder={q.type === 'order_words' ? 'Oración correcta' : 'Respuestas aceptadas (separa con |)'}
          initial={((q.answer?.accepted ?? []) as string[]).join(' | ')}
          onParsed={(raw) =>
            onPatch({
              answer: {
                ...q.answer,
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
