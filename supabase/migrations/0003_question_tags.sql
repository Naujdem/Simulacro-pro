-- Autoevaluación por pregunta: Mal, Ok, Bien, Excelente.
-- Este script es seguro de ejecutar más de una vez.

create table if not exists question_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  question_id uuid not null references questions on delete cascade,
  exam_id uuid not null references exams on delete cascade,
  tag text not null check (tag in ('mal', 'ok', 'bien', 'excelente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create index if not exists question_tags_user_exam_idx on question_tags (user_id, exam_id);
create index if not exists question_tags_user_tag_idx on question_tags (user_id, tag);

alter table question_tags enable row level security;

drop policy if exists "own rows" on question_tags;
drop policy if exists "question_tags_select_own" on question_tags;
drop policy if exists "question_tags_insert_own" on question_tags;
drop policy if exists "question_tags_update_own" on question_tags;
drop policy if exists "question_tags_delete_own" on question_tags;

create policy "question_tags_select_own"
  on question_tags for select
  using (user_id = auth.uid());

create policy "question_tags_insert_own"
  on question_tags for insert
  with check (user_id = auth.uid());

create policy "question_tags_update_own"
  on question_tags for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "question_tags_delete_own"
  on question_tags for delete
  using (user_id = auth.uid());
