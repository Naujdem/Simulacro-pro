import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import QuestionImage from '@/components/QuestionImage';
import { AudioButton } from '@/components/AudioButton';
import { playAudioSequence, prefetchRefs, stopAudio } from '@/lib/playAudio';
import { describeInterval, nextReview, type Rating, type Sm2Result } from './sm2';
import { isMissingColumn } from './columns';
import { buildStudyQueue } from './api';
import { isNewCard } from './decks';
import { pickNext, type LearningEntry } from './studySession';
import { formatCardText, splitRefs, type CardLine } from './media';
import type { StudyCard } from './types';

const RATINGS: { value: Rating; label: string; className: string }[] = [
  { value: 'again', label: 'Otra vez', className: 'bg-red-500' },
  { value: 'hard', label: 'Difícil', className: 'bg-orange-500' },
  { value: 'good', label: 'Bien', className: 'bg-green-500' },
  { value: 'easy', label: 'Fácil', className: 'bg-sky-500' },
];

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

  // Cuánto tardará en volver a salir la ficha según el botón: "1 min", "6 min", "10 min", "1 d"…
  const previews = useMemo(() => {
    if (!card) return null;
    const state = {
      easeFactor: Number(card.ease_factor),
      intervalDays: card.interval_days,
      repetitions: card.repetitions,
      step: card.step,
    };
    const now = new Date();
    return RATINGS.map((r) => describeInterval(nextReview(state, r.value, now)));
  }, [card]);

  const frontAudios = useMemo(() => splitRefs(card?.audio_ref), [card]);
  const backAudios = useMemo(() => splitRefs(card?.back_audio_ref), [card]);
  const backLines = useMemo(() => (card ? formatCardText(card.back) : []), [card]);

  // Audios del frente al mostrar la ficha; los del reverso al voltearla (si hay varios, suenan uno tras otro)
  useEffect(() => {
    if (!card || !autoplay || !frontAudios.length) return;
    playAudioSequence(frontAudios).catch(() => {}); // si el navegador bloquea el autoplay, quedan los botones
    return () => stopAudio();
  }, [seq, autoplay]);

  useEffect(() => {
    if (!flipped || !card || !autoplay || !backAudios.length) return;
    playAudioSequence(backAudios).catch(() => {});
  }, [flipped, seq, autoplay]);

  // Descarga por adelantado lo que viene para que no haya espera
  useEffect(() => {
    if (!session) return;
    const upcoming = [session.current, ...session.queue.slice(0, 3)].filter((c): c is StudyCard => !!c);
    prefetchRefs(
      upcoming.flatMap((c) => [c.imagen_ref, c.back_imagen_ref, ...splitRefs(c.audio_ref), ...splitRefs(c.back_audio_ref)]),
    );
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
      {
        easeFactor: Number(card.ease_factor),
        intervalDays: card.interval_days,
        repetitions: card.repetitions,
        step: card.step,
      },
      rating,
      now,
    );
    save.mutate({ card, rating, result, now });

    // La ficha con su estado nuevo (si sigue aprendiéndose vuelve a salir en esta sesión y debe calificarse desde ahí)
    const updated: StudyCard = {
      ...card,
      ease_factor: result.easeFactor,
      interval_days: result.intervalDays,
      repetitions: result.repetitions,
      review_count: card.review_count + 1,
      step: result.step,
    };
    const stays = result.delayMinutes !== undefined; // todavía en minutos: no cuenta como terminada
    setFlipped(false);
    setSession((s) => {
      if (!s) return s;
      const learning = stays
        ? [...s.learning, { card: updated, due: now.getTime() + (result.delayMinutes ?? 0) * 60_000 }]
        : s.learning;
      const next = pickNext(s.queue, learning, Date.now());
      return { ...next, done: stays ? s.done : s.done + 1, total: s.total, seq: s.seq + 1 };
    });
  };

  const exit = () => nav(deckParam ? `/flashcards?deck=${encodeURIComponent(deckParam)}` : '/flashcards');

  // Alto de la pantalla fijo: el contenido de la ficha se desplaza por dentro y los botones nunca salen de la vista
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col overflow-hidden px-3 pt-2">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <button onClick={exit} className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-500">
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
          className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-500"
        >
          {autoplay ? '🔊 Auto' : '🔇 Manual'}
        </button>
      </div>

      {save.isError && (
        <p className="mb-2 shrink-0 rounded-2xl bg-red-50 p-2 text-center text-sm font-bold text-red-600 dark:bg-red-950 dark:text-red-300">
          No se pudo guardar la última calificación. Revisa tu conexión.
        </p>
      )}

      {deck.isLoading && <p className="text-center text-slate-500">Cargando…</p>}
      {deck.error && <p className="text-center font-bold text-red-500">No se pudieron cargar las fichas.</p>}

      {deck.data && deck.data.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-xl font-bold">¡Estás al día!</h2>
          <p className="text-slate-500">No tienes fichas por estudiar hoy en este mazo.</p>
          <button onClick={exit} className="rounded-2xl bg-sky-500 px-5 py-3 font-bold text-white">
            Volver a Fichas
          </button>
        </div>
      )}

      {finished && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="text-xl font-bold">¡Terminaste por hoy!</h2>
          <p className="text-slate-500">Estudiaste {session?.done} fichas.</p>
          <button onClick={exit} className="rounded-2xl bg-sky-500 px-5 py-3 font-bold text-white">
            Volver a Fichas
          </button>
        </div>
      )}

      {card && !finished && (
        <>
          {/* Zona de la ficha: ocupa el espacio que sobra y solo ella se desplaza si no cabe */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="my-auto space-y-4 rounded-3xl bg-white px-5 py-6 shadow-sm dark:bg-slate-800">
              {/* Frente: al voltear queda arriba, pequeño, como recordatorio de la pregunta */}
              {card.front && (
                <p
                  className={
                    flipped
                      ? 'whitespace-pre-wrap text-center text-sm font-semibold text-slate-400'
                      : 'whitespace-pre-wrap text-center text-2xl font-bold'
                  }
                >
                  {card.front}
                </p>
              )}

              {!flipped && card.imagen_ref && (
                <div className="flex justify-center">
                  <QuestionImage src={card.imagen_ref} maxHeight="max-h-[40dvh]" />
                </div>
              )}
              {flipped && (card.back_imagen_ref || card.imagen_ref) && (
                <div className="flex justify-center">
                  <QuestionImage src={(card.back_imagen_ref || card.imagen_ref)!} maxHeight="max-h-[28dvh]" />
                </div>
              )}

              {/* Un botón por audio, todos del mismo tamaño */}
              {(frontAudios.length > 0 || (flipped && backAudios.length > 0)) && (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {frontAudios.map((ref) => (
                    <AudioButton key={ref} src={ref} />
                  ))}
                  {flipped && backAudios.map((ref) => <AudioButton key={ref} src={ref} />)}
                </div>
              )}

              {flipped && backLines.length > 0 && <CardBack lines={backLines} />}
            </div>
          </div>

          <div className="shrink-0 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {!flipped ? (
              <button
                onClick={() => setFlipped(true)}
                className="w-full rounded-2xl bg-sky-500 py-4 text-lg font-bold text-white"
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
                    <span className="block text-sm font-bold">{r.label}</span>
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

/* ───────────── Reverso con jerarquía visual ───────────── */

// Cabecera centrada (palabra, pronunciación, traducción) y debajo cada definición en su propio bloque,
// alineada a la izquierda y con su ejemplo debajo, para que no quede todo apiñado y centrado.
export function CardBack({ lines }: { lines: CardLine[] }) {
  const header: CardLine[] = [];
  const blocks: CardLine[][] = [];
  for (const l of lines) {
    if (l.kind === 'long') blocks.push([l]);
    else if (l.kind === 'example') (blocks.at(-1) ?? blocks[blocks.push([]) - 1]).push(l);
    else if (blocks.length) blocks.at(-1)!.push(l);
    else header.push(l);
  }

  return (
    <div className="space-y-3">
      {header.length > 0 && (
        <div className="space-y-1 text-center">
          {header.map((l, i) => (
            <p key={i} className={HEADER_STYLE[l.kind]}>
              {l.text}
            </p>
          ))}
        </div>
      )}
      {blocks.map((b, i) => (
        <div key={i} className="space-y-1.5 rounded-2xl bg-slate-50 p-3 text-left dark:bg-slate-900/50">
          {b.map((l, j) =>
            l.kind === 'example' ? (
              <p key={j} className="border-l-2 border-sky-400 pl-3 text-[15px] italic leading-snug text-slate-500 dark:text-slate-400">
                {l.text}
              </p>
            ) : (
              <p key={j} className="text-[15px] leading-snug">
                {l.text}
              </p>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

const HEADER_STYLE: Record<CardLine['kind'], string> = {
  title: 'text-2xl font-bold',
  phonetic: 'text-sm text-slate-400',
  short: 'text-lg font-semibold text-sky-600 dark:text-sky-300',
  long: 'text-[15px]',
  example: 'text-[15px] italic',
};
