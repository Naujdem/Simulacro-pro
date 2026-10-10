-- Fichas importadas de Anki: mazo (deck) y multimedia del reverso.
-- imagen_ref / audio_ref ya existen y siguen siendo la multimedia del FRENTE.
-- Este script es seguro de ejecutar más de una vez.

alter table flashcards add column if not exists deck text;
alter table flashcards add column if not exists back_imagen_ref text;
alter table flashcards add column if not exists back_audio_ref text;

create index if not exists flashcards_deck_idx on flashcards (deck);
create index if not exists flashcards_due_at_idx on flashcards (due_at);
