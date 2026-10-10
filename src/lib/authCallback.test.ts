import { describe, expect, it } from 'vitest';
import { parseAuthCallback } from './authCallback';

describe('parseAuthCallback', () => {
  it('ignora URLs que no son el callback de login', () => {
    expect(parseAuthCallback('https://simulacro-pro.vercel.app/')).toEqual({ kind: 'ignore' });
    expect(parseAuthCallback('simulapro://otra/ruta?code=abc')).toEqual({ kind: 'ignore' });
  });

  it('lee el code del flujo PKCE', () => {
    expect(parseAuthCallback('simulapro://auth/callback?code=abc123')).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('lee los tokens del flujo implícito (hash)', () => {
    expect(parseAuthCallback('simulapro://auth/callback#access_token=AT&refresh_token=RT&expires_in=3600')).toEqual({
      kind: 'tokens',
      accessToken: 'AT',
      refreshToken: 'RT',
    });
  });

  it('devuelve el error que reporte Supabase/Google', () => {
    expect(
      parseAuthCallback('simulapro://auth/callback?error=access_denied&error_description=Acceso+denegado'),
    ).toEqual({ kind: 'error', message: 'Acceso denegado' });
    expect(parseAuthCallback('simulapro://auth/callback#error=server_error')).toEqual({
      kind: 'error',
      message: 'server_error',
    });
  });

  it('marca error si el callback llega sin sesión', () => {
    expect(parseAuthCallback('simulapro://auth/callback').kind).toBe('error');
  });
});
