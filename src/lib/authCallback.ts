// Deep link al que Supabase devuelve al usuario tras autenticarse con Google en el APK.
// Debe coincidir con el <intent-filter> de AndroidManifest.xml y con las "Redirect URLs" de Supabase.
export const NATIVE_REDIRECT = 'simulapro://auth/callback';

export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | { kind: 'ignore' };

// Interpreta la URL con la que se abrió la app. Pura (sin Capacitor) para poder probarla.
export function parseAuthCallback(rawUrl: string): AuthCallback {
  if (!rawUrl.startsWith(NATIVE_REDIRECT)) return { kind: 'ignore' };

  const queryStart = rawUrl.indexOf('?');
  const hashStart = rawUrl.indexOf('#');
  const query = new URLSearchParams(
    queryStart >= 0 ? rawUrl.slice(queryStart + 1, hashStart > queryStart ? hashStart : undefined) : '',
  );
  const hash = new URLSearchParams(hashStart >= 0 ? rawUrl.slice(hashStart + 1) : '');
  const get = (k: string) => query.get(k) ?? hash.get(k);

  const error = get('error_description') ?? get('error');
  if (error) return { kind: 'error', message: error };

  const code = query.get('code');
  if (code) return { kind: 'code', code };

  // Respaldo por si Supabase respondiera con flujo implícito (tokens en el hash).
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };

  return { kind: 'error', message: 'No se recibió una sesión válida de Google.' };
}
