// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ updateQuestion: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {}, todayLocal: () => '2026-10-20' }));
vi.mock('@/lib/drive', () => ({
  DriveError: class extends Error {},
  connectDrive: vi.fn(),
  preloadGis: async () => undefined,
  uploadImage: vi.fn(),
}));
vi.mock('@/features/exams/api', () => ({
  updateQuestion: api.updateQuestion,
  saveQuestionTag: vi.fn(),
  fetchExamForEdit: vi.fn(),
  saveExamEdits: vi.fn(),
}));

import { QuestionCard } from './QuestionCard';
import type { Question } from '@/lib/grading';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// La clave está MAL puesta: la correcta es París (b) pero el simulacro dice Madrid (a)
const pregunta = (): Question => ({
  id: 'q1',
  exam_id: 'ex1',
  type: 'multiple_choice',
  prompt: '¿Capital de Francia?',
  options: [
    { id: 'a', text: 'Madrid' },
    { id: 'b', text: 'París' },
    { id: 'c', text: 'Roma' },
  ],
  answer: { correct: ['a'] },
  explanation: null,
  section: 'Geografía',
});

function Harness({ initial, editable = true }: { initial: Question; editable?: boolean }) {
  const [q, setQ] = useState(initial);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <QuestionCard key={q.id} question={q} examId="ex1" onNext={() => undefined} onEdited={editable ? setQ : undefined} />
    </QueryClientProvider>
  );
}

let host: HTMLDivElement;
let root: Root;
const text = () => document.body.textContent ?? '';
const buttons = () => [...document.querySelectorAll('button')];
const byText = (t: string) => {
  const b = buttons().find((x) => x.textContent?.includes(t));
  if (!b) throw new Error(`No hay botón con "${t}"`);
  return b;
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const box = (label: string) => document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const dialog = () => document.querySelector('[role=dialog]');
// Enunciado de la tarjeta (el panel de edición también tiene un <h2>, por eso se excluye)
const cardPrompt = () => [...document.querySelectorAll('h2')].find((h) => !h.closest('[role=dialog]'))?.textContent;
async function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function show(initial: Question, editable = true) {
  await act(async () => root.render(<Harness initial={initial} editable={editable} />));
}

beforeEach(() => {
  localStorage.setItem('sp:shuffle-options', '0'); // orden fijo para poder buscar por posición
  api.updateQuestion.mockReset();
  api.updateQuestion.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('editar una pregunta mientras practicas', () => {
  it('corregir la clave después de fallar: tu respuesta se vuelve a calificar y queda correcta', async () => {
    await show(pregunta());
    await click(byText('París')); // eliges lo que es correcto de verdad
    await click(byText('Comprobar'));
    expect(text()).toContain('Incorrecto'); // pero la clave guardada estaba mal

    await click(byText('Editar pregunta'));
    expect(dialog()).not.toBeNull();
    await click(box('Opción B es correcta')); // marca París
    await click(box('Opción A es correcta')); // desmarca Madrid
    await click(byText('Guardar cambios'));

    expect(api.updateQuestion).toHaveBeenCalledTimes(1);
    expect(api.updateQuestion.mock.calls[0][0]).toMatchObject({ id: 'q1', answer: { correct: ['b'] } });
    expect(dialog()).toBeNull();
    expect(text()).toContain('¡Correcto!');
    expect(text()).not.toContain('Incorrecto');
  });

  it('corregir el enunciado y la explicación se ve de inmediato en la pregunta', async () => {
    await show(pregunta());
    await click(byText('Editar pregunta'));
    await setValue(document.querySelector('textarea')!, '¿Cuál es la capital de Francia?');
    await setValue(document.querySelector('input[placeholder="Explicación (opcional)"]') as HTMLInputElement, 'París está en el río Sena.');
    await click(byText('Guardar cambios'));
    expect(text()).toContain('¿Cuál es la capital de Francia?');
    expect(api.updateQuestion.mock.calls[0][0]).toMatchObject({ prompt: '¿Cuál es la capital de Francia?', explanation: 'París está en el río Sena.' });
    // la explicación aparece al comprobar
    await click(byText('París'));
    await click(byText('Comprobar'));
    expect(text()).toContain('París está en el río Sena.');
  });

  it('si quitas la opción que habías marcado, la respuesta se descarta y vuelves a contestar', async () => {
    await show(pregunta());
    await click(byText('Roma'));
    await click(byText('Comprobar'));
    expect(text()).toContain('Incorrecto');
    await click(byText('Editar pregunta'));
    await click(document.querySelector('button[aria-label="Quitar opción C"]')!);
    await click(byText('Guardar cambios'));
    expect(text()).not.toContain('Roma');
    expect(text()).not.toContain('Incorrecto'); // ya no hay respuesta calificada
    expect(byText('Comprobar').disabled).toBe(true); // hay que volver a elegir
  });

  it('no deja guardar una pregunta sin respuesta correcta y explica por qué', async () => {
    await show(pregunta());
    await click(byText('Editar pregunta'));
    await click(box('Opción A es correcta')); // sin ninguna marcada
    await click(byText('Guardar cambios'));
    expect(api.updateQuestion).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    expect(document.querySelector('[role=alert]')?.textContent).toMatch(/Corrige esto antes de guardar: .*respuesta correcta/);
  });

  it('si falla el guardado, avisa, el panel sigue abierto y la pregunta no cambia', async () => {
    api.updateQuestion.mockRejectedValueOnce(new Error('No tienes permiso para editar esta pregunta (¿es de otra persona?).'));
    await show(pregunta());
    await click(byText('Editar pregunta'));
    await setValue(document.querySelector('textarea')!, 'Texto que no se guardó');
    await click(byText('Guardar cambios'));
    expect(document.querySelector('[role=alert]')?.textContent).toContain('No tienes permiso');
    expect(dialog()).not.toBeNull();
    expect(cardPrompt()).toBe('¿Capital de Francia?'); // el enunciado de la tarjeta sigue igual (el texto nuevo solo está en el panel)
    // con cambios sin guardar, cerrar pide confirmación: "no" deja el panel abierto, "sí" lo cierra
    const confirmar = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirmar);
    await click(document.querySelector('button[aria-label="Cerrar"]')!);
    expect(dialog()).not.toBeNull();
    await click(document.querySelector('button[aria-label="Cerrar"]')!);
    expect(dialog()).toBeNull();
    expect(confirmar).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('cerrar sin haber cambiado nada no pregunta nada', async () => {
    const confirmar = vi.fn();
    vi.stubGlobal('confirm', confirmar);
    await show(pregunta());
    await click(byText('Editar pregunta'));
    await click(byText('Cancelar'));
    expect(dialog()).toBeNull();
    expect(confirmar).not.toHaveBeenCalled();
    expect(api.updateQuestion).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('no aparece "Editar pregunta" si no se da permiso de edición (simulacros compartidos)', async () => {
    await show(pregunta(), false);
    expect(buttons().some((b) => b.textContent?.includes('Editar pregunta'))).toBe(false);
  });

  it('el panel muestra las opciones en su orden original aunque estén mezcladas en pantalla', async () => {
    localStorage.setItem('sp:shuffle-options', '1');
    await show(pregunta());
    await click(byText('Editar pregunta'));
    const orden = [...document.querySelectorAll('[role=dialog] input[type=checkbox]')].map((c) => c.getAttribute('aria-label'));
    expect(orden).toEqual(['Opción A es correcta', 'Opción B es correcta', 'Opción C es correcta']);
  });
});
