import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';
import { NATIVE_REDIRECT, parseAuthCallback } from './authCallback';

export const isNativeApp = () => Capacitor.isNativePlatform();

// Evento para que la pantalla de login muestre errores que ocurren fuera de ella (deep link).
export const AUTH_ERROR_EVENT = 'simulapro:auth-error';

// Abre Google en el navegador del sistema (Chrome Custom Tab). Google bloquea el login dentro de un WebView,
// y si navegamos aquí mismo Capacitor lo manda a Chrome sin forma de volver.
export async function signInWithGoogleNative() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Supabase no devolvió la URL de Google.');
  await Browser.open({ url: data.url });
}

async function handleUrl(url: string) {
  const result = parseAuthCallback(url);
  if (result.kind === 'ignore') return;

  // Cerrar el navegador (en Android el Custom Tab no se puede cerrar por código, pero la app ya queda al frente).
  Browser.close().catch(() => {});

  try {
    if (result.kind === 'error') throw new Error(result.message);
    if (result.kind === 'code') {
      const { error } = await supabase.auth.exchangeCodeForSession(result.code);
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      if (error) throw error;
    }
    // useSession() recibe la sesión por onAuthStateChange y la app pasa sola a la pantalla principal.
  } catch (e) {
    console.error('Error en el login con Google:', e);
    window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT, { detail: (e as Error).message }));
  }
}

// Llamar una sola vez al arrancar. Cubre la app abierta (appUrlOpen) y la app reiniciada por el deep link (launch URL).
export function initDeepLinkAuth() {
  if (!isNativeApp()) return;
  App.addListener('appUrlOpen', ({ url }) => void handleUrl(url));
  App.getLaunchUrl().then((launch) => {
    if (launch?.url) void handleUrl(launch.url);
  });
}
