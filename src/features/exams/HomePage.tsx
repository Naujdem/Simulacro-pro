import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchBestScores, fetchExams, fetchProfile } from './api';
import { usePractice } from '@/features/practice/practiceStore';

export default function HomePage() {
  const nav = useNavigate();
  const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const best = useQuery({ queryKey: ['best'], queryFn: fetchBestScores });

  const p = profile.data;
  const xpInLevel = p ? p.xp - 100 * (p.level - 1) ** 2 : 0;
  const xpForLevel = p ? 100 * p.level ** 2 - 100 * (p.level - 1) ** 2 : 100;
  const recent = (exams.data ?? []).slice(0, 5);

  return (
    <div className="space-y-5 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Hola{p?.display_name ? `, ${p.display_name}` : ''} 👋</h1>
        <span className="rounded-full bg-orange-100 px-3 py-1 font-extrabold text-orange-600 dark:bg-orange-950">
          🔥 {p?.current_streak ?? 0}
        </span>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        <div className="mb-2 flex justify-between text-sm font-bold">
          <span>Nivel {p?.level ?? 1}</span>
          <span className="text-slate-500">{p?.xp ?? 0} XP</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, (xpInLevel / xpForLevel) * 100)}%` }} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-extrabold">Simulacros recientes</h2>
        {!recent.length && (
          <Link to="/new" className="block rounded-2xl border-2 border-dashed p-6 text-center text-slate-500">
            Aún no tienes simulacros. ¡Crea o importa el primero!
          </Link>
        )}
        <ul className="space-y-3">
          {recent.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => {
                  usePractice.getState().reset();
                  nav(`/practice/${e.id}`);
                }}
                className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-sm active:scale-[.98] dark:bg-slate-800"
              >
                <div>
                  <p className="font-bold">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {e.subject ?? 'Sin tema'} · {e.question_count} preguntas
                  </p>
                </div>
                <span className="text-sm font-extrabold text-green-600">
                  {best.data?.[e.id] !== undefined ? `${Math.round(best.data[e.id])}%` : 'Practicar ›'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
