import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { setProgressUser } from '@/features/practice/progress';
import { startProgressSync, syncProgress } from '@/features/practice/progressSync';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setProgressUser(data.session?.user.id); // el avance guardado en el dispositivo es de cada usuario
      startProgressSync();
      void syncProgress();
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setProgressUser(s?.user.id);
      if (s) void syncProgress();
      setSession(s);
    });
    // Al volver a la app (o a la pestaña) trae el avance que hayas dejado en otro dispositivo
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncProgress();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { session, loading };
}
