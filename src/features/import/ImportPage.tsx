import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ParsedQuestion, parseQuestions } from '@/lib/importParser';

const EXAMPLE = `1. ¿Cuál es la capital de Francia?
A) Madrid
B) París
C) Roma
D) Berlín
Respuesta: B

2. Las plantas absorben dióxido de carbono.
Verdadero

Pregunta: ¿Cuál es la capital de Italia?
Opciones: Madrid | París | Roma | Berlín
Correcta: Roma`;

const blank = (): ParsedQuestion => ({
  type: 'multiple_choice',
  prompt: '',
  options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: '' })),
  answer: { correct: [] },
  confidence: 0.5,
  warnings: ['Pregunta nueva: completa los datos'],
  raw: '',
});

const isValid = (q: ParsedQuestion) => {
  if (!q.prompt.trim() || !q.answer) return false;
  if (q.type === 'multiple_choice')
    return (q.options ?? []).filter((o) => o.text.trim()).length >= 2 && (q.answer.correct as string[]).length > 0;
  if (q.type === 'true_false') return typeof q.answer.value === 'boolean';
  if (q.type === 'fill_blank') return (q.answer.blanks as string[][])?.length > 0;
  return (q.answer.accepted as string[])?.length > 0;
};

export default function ImportPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [text, setText] = useState('');
  const [items, setItems] = useState<ParsedQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const patch = (i: number, p: Partial<ParsedQuestion>) =>
    setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const analyze = () => setItems(parseQuestions(text));

  async function save() {
    setSaving(true);
    setError('');
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user!.id;
      const valid = items.filter(isValid);
      const { data: exam, error: e1 } = await supabase
        .from('exams')
        .insert({
          user_id: userId,
          title: title.trim(),
          subject: subject.trim() || null,
          description: description.trim() || null,
          question_count: valid.length,
        })
        .select('id')
        .single();
      if (e1) throw e1;

      const rows = valid.map((q, position) => ({
        exam_id: exam.id,
        user_id: userId,
        position,
        type: q.type,
        prompt: q.prompt.trim(),
        options: q.type === 'multiple_choice' ? q.options!.filter((o) => o.text.trim()) : null,
        answer: q.answer,
        explanation: q.explanation ?? null,
      }));
      const { error: e2 } = await supabase.from('questions').insert(rows);
      if (e2) throw e2;

      await qc.invalidateQueries({ queryKey: ['exams'] });
      nav('/library');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full rounded-xl border-2 border-slate-200 bg-transparent p-3 outline-none focus:border-sky-400 dark:border-slate-700';
  const validCount = items.filter(isValid).length;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-extrabold">Crear / Importar simulacro</h1>

      <input className={field} placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <input className={field} placeholder="Tema / asignatura" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input className={field} placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <textarea
        className={field + ' h-48 font-mono text-sm'}
        placeholder="Pega aquí tus preguntas…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={analyze} disabled={!text.trim()} className="flex-1 rounded-2xl bg-sky-500 py-3 font-extrabold uppercase text-white disabled:opacity-50">
          Analizar
        </button>
        <button onClick={() => setText(EXAMPLE)} className="rounded-2xl border-2 px-4 font-bold">
          Ejemplo
        </button>
        <button onClick={() => setItems((xs) => [...xs, blank()])} className="rounded-2xl border-2 px-4 font-bold">
          + Manual
        </button>
      </div>

      {items.length > 0 && (
        <section className="space-y-3">
          <p className="text-sm font-bold text-slate-500">
            {validCount} de {items.length} preguntas listas para guardar
          </p>
          {items.map((q, i) => (
            <PreviewItem key={i} q={q} onChange={(p) => patch(i, p)} onRemove={() => setItems((xs) => xs.filter((_, k) => k !== i))} />
          ))}

          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={save}
            disabled={saving || !title.trim() || validCount === 0}
            className="w-full rounded-2xl bg-green-500 py-4 font-extrabold uppercase text-white disabled:opacity-50"
          >
            {saving ? 'Guardando…' : `Guardar ${validCount} preguntas`}
          </button>
        </section>
      )}
    </div>
  );
}

function PreviewItem({ q, onChange, onRemove }: { q: ParsedQuestion; onChange: (p: Partial<ParsedQuestion>) => void; onRemove: () => void }) {
  const ok = isValid(q);
  const status = !ok ? '✖' : q.confidence < 0.8 || q.warnings.length ? '⚠' : '✔';
  const color = status === '✔' ? 'border-green-400' : status === '⚠' ? 'border-amber-400' : 'border-red-400';
  const f = 'w-full rounded-lg border bg-transparent p-2 text-sm outline-none dark:border-slate-600';

  return (
    <div className={`space-y-2 rounded-2xl border-l-4 bg-white p-3 shadow-sm dark:bg-slate-800 ${color}`}>
      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
        <span>
          {status} {q.type.replace('_', ' ')}
        </span>
        <button onClick={onRemove} aria-label="Eliminar pregunta" className="text-red-500">
          Eliminar
        </button>
      </div>
      <textarea className={f} value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} placeholder="Enunciado" />

      {q.type === 'multiple_choice' &&
        q.options!.map((o, k) => (
          <label key={o.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={(q.answer!.correct as string[]).includes(o.id)}
              onChange={(e) => {
                const cur = q.answer!.correct as string[];
                onChange({ answer: { correct: e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id) } });
              }}
            />
            <input
              className={f}
              value={o.text}
              placeholder={`Opción ${o.id.toUpperCase()}`}
              onChange={(e) => onChange({ options: q.options!.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })}
            />
          </label>
        ))}

      {q.type === 'true_false' && (
        <select className={f} value={String(q.answer?.value)} onChange={(e) => onChange({ answer: { value: e.target.value === 'true' } })}>
          <option value="true">Verdadero</option>
          <option value="false">Falso</option>
        </select>
      )}

      {q.type === 'short_answer' && (
        <input
          className={f}
          placeholder="Respuestas aceptadas (separa con |)"
          value={((q.answer?.accepted as string[]) ?? []).join(' | ')}
          onChange={(e) => onChange({ answer: { accepted: e.target.value.split('|').map((s) => s.trim()).filter(Boolean) } })}
        />
      )}

      {q.type === 'fill_blank' && (
        <input
          className={f}
          placeholder="Respuestas por hueco (; entre huecos, / alternativas)"
          value={((q.answer?.blanks as string[][]) ?? []).map((b) => b.join('/')).join('; ')}
          onChange={(e) =>
            onChange({ answer: { blanks: e.target.value.split(';').map((p) => p.split('/').map((s) => s.trim()).filter(Boolean)).filter((b) => b.length) } })
          }
        />
      )}

      <input
        className={f}
        placeholder="Explicación (opcional)"
        value={q.explanation ?? ''}
        onChange={(e) => onChange({ explanation: e.target.value || undefined })}
      />
      {q.warnings.map((w) => (
        <p key={w} className="text-xs text-amber-600">
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}
