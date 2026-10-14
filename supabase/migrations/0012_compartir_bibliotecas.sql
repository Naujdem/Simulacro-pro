-- Compartir BIBLIOTECAS por enlace (/b/<short_id>) + "Guardar biblioteca en mi cuenta".
-- Una biblioteca compartida incluye sus subbibliotecas y todos sus simulacros.
-- Va aparte de shared_links (enlaces de un simulacro). Seguro de ejecutar más de una vez.

create table if not exists shared_folder_links (
  id uuid primary key default gen_random_uuid(),
  short_id text not null unique,
  folder_id uuid not null references folders on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  views int not null default 0,
  copies int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Un solo enlace por biblioteca (se puede desactivar y volver a activar)
create unique index if not exists shared_folder_links_folder_uidx on shared_folder_links (folder_id);
create index if not exists shared_folder_links_user_idx on shared_folder_links (user_id, created_at desc);

alter table shared_folder_links enable row level security;
drop policy if exists "shared_folder_links_select_own" on shared_folder_links;
drop policy if exists "shared_folder_links_insert_own" on shared_folder_links;
drop policy if exists "shared_folder_links_update_own" on shared_folder_links;
drop policy if exists "shared_folder_links_delete_own" on shared_folder_links;
create policy "shared_folder_links_select_own" on shared_folder_links for select using (user_id = auth.uid());
create policy "shared_folder_links_insert_own" on shared_folder_links for insert
  with check (user_id = auth.uid() and exists (select 1 from folders f where f.id = folder_id and f.user_id = auth.uid()));
create policy "shared_folder_links_update_own" on shared_folder_links for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shared_folder_links_delete_own" on shared_folder_links for delete using (user_id = auth.uid());

-- ───────────── Ayudas internas (solo las usan las otras funciones) ─────────────

-- Ids de una biblioteca y de todas sus subbibliotecas, a cualquier nivel. "union" (sin "all") corta cualquier ciclo.
create or replace function _folder_tree(p_root uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive t as (
    select id from folders where id = p_root
    union
    select f.id from folders f join t on f.parent_id = t.id
  )
  select id from t;
$$;
revoke execute on function _folder_tree(uuid) from public, anon, authenticated;

-- Copia UN simulacro (con lecturas y preguntas) a la cuenta `uid`, dentro de la biblioteca `p_folder` (o sin biblioteca si es null).
-- Misma lógica que copy_shared_exam, pero conserva el orden y el tiempo límite. Las referencias gd: que no estén en
-- p_image_map se dejan vacías: nunca queda nada apuntando al Drive ajeno.
create or replace function _copy_exam_into(src exams, uid uuid, p_folder uuid, p_image_map jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
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
  insert into exams (id, user_id, folder_id, title, description, subject, question_count, time_limit_min, position)
  values (new_exam, uid, p_folder, src.title, src.description, src.subject, 0, src.time_limit_min, src.position);

  for r in select * from reading_texts where exam_id = src.id order by position loop
    new_id := gen_random_uuid();
    j := to_jsonb(r) || jsonb_build_object('id', new_id, 'exam_id', new_exam, 'user_id', uid, 'created_at', now());
    insert into reading_texts select * from jsonb_populate_record(null::reading_texts, j);
    rmap := rmap || jsonb_build_object(r.id::text, new_id);
  end loop;

  for q in select * from questions where exam_id = src.id order by position loop
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
  return new_exam;
end $$;
revoke execute on function _copy_exam_into(exams, uuid, uuid, jsonb) from public, anon, authenticated;

-- ───────────── Lectura pública (sin login) ─────────────

-- La biblioteca compartida: su nombre, sus subbibliotecas y la lista de simulacros (solo datos de portada, sin preguntas).
-- Suma una vista; las del propio creador no cuentan. Las preguntas se piden de a un simulacro con get_shared_folder_exam.
create or replace function get_shared_folder(p_short text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l shared_folder_links; root folders;
begin
  select * into l from shared_folder_links where short_id = p_short and is_active;
  if not found then return null; end if;
  select * into root from folders where id = l.folder_id;
  if not found then return null; end if;
  if auth.uid() is distinct from l.user_id then
    update shared_folder_links set views = views + 1 where id = l.id;
  end if;
  return jsonb_build_object(
    'short_id', l.short_id,
    'is_owner', auth.uid() is not distinct from l.user_id,
    'folder', jsonb_build_object('id', root.id, 'name', root.name, 'description', root.description, 'color', root.color),
    'folders', coalesce((
      select jsonb_agg(jsonb_build_object('id', fo.id, 'parent_id', fo.parent_id, 'name', fo.name,
                                          'color', fo.color, 'description', fo.description) order by fo.created_at)
      from folders fo where fo.id in (select _folder_tree(root.id)) and fo.id <> root.id), '[]'::jsonb),
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object('id', ex.id, 'folder_id', ex.folder_id, 'title', ex.title,
                                          'description', ex.description, 'subject', ex.subject,
                                          'question_count', ex.question_count, 'time_limit_min', ex.time_limit_min)
                       order by ex.position nulls last, ex.created_at)
      from exams ex where ex.folder_id in (select _folder_tree(root.id))), '[]'::jsonb)
  );
end $$;
grant execute on function get_shared_folder(text) to anon, authenticated;

-- Un simulacro de la biblioteca compartida, con la misma forma que get_shared_exam (así se reutiliza la pantalla de hacerlo).
-- Solo entrega simulacros que estén dentro del árbol de un enlace ACTIVO. No suma vistas (ya se contó al abrir la biblioteca).
create or replace function get_shared_folder_exam(p_short text, p_exam uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l shared_folder_links; ex exams;
begin
  select * into l from shared_folder_links where short_id = p_short and is_active;
  if not found then return null; end if;
  select * into ex from exams where id = p_exam and folder_id in (select _folder_tree(l.folder_id));
  if not found then return null; end if;
  return jsonb_build_object(
    'short_id', l.short_id,
    'is_owner', auth.uid() is not distinct from l.user_id,
    'exam', jsonb_build_object('title', ex.title, 'description', ex.description, 'subject', ex.subject,
                               'time_limit_min', ex.time_limit_min, 'question_count', ex.question_count),
    'readings', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' - 'exam_id' order by r.position)
                          from reading_texts r where r.exam_id = ex.id), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(to_jsonb(q) - 'user_id' - 'exam_id' order by q.position)
                           from questions q where q.exam_id = ex.id), '[]'::jsonb)
  );
end $$;
grant execute on function get_shared_folder_exam(text, uuid) to anon, authenticated;

-- Todas las referencias gd: (imágenes y audios) de la biblioteca compartida, para que la app las copie al Drive del usuario.
create or replace function get_shared_folder_media(p_short text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l shared_folder_links;
begin
  select * into l from shared_folder_links where short_id = p_short and is_active;
  if not found then return null; end if;
  return coalesce((
    select jsonb_agg(distinct ref)
    from questions q
    join exams ex on ex.id = q.exam_id and ex.folder_id in (select _folder_tree(l.folder_id)),
    lateral unnest(array[to_jsonb(q) ->> 'imagen_url', to_jsonb(q) ->> 'audio_url']) as ref
    where ref like 'gd:%'), '[]'::jsonb);
end $$;
grant execute on function get_shared_folder_media(text) to anon, authenticated;

-- ───────────── Copiar a mi cuenta ─────────────
-- Copia la biblioteca completa: la biblioteca (queda en el primer nivel de la cuenta), sus subbibliotecas con la misma
-- estructura y todos sus simulacros (con lecturas y preguntas). NO se copian fichas, progreso, etiquetas ni intentos.
-- p_image_map: { "gd:<id viejo>": "gd:<id nuevo>" }, igual que en copy_shared_exam. Devuelve el id de la biblioteca nueva.
create or replace function copy_shared_folder(p_short text, p_image_map jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  l shared_folder_links;
  fo folders;
  ex exams;
  fmap jsonb := '{}'::jsonb;
  new_id uuid;
  new_root uuid;
begin
  if uid is null then raise exception 'Debes iniciar sesión para guardar la biblioteca.'; end if;
  select * into l from shared_folder_links where short_id = p_short and is_active;
  if not found then raise exception 'Este enlace ya no está disponible.'; end if;
  if not exists (select 1 from folders where id = l.folder_id) then raise exception 'La biblioteca ya no existe.'; end if;

  -- Primero las bibliotecas, de arriba hacia abajo (cada madre antes que sus hijas)
  for fo in
    with recursive t as (
      select id, 0 as depth from folders where id = l.folder_id
      union all
      select c.id, t.depth + 1 from folders c join t on c.parent_id = t.id where t.depth < 50
    )
    select f2.* from folders f2 join t on t.id = f2.id order by t.depth, f2.created_at
  loop
    new_id := gen_random_uuid();
    insert into folders (id, user_id, parent_id, name, color, description)
    values (new_id, uid,
            case when fo.id = l.folder_id then null else (fmap ->> fo.parent_id::text)::uuid end,
            fo.name, fo.color, fo.description);
    fmap := fmap || jsonb_build_object(fo.id::text, new_id);
    if fo.id = l.folder_id then new_root := new_id; end if;
  end loop;

  -- Luego los simulacros, cada uno en su biblioteca nueva
  for ex in select * from exams where folder_id in (select _folder_tree(l.folder_id)) order by position nulls last, created_at loop
    perform _copy_exam_into(ex, uid, (fmap ->> ex.folder_id::text)::uuid, p_image_map);
  end loop;

  if uid <> l.user_id then
    update shared_folder_links set copies = copies + 1 where id = l.id;
  end if;
  return new_root;
end $$;
revoke execute on function copy_shared_folder(text, jsonb) from public, anon;
grant execute on function copy_shared_folder(text, jsonb) to authenticated;

-- ───────────── Permiso para el servidor de archivos (Edge Function drive-public) ─────────────
-- Ahora un archivo también se entrega si pertenece a un simulacro dentro de una biblioteca con enlace activo.
-- La Edge Function no cambia: sigue mandando { short_id, file_id }.
create or replace function shared_file_allowed(p_short text, p_file text) returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from shared_links l join questions q on q.exam_id = l.exam_id
    where l.short_id = p_short and l.is_active
      and ('gd:' || p_file) in (to_jsonb(q) ->> 'imagen_url', to_jsonb(q) ->> 'audio_url')
  ) or exists (
    select 1
    from shared_folder_links fl, exams ex, questions q
    where fl.short_id = p_short and fl.is_active
      and ex.folder_id in (select _folder_tree(fl.folder_id))
      and q.exam_id = ex.id
      and ('gd:' || p_file) in (to_jsonb(q) ->> 'imagen_url', to_jsonb(q) ->> 'audio_url')
  );
$$;
revoke execute on function shared_file_allowed(text, text) from public, anon, authenticated;
grant execute on function shared_file_allowed(text, text) to service_role;
