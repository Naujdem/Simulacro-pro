import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchExams, fetchFolders } from './api';
import { SURPRISE_ID, usePractice } from '@/features/practice/practiceStore';
import TimedField from '@/components/TimedField';
import type { Question } from '@/lib/grading';
import { availableQuestions, minLibraries, pickRandom } from '@/lib/surprise';
import { parseMinutes } from '@/lib/timer';

// Trae TODOS los ids de preguntas de esos simulacros (por páginas: Supabase da como máximo 1000 por consulta)
async function fetchQuestionIds(examIds: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from('questions').select('id').in('exam_id', examIds).order('id').range(from, from + 999);
    if (error) throw error;
    ids.push(...(data ?? []).map((q) => q.id as string));
    if ((data?.length ?? 0) < 1000) break;
  }
  return ids;
}

async function fetchQuestionsByIds(ids: string[]): Promise<Question[]> {
  const out: Question[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await supabase.from('questions').select('*').in('id', ids.slice(i, i + 80));
    if (error) throw error;
    out.push(...((data ?? []) as Question[]));
  }
  return out;
}

const field = 'w-24 rounded-xl border border-slate-200 bg-transparent p-3 text-center outline-none focus:border-sky-400 dark:border-slate-700';

/** Simulacro Sorpresa: preguntas al azar de varias bibliotecas, en un simulacro temporal (solo se guarda el intento). */
export default function SurprisePage() {
  const nav = useNavigate();
  const folders = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState('20');
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState('20');

  const list = folders.data ?? [];
  const all = exams.data ?? [];
  const perFolder = (id: string) => availableQuestions(all, new Set([id]));
  const available = availableQuestions(all, picked);
  const need = minLibraries(list.length);
  const n = Math.min(Math.max(1, Math.floor(Number(count) || 0)), Math.max(available, 1));
  const limit = timed ? parseMinutes(minutes) : null;
  const ready = picked.size >= need && available > 0 && Number(count) >= 1 && (!timed || limit !== null);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const start = useMutation({
    mutationFn: async () => {
      const examIds = all.filter((e) => e.folder_id && picked.has(e.folder_id)).map((e) => e.id);
      const ids = await fetchQuestionIds(examIds);
      if (!ids.length) throw new Error('Esas bibliotecas todavía no tienen preguntas.');
      const chosen = pickRandom(ids, n);
      const byId = new Map((await fetchQuestionsByIds(chosen)).map((q) => [q.id, q]));
      // Se conserva el orden aleatorio; si alguna pregunta se borró entre tanto, simplemente no está
      return chosen.map((id) => byId.get(id)).filter((q): q is Question => !!q);
    },
    onSuccess: (questions) => {
      if (!questions.length) return;
      usePractice.getState().reset();
      usePractice.getState().start(SURPRISE_ID, questions, 'surprise', undefined, 'surprise', limit ? limit * 60 : null);
      nav(`/practice/${SURPRISE_ID}`);
    },
  });

  return (
    <div className="space-y-5 p-4">
      <Link to="/" className="text-sm font-bold text-sky-500">← Inicio</Link>
      <header>
        <h1 className="text-2xl font-bold">🎲 Simulacro Sorpresa</h1>
        <p className="text-sm text-slate-500">
          Mezcla preguntas al azar de varias bibliotecas. No se guarda como simulacro: solo queda el intento en tus estadísticas.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="font-bold">1. Elige {need === 1 ? 'tu biblioteca' : 'al menos 2 bibliotecas'}</h2>
        {folders.isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
        {!folders.isLoading && !list.length && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Aún no tienes bibliotecas con simulacros.</p>
        )}
        <ul className="space-y-2">
          {list.map((f) => {
            const q = perFolder(f.id);
            const on = picked.has(f.id);
            return (
              <li key={f.id}>
                <label
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-sm ${on ? 'border-sky-500 bg-sky-50 dark:bg-sky-950' : 'border-slate-200 dark:border-slate-700'} ${q ? '' : 'opacity-50'}`}
                >
                  <input type="checkbox" className="h-5 w-5 accent-sky-500" checked={on} disabled={!q} onChange={() => toggle(f.id)} />
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: f.color ?? '#0ea5e9' }} />
                  <span className="min-w-0 flex-1 truncate font-bold">{f.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{q === 1 ? '1 pregunta' : `${q} preguntas`}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">2. ¿Cuántas preguntas?</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            aria-label="Número de preguntas"
            className={field}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          {[10, 20, 30].map((v) => (
            <button key={v} type="button" onClick={() => setCount(String(v))} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold dark:border-slate-600">
              {v}
            </button>
          ))}
        </div>
        {picked.size > 0 && (
          <p className="text-xs text-slate-500">
            {available >= Number(count) ? `Hay ${available} preguntas disponibles.` : `Solo hay ${available} preguntas: se usarán ${available}.`}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">3. Tiempo límite (opcional)</h2>
        <TimedField enabled={timed} minutes={minutes} onChange={(e, m) => { setTimed(e); setMinutes(m); }} label="Poner tiempo límite" />
      </section>

      <button
        disabled={!ready || start.isPending}
        onClick={() => start.mutate()}
        className="w-full rounded-2xl bg-sky-500 py-4 font-bold text-white disabled:opacity-50"
      >
        {start.isPending ? 'Armando…' : `🎲 Empezar${ready ? ` (${n} preguntas${limit ? `, ${limit} min` : ''})` : ''}`}
      </button>
      {!ready && picked.size < need && list.length > 0 && (
        <p className="text-center text-xs text-slate-500">Elige {need === 1 ? 'la biblioteca' : 'al menos 2 bibliotecas'} para empezar.</p>
      )}
      {start.isError && <p className="text-center text-sm text-red-500">{(start.error as Error).message}</p>}
    </div>
  );
}
