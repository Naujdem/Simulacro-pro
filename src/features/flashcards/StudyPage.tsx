import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Flashcard } from './FlashcardsPage';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

type StudyCard = Flashcard & { review_count: number };

const RATINGS: { value: Rating; label: string; className: string }[] = [
  { value: 'again', label: 'Otra vez', className: 'bg-red-500' },
  { value: 'hard', label: 'Difícil', className: 'bg-orange-500' },
  { value: 'good', label: 'Bien', className: 'bg-green-500' },
  { value: 'easy', label: 'Fácil', className: 'bg-sky-500' },
];

const fetchDeck = async (): Promise<StudyCard[]> => {
  const { data, error } = await supabase
    .from('flashcards')
    .select('id,front,back,created_at,review_count')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as StudyCard[];
};

export default function StudyPage() {
  const nav = useNavigate();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // El mazo se carga una sola vez por sesión de estudio (no se recarga al cambiar de pestaña)
  const deck = useQuery({
    queryKey: ['flashcards-study'],
    queryFn: fetchDeck,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  // Guarda la calificación de una ficha en Supabase
  const save = useMutation({
    mutationFn: async ({ card, rating }: { card: StudyCard; rating: Rating }) => {
      const { error } = await supabase
        .from('flashcards')
        .update({
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
        <div className="space-y-4 text-center">
          <p className="text-slate-500">No tienes fichas para estudiar todavía.</p>
          <button onClick={exit} className="rounded-2xl bg-sky-500 px-5 py-3 font-extrabold text-white">
            Volver a Fichas
          </button>
        </div>
      )}

      {finished && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-xl font-extrabold">¡Terminaste!</h2>
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
