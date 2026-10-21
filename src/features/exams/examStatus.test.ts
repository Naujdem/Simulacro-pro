import { describe, expect, it } from 'vitest';
import { examStatus } from './examStatus';

describe('examStatus', () => {
  it('sin intentos ni avance: no hay indicador', () => {
    expect(examStatus(false, undefined)).toBe('none');
  });
  it('avance a medias: pendiente (amarillo)', () => {
    expect(examStatus(true, undefined)).toBe('pending');
  });
  it('pendiente gana aunque ya lo hubieras terminado antes', () => {
    expect(examStatus(true, { total: 10, correct: 10 })).toBe('pending');
  });
  it('terminado sin errores: check', () => {
    expect(examStatus(false, { total: 10, correct: 10 })).toBe('perfect');
  });
  it('terminado con errores: rojo', () => {
    expect(examStatus(false, { total: 10, correct: 8 })).toBe('errors');
  });
  it('intento vacío no cuenta', () => {
    expect(examStatus(false, { total: 0, correct: 0 })).toBe('none');
  });
});
