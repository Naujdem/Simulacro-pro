// Cuenta regresiva del Examen Cronometrado (sin pantalla, para poder probarla).

/** Segundos que quedan (nunca menos de 0). `startedAt` y `now` en milisegundos. */
export function remainingSec(startedAt: number, limitSec: number, now: number = Date.now()): number {
  return Math.max(0, Math.ceil(limitSec - (now - startedAt) / 1000));
}

/** 2723 → "45:23"; con horas: 3725 → "1:02:05". */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Minutos escritos en el formulario → minutos válidos (entero de 1 a 600) o null. */
export function parseMinutes(raw: string | number): number | null {
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 1 || n > 600) return null;
  return Math.round(n);
}
