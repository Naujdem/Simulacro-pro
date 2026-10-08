-- SimulaPro: esquema inicial
create extension if not exists pgcrypto;

-- Perfil + gamificación
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  daily_goal int not null default 10,
  xp int not null default 0,
  level int not null default 1,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_study_date date,
  created_at timestamptz not null default now()
);

create table folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  parent_id uuid references folders on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

create table exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  folder_id uuid references folders on delete set null,
  title text not null,
  description text,
  subject text,
  question_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una fila por pregunta; los datos específicos del tipo van en jsonb
create table questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  position int not null,
  type text not null check (type in
    ('multiple_choice','true_false','fill_blank','short_answer','ordering')),
  prompt text not null,
  options jsonb,
  answer jsonb not null,
  explanation text,
  created_at timestamptz not null default now()
);
-- Formas de `answer`:
--  multiple_choice: {"correct":["b"]}
--  true_false:      {"value":true}
--  fill_blank:      {"blanks":[["París","paris"],["Francia"]]}
--  short_answer:    {"accepted":["fotosíntesis"]}
--  ordering (F2):   {"order":["id3","id1","id2"]}

create table attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  exam_id uuid not null references exams on delete cascade,
  mode text not null default 'full' check (mode in ('full','retry_wrong','custom')),
  parent_attempt_id uuid references attempts,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_sec int,
  total int not null default 0,
  correct int not null default 0,
  score numeric(5,2),
  xp_earned int not null default 0
);

create table attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  question_id uuid references questions on delete set null,
  response jsonb not null,
  is_correct boolean not null,
  time_ms int,
  answered_at timestamptz not null default now()
);

create index on questions (exam_id, position);
create index on exams (user_id, folder_id);
create index on attempts (user_id, finished_at desc);
create index on attempt_answers (attempt_id);
create index on attempt_answers (user_id, question_id);

-- Perfil automático al registrarse
create function handle_new_user() returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- XP, nivel y racha (el cliente envía su fecha local para respetar la zona horaria)
create function record_study(p_xp int, p_today date) returns profiles
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid() for update;
  if p.last_study_date is null or p.last_study_date < p_today - 1 then
    p.current_streak := 1;
  elsif p.last_study_date = p_today - 1 then
    p.current_streak := p.current_streak + 1;
  end if; -- si ya estudió hoy, la racha no cambia
  update profiles set
    xp = xp + p_xp,
    level = floor(sqrt((xp + p_xp) / 100.0))::int + 1,
    current_streak = p.current_streak,
    longest_streak = greatest(longest_streak, p.current_streak),
    last_study_date = p_today
  where id = auth.uid()
  returning * into p;
  return p;
end $$;

-- Estadística por tema
create view subject_stats with (security_invoker = true) as
select a.user_id, coalesce(e.subject,'Sin tema') as subject,
       count(*) as answered,
       round(100.0 * avg(a.is_correct::int), 1) as accuracy
from attempt_answers a
join questions q on q.id = a.question_id
join exams e on e.id = q.exam_id
group by a.user_id, coalesce(e.subject,'Sin tema');

-- RLS: cada usuario solo ve lo suyo
do $$ declare t text; begin
  foreach t in array array['folders','exams','questions','attempts','attempt_answers'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all
      using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table profiles enable row level security;
create policy "own profile" on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());
