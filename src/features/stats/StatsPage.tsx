import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchFolders, fetchProfile } from '@/features/exams/api';
import { BarChart, LineChart } from './Charts';
import { accuracyByLibrary, lastAttempts, mostFailed, rangeStart, RANGES, trend, type AnswerRow, type Range } from './statsLogic';
import { useState } from 'react';

interface AttemptRow {
  id: string;
  score: number;
  total: number;
  duration_sec: number;
  finished_at: string;
  mode: string;
  exams: { title: string } | null;
}

// PostgREST devuelve como máximo 1000 filas por consulta: se pide por páginas.
async function fetchAnswers(from: string | null): Promise<AnswerRow[]> {
  const out: AnswerRow[] = [];
  for (let page = 0; page < 20; page++) {
    let q = supabase
      .from('attempt_answers')
      .select('question_id,is_correct,questions(prompt,exams(title,folder_id))')
      .order('answered_at', { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (from) q = q.gte('answered_at', from);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as unknown as AnswerRow[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

export default function StatsPage() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
  const [range, setRange] = useState<Range>('all');
  const from = rangeStart(range);
  const attempts = useQuery({
    queryKey: ['attempts', range],
    queryFn: async () => {
      let q = supabase
        .from('attempts')
        .select('id,score,total,duration_sec,finished_at,mode,exams(title)')
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(500);
      if (from) q = q.gte('finished_at', from);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as AttemptRow[];
    },
  });
  const answers = useQuery({ queryKey: ['stats-answers', range], queryFn: () => fetchAnswers(from) });
  const folders = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });

  const list = attempts.data ?? [];
  const bars = accuracyByLibrary(answers.data ?? [], folders.data ?? []);
  const points = lastAttempts(list, 10);
  const diff = trend(points);
  const failed = mostFailed(answers.data ?? [], 10);
  const totalQ = list.reduce((a, x) => a + x.total, 0);
  const totalSec = list.reduce((a, x) => a + x.duration_sec, 0);
  const p = profile.data;

  const tile = (v: string | number, l: string) => (
    <div className="rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-slate-800">
      <div className="text-xl font-extrabold">{v}</div>
      <div className="text-xs text-slate-500">{l}</div>
    </div>
  );

  return (
    <div className="space-y-5 p-4">
      <h1 className="text-2xl font-extrabold">Progreso</h1>

      <div className="grid grid-cols-2 gap-3">
        {tile(`🔥 ${p?.current_streak ?? 0}`, 'Racha actual (días)')}
        {tile(`🏆 ${p?.longest_streak ?? 0}`, 'Mejor racha')}
        {tile(totalQ, 'Preguntas respondidas')}
        {tile(`${Math.round(totalSec / 60)} min`, 'Tiempo total')}
      </div>

      <Link to="/suggestions" className="flex items-center justify-between rounded-2xl bg-white p-4 font-extrabold shadow-sm dark:bg-slate-800">
        <span>💡 Sugerencias guardadas</span>
        <span className="text-slate-400">›</span>
      </Link>

      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Periodo">
        {RANGES.map((r) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={range === r.id}
            onClick={() => setRange(r.id)}
            className={`rounded-xl border-2 px-1 py-2 text-xs font-bold ${
              range === r.id ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {(answers.isError || attempts.isError) && (
        <p className="text-sm text-red-500">No se pudieron cargar las estadísticas. Revisa tu conexión e inténtalo de nuevo.</p>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <h2 className="mb-3 font-extrabold">Aciertos por biblioteca</h2>
        {bars.length ? (
          <BarChart items={bars} />
        ) : (
          <p className="text-sm text-slate-500">{answers.isLoading ? 'Cargando…' : 'Aún no hay respuestas en este periodo.'}</p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <h2 className="mb-1 font-extrabold">Evolución (últimos {Math.min(points.length || 10, 10)} simulacros)</h2>
        {diff != null && (
          <p className="mb-2 text-xs text-slate-500">
            {diff === 0 ? 'Tu último resultado está igual que tu promedio anterior.' : `Tu último resultado está ${Math.abs(diff)} puntos ${diff > 0 ? 'por encima ↑' : 'por debajo ↓'} de tu promedio anterior.`}
          </p>
        )}
        {points.length ? (
          <LineChart key={points.map((p) => p.id).join()} points={points} />
        ) : (
          <p className="text-sm text-slate-500">{attempts.isLoading ? 'Cargando…' : 'Termina un simulacro para ver tu evolución.'}</p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <h2 className="mb-3 font-extrabold">Preguntas más falladas</h2>
        {failed.length ? (
          <ol className="space-y-2 text-sm">
            {failed.map((f, i) => (
              <li key={f.questionId} className="flex items-start gap-3">
                <span className="w-5 shrink-0 text-right font-extrabold text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2">{f.prompt.replace(/\{\{\d+\}\}/g, '____')}</span>
                  <span className="block truncate text-xs text-slate-500">{f.exam}</span>
                </span>
                <span className="shrink-0 rounded-lg bg-red-100 px-2 py-1 text-xs font-extrabold text-red-700 dark:bg-red-950 dark:text-red-300">
                  {f.wrong === 1 ? '1 fallo' : `${f.wrong} fallos`} de {f.answered}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">{answers.isLoading ? 'Cargando…' : '¡No has fallado ninguna en este periodo! 🎉'}</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-extrabold">Historial de intentos</h2>
        <ul className="space-y-2">
          {list.slice(0, 30).map((a) => (
            <li key={a.id} className="flex justify-between rounded-xl bg-white p-3 text-sm shadow-sm dark:bg-slate-800">
              <span>
                <b>{a.mode === 'quick_review' ? '🧠 Repaso Rápido' : (a.exams?.title ?? 'Simulacro eliminado')}</b>
                <br />
                <span className="text-xs text-slate-500">{new Date(a.finished_at).toLocaleString()}</span>
              </span>
              <b className={Number(a.score) >= 70 ? 'text-green-600' : 'text-red-500'}>{Math.round(Number(a.score))}%</b>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
