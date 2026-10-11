-- Importador JSON: descripción de biblioteca, orden de simulacros, lecturas y nuevos tipos de pregunta.
-- Este script es seguro de ejecutar más de una vez.

alter table folders add column if not exists description text;
alter table exams   add column if not exists position int;

create table if not exists reading_texts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  exam_id uuid not null references exams on delete cascade,
  position int not null default 0,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists reading_texts_exam_idx on reading_texts (exam_id, position);

alter table reading_texts enable row level security;
drop policy if exists "reading_texts_select_own" on reading_texts;
drop policy if exists "reading_texts_insert_own" on reading_texts;
drop policy if exists "reading_texts_update_own" on reading_texts;
drop policy if exists "reading_texts_delete_own" on reading_texts;
create policy "reading_texts_select_own" on reading_texts for select using (user_id = auth.uid());
create policy "reading_texts_insert_own" on reading_texts for insert with check (user_id = auth.uid());
create policy "reading_texts_update_own" on reading_texts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reading_texts_delete_own" on reading_texts for delete using (user_id = auth.uid());

alter table questions add column if not exists reading_id uuid references reading_texts on delete set null;
create index if not exists questions_reading_idx on questions (reading_id);

-- Permitir los tipos nuevos (busca la restricción que haya, sea cual sea su nombre)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.questions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%multiple_choice%'
  loop
    execute format('alter table public.questions drop constraint %I', c.conname);
  end loop;

  alter table public.questions add constraint questions_type_check
    check (type in ('multiple_choice','true_false','fill_blank','short_answer','ordering','order_words','transform'))
    not valid;
end $$;
