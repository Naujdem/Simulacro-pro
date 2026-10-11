-- Avance de simulacros y repasos para continuar en otro dispositivo (web <-> APK).
-- Una fila por usuario + simulacro + sesión ('full', 'wrong', 'saved', 'quick_review'…).
-- Al terminar una sesión la fila queda con data = null (así los otros dispositivos saben que ya se borró).
-- Este script es seguro de ejecutar más de una vez.

create table if not exists practice_progress (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exam_id text not null,
  slot text not null,
  saved_at bigint not null,
  data jsonb,
  primary key (user_id, exam_id, slot)
);

alter table practice_progress enable row level security;

drop policy if exists "practice_progress_select_own" on practice_progress;
drop policy if exists "practice_progress_insert_own" on practice_progress;
drop policy if exists "practice_progress_update_own" on practice_progress;
drop policy if exists "practice_progress_delete_own" on practice_progress;

create policy "practice_progress_select_own" on practice_progress for select using (user_id = auth.uid());
create policy "practice_progress_insert_own" on practice_progress for insert with check (user_id = auth.uid());
create policy "practice_progress_update_own" on practice_progress for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "practice_progress_delete_own" on practice_progress for delete using (user_id = auth.uid());
