import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchBestScores, fetchExams, fetchFolders } from './api';
import { SUPER_ID, usePractice } from '@/features/practice/practiceStore';
import type { Question } from '@/lib/grading';
import { parseMinutes } from '@/lib/timer';
import { capacityFor, pickBalanced, pickHardest, secPerQuestion } from '@/lib/superSimulacro';

// Todas las preguntas de un simulacro, en su orden (por páginas: Supabase da como máximo 1000 por consulta)
async function fetchExamQuestions(examId: string): Promise<Question[]> {
  const out: Question[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from('questions').select('*').eq('exam_id', examId).order('position').range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Question[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

const field = 'w-24 rounded-xl border border-slate-200 bg-transparent p-3 text-center outline-none focus:border-sky-400 dark:border-slate-700';

/** Super simulacro: varios simulacros completos seguidos, con un solo tiempo límite para todos. */
export default function SuperSimulacroPage() {
  const nav = useNavigate();
  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const folders = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  const best = useQuery({ queryKey: ['best'], queryFn: fetchBestScores });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [minutes, setMinutes] = useState('60');

  const usable = (exams.data ?? []).filter((e) => e.question_count > 0);
  const folderName = new Map((folders.data ?? []).map((f) => [f.id, f.name]));
  const chosen = usable.filter((e) => picked.has(e.id));
  const totalQuestions = chosen.reduce((a, e) => a + e.question_count, 0);
  const limit = parseMinutes(minutes);
  const pace = limit ? secPerQuestion(limit, totalQuestions) : null;
  const hasRated = usable.some((e) => typeof e.difficulty === 'number');
  const ready = chosen.length > 0 && limit !== null;

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const auto = (pick: typeof pickHardest) => {
    if (limit) setPicked(new Set(pick(usable, capacityFor(limit))));
  };

  const start = useMutation({
    mutationFn: async () => {
      // Cada simulacro completo, uno detrás de otro y en el orden de la lista
      const groups = await Promise.all(chosen.map((e) => fetchExamQuestions(e.id)));
      const questions = groups.flat();
      if (!questions.length) throw new Error('Esos simulacros todavía no tienen preguntas.');
      return questions;
    },
    onSuccess: (questions) => {
      usePractice.getState().reset();
      usePractice.getState().start(SUPER_ID, questions, 'super', undefined, 'super', limit ? limit * 60 : null);
      nav(`/practice/${SUPER_ID}`);
    },
  });

  const chip = 'rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40 dark:border-slate-600';

  return (
    <div className="space-y-5 p-4">
      <Link to="/" className="text-sm font-bold text-sky-500">← Inicio</Link>
      <header>
        <h1 className="text-2xl font-bold">🏆 Super simulacro</h1>
        <p className="text-sm text-slate-500">
          Junta varios simulacros completos y hazlos seguidos con un solo cronómetro. Solo queda el intento en tus estadísticas.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="font-bold">1. ¿Cuánto tiempo tienes?</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            aria-label="Minutos"
            className={field}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <span className="text-sm text-slate-500">minutos</span>
          {[30, 60, 90, 120].map((v) => (
            <button key={v} type="button" onClick={() => setMinutes(String(v))} className={chip}>
              {v}
            </button>
          ))}
        </div>
        {limit === null && <p className="text-xs text-red-500">Escribe un tiempo entre 1 y 600 minutos.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">2. Elige los simulacros</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!limit || !hasRated} onClick={() => auto(pickHardest)} className={chip}>
            🔥 Los más difíciles
          </button>
          <button type="button" disabled={!limit || !hasRated} onClick={() => auto(pickBalanced)} className={chip}>
            ⚖️ Balanceados
          </button>
          {picked.size > 0 && (
            <button type="button" onClick={() => setPicked(new Set())} className={`${chip} text-slate-500`}>
              Limpiar
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {hasRated
            ? 'Los botones llenan el tiempo calculando 1 minuto por pregunta; después puedes marcar o desmarcar a mano. Los simulacros sin estrellas no entran en la selección automática.'
            : 'Califica la dificultad de tus simulacros (estrellas al terminarlos) para usar la selección automática. Mientras tanto, elige a mano.'}
        </p>

        {exams.isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
        {!exams.isLoading && !usable.length && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Aún no tienes simulacros con preguntas.</p>
        )}
        <ul className="space-y-2">
          {usable.map((e) => {
            const on = picked.has(e.id);
            const score = best.data?.[e.id];
            return (
              <li key={e.id}>
                <label
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-sm ${on ? 'border-sky-500 bg-sky-50 dark:bg-sky-950' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-sky-500" checked={on} onChange={() => toggle(e.id)} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{e.title}</b>
                    <span className="block truncate text-xs text-slate-500">
                      {(e.folder_id && folderName.get(e.folder_id)) || 'Sin biblioteca'} · {e.question_count} preguntas
                      {score !== undefined ? ` · mejor ${Math.round(score)}%` : ''}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs font-bold ${e.difficulty ? 'text-amber-500' : 'text-slate-400'}`}>
                    {e.difficulty ? `★ ${e.difficulty}` : 'sin calificar'}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl bg-slate-100 p-3 text-center text-sm dark:bg-slate-800">
        {chosen.length === 0 ? (
          <span className="text-slate-500">Todavía no elegiste ningún simulacro.</span>
        ) : (
          <>
            <b>
              {chosen.length} {chosen.length === 1 ? 'simulacro' : 'simulacros'} · {totalQuestions} preguntas
            </b>
            {pace !== null && (
              <span className={pace < 20 ? 'block text-red-500' : 'block text-slate-500'}>
                {pace} s por pregunta{pace < 20 ? ' — va muy justo' : ''}
              </span>
            )}
          </>
        )}
      </section>

      <button
        disabled={!ready || start.isPending}
        onClick={() => start.mutate()}
        className="w-full rounded-2xl bg-sky-500 py-4 font-bold text-white disabled:opacity-50"
      >
        {start.isPending ? 'Armando…' : `🏆 Empezar${ready ? ` (${totalQuestions} preguntas, ${limit} min)` : ''}`}
      </button>
      {start.isError && <p className="text-center text-sm text-red-500">{(start.error as Error).message}</p>}
    </div>
  );
}
