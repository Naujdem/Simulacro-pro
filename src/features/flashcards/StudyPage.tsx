import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { QuestionImage } from '@/components/QuestionImage';
import { AudioPlayer } from '@/components/AudioPlayer';
import type { Flashcard } from './FlashcardsPage';
import { nextReview, type Rating } from './sm2';

type StudyCard = Flashcard & {
  review_count: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  imagen_ref?: string | null;
  audio_ref?: string | null;
};

const RATINGS: { value: Rating; label: string; className: string }[] = [
  { value: 'again', label: 'Otra vez', className: 'bg-red-500' },
  { value: 'hard', label: 'Difícil', className: 'bg-orange-500' },
  { value: 'good', label: 'Bien', className: 'bg-green-500' },
  { value: 'easy', label: 'Fácil', className: 'bg-sky-500' },
];

// Solo las fichas que "tocan" hoy: su fecha de repaso (due_at) es anterior a mañana a las 00:00
const fetchDueDeck = async (): Promise<StudyCard[]> => {
  const startOfTomorrow = new Date();
  startOfTomorrow.setHours(24, 0, 0, 0);

  const { data, error } = await supabase
    .from('flashcards')
    .select('id,front,back,created_at,review_count,ease_factor,interval_days,repetitions,imagen_ref,audio_ref')
    .lt('due_at', startOfTomorrow.toISOString())
    .order('due_at', { ascending: true });
  if (error) throw error;
  return data as StudyCard[];
};

export default function StudyPage() {
  const nav = useNavigate();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // El mazo del día se carga una sola vez por sesión de estudio
  const deck = useQuery({
    queryKey: ['flashcards-study'],
    queryFn: fetchDueDeck,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  // Calcula con SM-2 y guarda el nuevo estado de la ficha en Supabase
  const save = useMutation({
    mutationFn: async ({ card, rating }: { card: StudyCard; rating: Rating }) => {
      const result = nextReview(
        {
          easeFactor: Number(card.ease_factor),
          intervalDays: card.interval_days,
          repetitions: card.repetitions,
        },
        rating,
      );
      const { error } = await supabase
        .from('flashcards')
        .update({
          ease_factor: result.easeFactor,
          interval_days: result.intervalDays,
          repetitions: result.repetitions,
          due_at: result.dueAt.toISOString(),
          last_rating: rating,
          last_reviewed_at: new Date().toISOString(),
          review_count: card.review_count + 1,
        })
        .eq('id', card.id);
      if (error) throw error;
    },
  });

  const cards = deck.data ?? [];
  const card = cards[index];
  const finished = cards.length > 0 && index >= cards.length;

  const handleRate = (rating: Rating) => {
    if (!card) return;
    save.mutate({ card, rating }); // se guarda en segundo plano
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  const exit = () => nav('/flashcards');

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={exit} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500">
          ✕ Salir
        </button>
        {cards.length > 0 && !finished && (
          <span className="text-sm font-bold text-slate-500">
            {index + 1} / {cards.length}
          </span>
        )}
      </div>

      {save.isError && (
        <p className="mb-3 rounded-2xl bg-red-50 p-3 text-center text-sm font-bold text-red-600 dark:bg-red-950 dark:text-red-300">
          No se pudo guardar la última calificación. Revisa tu conexión.
        </p>
      )}

      {deck.isLoading && <p className="text-center text-slate-500">Cargando…</p>}
      {deck.error && <p className="text-center font-bold text-red-500">No se pudieron cargar las fichas.</p>}

      {!deck.isLoading && !deck.error && cards.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-xl font-extrabold">¡Estás al día!</h2>
          <p className="text-slate-500">No tienes fichas por repasar hoy.</p>
          <button onClick={exit} className="rounded-2xl bg-sky-500 px-5 py-3 font-extrabold text-white">
            Volver a Fichas
          </button>
        </div>
      )}

      {finished && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-xl font-extrabold">¡Terminaste por hoy!</h2>
          <p className="text-slate-500">Repasaste {cards.length} fichas.</p>
          <button onClick={exit} className="rounded-2xl bg-sky-500 px-5 py-3 font-extrabold text-white">
            Volver a Fichas
          </button>
        </div>
      )}

      {card && !finished && (
        <>
          <div className="flex flex-1 flex-col justify-center">
            <div className="space-y-4 rounded-3xl bg-white p-6 text-center shadow-sm dark:bg-slate-800">
              <p className="whitespace-pre-wrap text-xl font-bold">{card.front}</p>
              
              {/* Imagen de la ficha */}
              {card.imagen_ref && (
                <div className="my-3 flex justify-center">
                  <QuestionImage src={card.imagen_ref} alt="Imagen de la ficha" />
                </div>
              )}

              {/* Audio de la ficha */}
              {card.audio_ref && (
                <div className="my-3 flex justify-center">
                  <AudioPlayer src={card.audio_ref} />
                </div>
              )}

              {flipped && (
                <>
                  <hr className="border-slate-200 dark:border-slate-600" />
                  <p className="whitespace-pre-wrap text-lg">{card.back}</p>
                </>
              )}
            </div>
          </div>

          <div className="pt-4 pb-[env(safe-area-inset-bottom)]">
            {!flipped ? (
              <button
                onClick={() => setFlipped(true)}
                className="w-full rounded-2xl bg-sky-500 py-4 text-lg font-extrabold text-white"
              >
                Voltear
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => handleRate(r.value)}
                    className={`rounded-2xl py-4 text-sm font-extrabold text-white ${r.className}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
