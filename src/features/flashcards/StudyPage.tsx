import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import QuestionImage from '@/components/QuestionImage';
import { AudioButton } from '@/components/AudioButton';
import { playAudio, prefetchRefs, stopAudio } from '@/lib/playAudio';
import { LEARN_AGAIN_MINUTES, describeInterval, nextReview, type Rating, type Sm2Result } from './sm2';
import { isMissingColumn } from './columns';
import { buildStudyQueue } from './api';
import { isNewCard } from './decks';
import { pickNext, type LearningEntry } from './studySession';
import type { StudyCard } from './types';

const RATINGS: { value: Rating; label: string; className: string }[] = [
  { value: 'again', label: 'Otra vez', className: 'bg-red-500' },
  { value: 'hard', label: 'Difícil', className: 'bg-orange-500' },
  { value: 'good', label: 'Bien', className: 'bg-green-500' },
  { value: 'easy', label: 'Fácil', className: 'bg-sky-500' },
];

const LEARN_MS = LEARN_AGAIN_MINUTES * 60_000;
const AUTOPLAY_KEY = 'simulapro:autoplay-audio';

interface Session {
  queue: StudyCard[];
  learning: LearningEntry<StudyCard>[];
  current: StudyCard | null;
  done: number;
  total: number;
  seq: number; // cambia cada vez que se muestra una ficha (aunque sea la misma otra vez)
}

function readAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== '0';
  } catch {
    return true;
  }
}

export default function StudyPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const deckParam = params.get('deck');

  const [session, setSession] = useState<Session | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [autoplay, setAutoplay] = useState(readAutoplay);

  const deck = useQuery({
    queryKey: ['flashcards-study', deckParam],
    queryFn: () => buildStudyQueue(deckParam),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  // Al llegar la cola de hoy se arranca la sesión
  useEffect(() => {
    if (!deck.data || session) return;
    const first = pickNext(deck.data, [], Date.now());
    setSession({ ...first, done: 0, total: deck.data.length, seq: 1 });
  }, [deck.data, session]);

  // Al salir, las pantallas de mazos vuelven a calcular sus conteos
  useEffect(
    () => () => {
      stopAudio();
      qc.invalidateQueries({ queryKey: ['flashcards'] });
    },
    [qc],
  );

  const save = useMutation({
    mutationFn: async ({ card, rating, result, now }: { card: StudyCard; rating: Rating; result: Sm2Result; now: Date }) => {
      const payload: Record<string, unknown> = {
        ease_factor: result.easeFactor,
        interval_days: result.intervalDays,
        repetitions: result.repetitions,
        due_at: result.dueAt.toISOString(),
        last_rating: rating,
        last_reviewed_at: now.toISOString(),
        review_count: card.review_count + 1,
      };
      const wasNew = isNewCard(card);
      if (wasNew) payload.introduced_at = now.toISOString(); // cuenta para el límite de "nuevas por día"

      let { error } = await supabase.from('flashcards').update(payload).eq('id', card.id);
      if (error && wasNew && isMissingColumn(error)) {
        delete payload.introduced_at; // migración 0005 pendiente: se guarda igual
        ({ error } = await supabase.from('flashcards').update(payload).eq('id', card.id));
      }
      if (error) throw error;
    },
  });

  const card = session?.current ?? null;
  const seq = session?.seq ?? 0;
  const finished = !!session && !session.current && session.total > 0;
  const remaining = session ? session.queue.length + session.learning.length + (session.current ? 1 : 0) : 0;

  // Cuánto tardará en volver a salir la ficha según el botón: "Otra vez 1 min", "Bien 1 d"…
  const previews = useMemo(() => {
    if (!card) return null;
    const state = { easeFactor: Number(card.ease_factor), intervalDays: card.interval_days, repetitions: card.repetitions };
    const now = new Date();
    return RATINGS.map((r) => describeInterval(r.value, nextReview(state, r.value, now)));
  }, [card]);

  // Audio del frente al mostrar la ficha; el del reverso al voltearla
  useEffect(() => {
    if (!card || !autoplay || !card.audio_ref) return;
    playAudio(card.audio_ref).catch(() => {}); // si el navegador bloquea el autoplay, queda el botón
    return () => stopAudio();
  }, [seq, autoplay]);

  useEffect(() => {
    if (!flipped || !card || !autoplay || !card.back_audio_ref) return;
    playAudio(card.back_audio_ref).catch(() => {});
  }, [flipped, seq, autoplay]);

  // Descarga por adelantado lo que viene para que no haya espera
  useEffect(() => {
    if (!session) return;
    const upcoming = [session.current, ...session.queue.slice(0, 3)].filter((c): c is StudyCard => !!c);
    prefetchRefs(upcoming.flatMap((c) => [c.imagen_ref, c.audio_ref, c.back_imagen_ref, c.back_audio_ref]));
  }, [seq]);

  const toggleAutoplay = () => {
    const next = !autoplay;
    setAutoplay(next);
    if (!next) stopAudio();
    try {
      localStorage.setItem(AUTOPLAY_KEY, next ? '1' : '0');
    } catch {
      /* sin almacenamiento: solo vale para esta sesión */
    }
  };

  const handleRate = (rating: Rating) => {
    if (!card || !session) return;
    const now = new Date();
    const result = nextReview(
      { easeFactor: Number(card.ease_factor), intervalDays: card.interval_days, repetitions: card.repetitions },
      rating,
      now,
    );
    save.mutate({ card, rating, result, now });

    // La ficha con su estado nuevo (si fue "Otra vez" vuelve a salir en esta sesión y debe calificarse desde ahí)
    const updated: StudyCard = {
      ...card,
      ease_factor: result.easeFactor,
      interval_days: result.intervalDays,
      repetitions: result.repetitions,
      review_count: card.review_count + 1,
    };
    setFlipped(false);
    setSession((s) => {
      if (!s) return s;
      const again = rating === 'again';
      const learning = again ? [...s.learning, { card: updated, due: now.getTime() + LEARN_MS }] : s.learning;
      const next = pickNext(s.queue, learning, Date.now());
      return { ...next, done: again ? s.done : s.done + 1, total: s.total, seq: s.seq + 1 };
    });
  };

  const exit = () => nav(deckParam ? `/flashcards?deck=${encodeURIComponent(deckParam)}` : '/flashcards');

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button onClick={exit} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500">
          ✕ Salir
        </button>
        {card && !finished && (
          <span className="text-sm font-bold text-slate-500">
            {remaining} {remaining === 1 ? 'restante' : 'restantes'}
          </span>
        )}
        <button
          onClick={toggleAutoplay}
          title={autoplay ? 'Los audios suenan solos' : 'Los audios se reproducen con el botón'}
          className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500"
        >
          {autoplay ? '🔊 Auto' : '🔇 Manual'}
        </button>
      </div>

      {save.isError && (
        <p className="mb-3 rounded-2xl bg-red-50 p-3 text-center text-sm font-bold text-red-600 dark:bg-red-950 dark:text-red-300">
          No se pudo guardar la última calificación. Revisa tu conexión.
        </p>
      )}

      {deck.isLoading && <p className="text-center text-slate-500">Cargando…</p>}
      {deck.error && <p className="text-center font-bold text-red-500">No se pudieron cargar las fichas.</p>}

      {deck.data && deck.data.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-xl font-extrabold">¡Estás al día!</h2>
          <p className="text-slate-500">No tienes fichas por estudiar hoy en este mazo.</p>
          <button onClick={exit} className="rounded-2xl bg-sky-500 px-5 py-3 font-extrabold text-white">
            Volver a Fichas
          </button>
        </div>
      )}

      {finished && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-xl font-extrabold">¡Terminaste por hoy!</h2>
          <p className="text-slate-500">Estudiaste {session?.done} fichas.</p>
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

              {card.imagen_ref && (
                <div className="my-3 flex justify-center">
                  <QuestionImage src={card.imagen_ref} />
                </div>
              )}

              {card.audio_ref && (
                <div className="flex justify-center">
                  <AudioButton src={card.audio_ref} />
                </div>
              )}

              {flipped && (
                <>
                  <hr className="border-slate-200 dark:border-slate-600" />
                  <p className="whitespace-pre-wrap text-lg">{card.back}</p>

                  {card.back_imagen_ref && (
                    <div className="my-3 flex justify-center">
                      <QuestionImage src={card.back_imagen_ref} />
                    </div>
                  )}

                  {card.back_audio_ref && (
                    <div className="flex justify-center">
                      <AudioButton src={card.back_audio_ref} />
                    </div>
                  )}
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
                {RATINGS.map((r, i) => (
                  <button
                    key={r.value}
                    onClick={() => handleRate(r.value)}
                    className={`rounded-2xl px-1 py-3 text-white ${r.className}`}
                  >
                    <span className="block text-sm font-extrabold">{r.label}</span>
                    <span className="block text-xs font-bold opacity-90">{previews?.[i]}</span>
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
