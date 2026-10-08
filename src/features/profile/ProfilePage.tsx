import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchProfile } from '@/features/exams/api';
import { Theme, getTheme, setTheme } from '@/lib/theme';

export default function ProfilePage() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
  const [theme, setT] = useState<Theme>(getTheme());

  const choose = (t: Theme) => {
    setTheme(t);
    setT(t);
  };

  async function exportData() {
    const [exams, questions] = await Promise.all([supabase.from('exams').select('*'), supabase.from('questions').select('*')]);
    const blob = new Blob([JSON.stringify({ exams: exams.data, questions: questions.data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'simulapro-export.json';
    a.click();
  }

  return (
    <div className="space-y-5 p-4">
      <h1 className="text-2xl font-extrabold">Perfil</h1>
      <p className="text-slate-500">
        {profile.data?.display_name} · Nivel {profile.data?.level} · {profile.data?.xp} XP
      </p>

      <section>
        <h2 className="mb-2 font-extrabold">Tema</h2>
        <div className="grid grid-cols-3 gap-2">
          {(['light', 'dark', 'system'] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => choose(t)}
              className={`rounded-xl border-2 py-3 font-bold ${theme === t ? 'border-sky-500 bg-sky-50 dark:bg-sky-950' : 'border-slate-200 dark:border-slate-700'}`}
            >
              {t === 'light' ? '☀️ Claro' : t === 'dark' ? '🌙 Oscuro' : '⚙️ Sistema'}
            </button>
          ))}
        </div>
      </section>

      <button onClick={exportData} className="w-full rounded-2xl border-2 py-3 font-bold">
        Exportar mis datos (JSON)
      </button>
      <button onClick={() => supabase.auth.signOut()} className="w-full rounded-2xl bg-red-500 py-3 font-extrabold text-white">
        Cerrar sesión
      </button>
    </div>
  );
}
