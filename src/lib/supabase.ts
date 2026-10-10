import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// En el APK el login vuelve por un deep link propio (simulapro://), que otras apps podrían interceptar:
// por eso allí se usa PKCE (el deep link trae un código de un solo uso, no tokens) y el deep link se procesa
// a mano en nativeAuth.ts. En la web todo queda exactamente como antes.
const native = Capacitor.isNativePlatform();

export const supabase = createClient(url || 'http://localhost', key || 'anon', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    ...(native ? { flowType: 'pkce' as const, detectSessionInUrl: false } : {}),
  },
});

export const todayLocal = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en la zona del usuario
