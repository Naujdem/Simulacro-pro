import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchProfile } from '@/features/exams/api';

interface AttemptRow {
  id: string;
  score: number;
  total: number;
  duration_sec: number;
  finished_at: string;
  exams: { title: string } | null;
}

export default function StatsPage() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
  const attempts = useQuery({
    queryKey: ['attempts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attempts')
        .select('id,score,total,duration_sec,finished_at,exams(title)')
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as AttemptRow[];
    },
  });
  const subjects = useQuery({
    queryKey: ['subject_stats'],
    queryFn: async () => {
      const { data } = await supabase.from('subject_stats').select('subject,answered,accuracy');
      return (data ?? []) as { subject: string; answered: number; accuracy: number }[];
    },
  });

  const list = attempts.data ?? [];
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

      <section>
        <h2 className="mb-2 font-extrabold">Acierto por tema</h2>
        <ul className="space-y-2">
          {(subjects.data ?? []).map((s) => (
            <li key={s.subject}>
              <div className="flex justify-between text-sm">
                <span className="font-bold">{s.subject}</span>
                <span>{s.accuracy}% · {s.answered} resp.</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-full bg-green-500" style={{ width: `${s.accuracy}%` }} />
              </div>
            </li>
          ))}
          {!subjects.data?.length && <p className="text-sm text-slate-500">Practica un simulacro para ver tus estadísticas.</p>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-extrabold">Historial de intentos</h2>
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id} className="flex justify-between rounded-xl bg-white p-3 text-sm shadow-sm dark:bg-slate-800">
              <span>
                <b>{a.exams?.title ?? 'Simulacro eliminado'}</b>
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
