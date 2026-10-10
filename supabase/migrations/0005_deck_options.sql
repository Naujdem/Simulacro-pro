-- Opciones por mazo (nuevas por día, máximo de repasos por día) y control del límite diario.
-- Este script es seguro de ejecutar más de una vez.

-- Momento en que una ficha se estudió por primera vez (para contar las "nuevas de hoy").
alter table flashcards add column if not exists introduced_at timestamptz;

create table if not exists flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  new_per_day int not null default 20 check (new_per_day between 0 and 9999),
  max_reviews_per_day int not null default 200 check (max_reviews_per_day between 0 and 9999),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table flashcard_decks enable row level security;

drop policy if exists "flashcard_decks_select_own" on flashcard_decks;
drop policy if exists "flashcard_decks_insert_own" on flashcard_decks;
drop policy if exists "flashcard_decks_update_own" on flashcard_decks;
drop policy if exists "flashcard_decks_delete_own" on flashcard_decks;

create policy "flashcard_decks_select_own"
  on flashcard_decks for select
  using (user_id = auth.uid());

create policy "flashcard_decks_insert_own"
  on flashcard_decks for insert
  with check (user_id = auth.uid());

create policy "flashcard_decks_update_own"
  on flashcard_decks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "flashcard_decks_delete_own"
  on flashcard_decks for delete
  using (user_id = auth.uid());

-- Hace que la API vea la tabla y la columna nuevas sin esperar.
notify pgrst, 'reload schema';
