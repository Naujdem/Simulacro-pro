-- Compartir simulacros por enlace (/s/<short_id>) + "Guardar en mi cuenta".
-- Seguro de ejecutar más de una vez.

create table if not exists shared_links (
  id uuid primary key default gen_random_uuid(),
  short_id text not null unique,
  exam_id uuid not null references exams on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  views int not null default 0,
  copies int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Un solo enlace por simulacro (se puede desactivar y volver a activar)
create unique index if not exists shared_links_exam_uidx on shared_links (exam_id);
create index if not exists shared_links_user_idx on shared_links (user_id, created_at desc);

alter table shared_links enable row level security;
drop policy if exists "shared_links_select_own" on shared_links;
drop policy if exists "shared_links_insert_own" on shared_links;
drop policy if exists "shared_links_update_own" on shared_links;
drop policy if exists "shared_links_delete_own" on shared_links;
create policy "shared_links_select_own" on shared_links for select using (user_id = auth.uid());
create policy "shared_links_insert_own" on shared_links for insert
  with check (user_id = auth.uid() and exists (select 1 from exams e where e.id = exam_id and e.user_id = auth.uid()));
create policy "shared_links_update_own" on shared_links for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shared_links_delete_own" on shared_links for delete using (user_id = auth.uid());

-- ───────────── Lectura pública (sin login) ─────────────
-- En vez de abrir las tablas exams/questions a todo el mundo, la lectura pública pasa SOLO por esta función:
-- devuelve únicamente el simulacro de un enlace activo (y suma una vista; las del propio creador no cuentan).
create or replace function get_shared_exam(p_short text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l shared_links; e exams;
begin
  select * into l from shared_links where short_id = p_short and is_active;
  if not found then return null; end if;
  select * into e from exams where id = l.exam_id;
  if not found then return null; end if;
  if auth.uid() is distinct from l.user_id then
    update shared_links set views = views + 1 where id = l.id;
  end if;
  return jsonb_build_object(
    'short_id', l.short_id,
    'is_owner', auth.uid() is not distinct from l.user_id,
    'exam', jsonb_build_object('title', e.title, 'description', e.description, 'subject', e.subject,
                               'time_limit_min', e.time_limit_min, 'question_count', e.question_count),
    'readings', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' - 'exam_id' order by r.position)
                          from reading_texts r where r.exam_id = e.id), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(to_jsonb(q) - 'user_id' - 'exam_id' order by q.position)
                           from questions q where q.exam_id = e.id), '[]'::jsonb)
  );
end $$;
grant execute on function get_shared_exam(text) to anon, authenticated;

-- ───────────── Copiar a mi cuenta ─────────────
-- p_image_map: { "gd:<id viejo>": "gd:<id nuevo>" } (lo arma la app tras copiar los archivos al Drive del usuario).
-- Una referencia gd: que no esté en el mapa (porque no se pudo copiar) se deja vacía: nunca queda apuntando al Drive ajeno.
-- Se copian: simulacro, lecturas (con su orden y sección) y preguntas. NO se copian fichas, progreso, etiquetas ni intentos.
create or replace function copy_shared_exam(p_short text, p_image_map jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  l shared_links;
  e exams;
  new_exam uuid := gen_random_uuid();
  rmap jsonb := '{}'::jsonb;
  r reading_texts;
  q questions;
  j jsonb;
  new_id uuid;
  n int := 0;
  k text;
  ref text;
begin
  if uid is null then raise exception 'Debes iniciar sesión para guardar el simulacro.'; end if;
  select * into l from shared_links where short_id = p_short and is_active;
  if not found then raise exception 'Este enlace ya no está disponible.'; end if;
  select * into e from exams where id = l.exam_id;
  if not found then raise exception 'El simulacro ya no existe.'; end if;

  insert into exams (id, user_id, title, description, subject, question_count, time_limit_min)
  values (new_exam, uid, e.title, e.description, e.subject, 0, e.time_limit_min);

  for r in select * from reading_texts where exam_id = e.id order by position loop
    new_id := gen_random_uuid();
    j := to_jsonb(r) || jsonb_build_object('id', new_id, 'exam_id', new_exam, 'user_id', uid, 'created_at', now());
    insert into reading_texts select * from jsonb_populate_record(null::reading_texts, j);
    rmap := rmap || jsonb_build_object(r.id::text, new_id);
  end loop;

  for q in select * from questions where exam_id = e.id order by position loop
    j := to_jsonb(q) || jsonb_build_object(
      'id', gen_random_uuid(), 'exam_id', new_exam, 'user_id', uid, 'created_at', now(),
      'reading_id', case when q.reading_id is null then null else rmap ->> q.reading_id::text end);
    foreach k in array array['imagen_url', 'audio_url'] loop
      ref := j ->> k;
      if ref is not null and ref like 'gd:%' then
        j := jsonb_set(j, array[k], coalesce(to_jsonb(p_image_map ->> ref), 'null'::jsonb));
      end if;
    end loop;
    insert into questions select * from jsonb_populate_record(null::questions, j);
    n := n + 1;
  end loop;

  update exams set question_count = n where id = new_exam;
  if uid <> l.user_id then
    update shared_links set copies = copies + 1 where id = l.id;
  end if;
  return new_exam;
end $$;
revoke execute on function copy_shared_exam(text, jsonb) from public, anon;
grant execute on function copy_shared_exam(text, jsonb) to authenticated;

-- ───────────── Permiso para el servidor de archivos (Edge Function drive-public) ─────────────
-- ¿Este archivo de Drive pertenece a un simulacro con enlace activo? Solo la usa el servidor (service_role).
create or replace function shared_file_allowed(p_short text, p_file text) returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from shared_links l join questions q on q.exam_id = l.exam_id
    where l.short_id = p_short and l.is_active
      and ('gd:' || p_file) in (to_jsonb(q) ->> 'imagen_url', to_jsonb(q) ->> 'audio_url')
  );
$$;
revoke execute on function shared_file_allowed(text, text) from public, anon, authenticated;
grant execute on function shared_file_allowed(text, text) to service_role;
