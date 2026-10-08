import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthPage() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const { error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === 'up') setMsg('Revisa tu correo para confirmar la cuenta.');
  }

  const google = () =>
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });

  const input = 'w-full rounded-2xl border-2 border-slate-200 bg-transparent p-4 outline-none focus:border-sky-400 dark:border-slate-700';

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-4xl font-extrabold text-sky-500">SimulaPro</h1>
      <p className="text-center text-slate-500">Practica tus simulacros, sube de nivel.</p>

      <form onSubmit={submit} className="space-y-3">
        <input className={input} type="email" required placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} type="password" required minLength={6} placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={busy} className="w-full rounded-2xl bg-sky-500 py-4 font-extrabold uppercase text-white disabled:opacity-60">
          {mode === 'in' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>

      <button onClick={google} className="w-full rounded-2xl border-2 border-slate-300 py-4 font-bold dark:border-slate-600">
        Continuar con Google
      </button>

      {msg && <p className="text-center text-sm text-red-500">{msg}</p>}

      <button onClick={() => setMode(mode === 'in' ? 'up' : 'in')} className="text-sm font-bold text-sky-500">
        {mode === 'in' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
      </button>
    </div>
  );
}
