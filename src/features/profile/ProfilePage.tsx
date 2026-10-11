import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchProfile } from '@/features/exams/api';
import { Theme, getTheme, setTheme } from '@/lib/theme';
import Icon, { type IconName } from '@/components/Icon';

const THEME_OPTS: { value: Theme; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
  { value: 'system', label: 'Sistema', icon: 'monitor' },
];

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
      <h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
      <p className="text-slate-500">
        {profile.data?.display_name} · Nivel {profile.data?.level} · {profile.data?.xp} XP
      </p>

      <section>
        <h2 className="section-title mb-2">Tema</h2>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTS.map((t) => (
            <button
              key={t.value}
              onClick={() => choose(t.value)}
              className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                theme === t.value
                  ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <button onClick={exportData} className="btn-secondary w-full">
        Exportar mis datos (JSON)
      </button>
      <button onClick={() => supabase.auth.signOut()} className="btn w-full bg-red-500 text-white hover:bg-red-600">
        Cerrar sesión
      </button>
    </div>
  );
}
