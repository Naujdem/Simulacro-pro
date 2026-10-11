-- Sugerencias de estudio con IA: se guardan por usuario y simulacro.
-- Seguro de ejecutar más de una vez.

create table if not exists study_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  exam_id uuid references exams on delete set null,
  title text not null,
  content text not null,
  failed_count int not null default 0,
  helpful boolean,
  created_at timestamptz not null default now()
);
create index if not exists study_suggestions_user_idx on study_suggestions (user_id, created_at desc);

alter table study_suggestions enable row level security;
drop policy if exists "study_suggestions_select_own" on study_suggestions;
drop policy if exists "study_suggestions_insert_own" on study_suggestions;
drop policy if exists "study_suggestions_update_own" on study_suggestions;
drop policy if exists "study_suggestions_delete_own" on study_suggestions;
create policy "study_suggestions_select_own" on study_suggestions for select using (user_id = auth.uid());
create policy "study_suggestions_insert_own" on study_suggestions for insert with check (user_id = auth.uid());
create policy "study_suggestions_update_own" on study_suggestions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "study_suggestions_delete_own" on study_suggestions for delete using (user_id = auth.uid());
