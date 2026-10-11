import { create } from 'zustand';
import type { Draft } from './api';

/** Sugerencia recién generada, que viaja de la pantalla de resultados a la pantalla de sugerencia. */
interface DraftState {
  draft: Draft | null;
  set: (d: Draft | null) => void;
}
export const useDraft = create<DraftState>((set) => ({ draft: null, set: (draft) => set({ draft }) }));
