import { describe, expect, it } from 'vitest';
import { formatClock, parseMinutes, remainingSec } from './timer';

describe('remainingSec', () => {
  it('descuenta el tiempo transcurrido y nunca baja de 0', () => {
    expect(remainingSec(0, 3600, 0)).toBe(3600);
    expect(remainingSec(0, 3600, 76_000)).toBe(3524);
    expect(remainingSec(0, 60, 59_100)).toBe(1); // redondea hacia arriba: no marca 0 antes de tiempo
    expect(remainingSec(0, 60, 61_000)).toBe(0);
    expect(remainingSec(0, 60, 9_999_999)).toBe(0);
  });
});
describe('formatClock', () => {
  it('muestra minutos:segundos y horas si hace falta', () => {
    expect(formatClock(2723)).toBe('45:23');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});
describe('parseMinutes', () => {
  it('acepta de 1 a 600 y rechaza el resto', () => {
    expect(parseMinutes('60')).toBe(60);
    expect(parseMinutes(' 45,4 ')).toBe(45);
    expect(parseMinutes('0')).toBeNull();
    expect(parseMinutes('601')).toBeNull();
    expect(parseMinutes('')).toBeNull();
    expect(parseMinutes('abc')).toBeNull();
  });
});
