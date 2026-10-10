export interface Flashcard {
  id: string;
  front: string;
  back: string;
  created_at: string;
  imagen_ref?: string | null;
  audio_ref?: string | null;
  back_imagen_ref?: string | null;
  back_audio_ref?: string | null;
  deck?: string | null;
}

/** Ficha con los datos de SM-2, lista para estudiar. */
export interface StudyCard extends Flashcard {
  review_count: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
}
