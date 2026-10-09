-- Bibliotecas = tabla folders (ya prevista en el esquema inicial).
-- Este script es seguro de ejecutar más de una vez.

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  parent_id uuid references folders on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

alter table exams add column if not exists folder_id uuid references folders on delete set null;

create index if not exists exams_user_id_folder_id_idx on exams (user_id, folder_id);
create index if not exists folders_user_id_idx on folders (user_id);

alter table folders enable row level security;

drop policy if exists "own rows" on folders;
drop policy if exists "folders_select_own" on folders;
drop policy if exists "folders_insert_own" on folders;
drop policy if exists "folders_update_own" on folders;
drop policy if exists "folders_delete_own" on folders;

create policy "folders_select_own"
  on folders for select
  using (user_id = auth.uid());

create policy "folders_insert_own"
  on folders for insert
  with check (user_id = auth.uid());

create policy "folders_update_own"
  on folders for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "folders_delete_own"
  on folders for delete
  using (user_id = auth.uid());
