-- Examen Cronometrado y Simulacro Sorpresa.
-- Seguro de ejecutar más de una vez.

-- 1) Un simulacro puede ser cronometrado: tiempo límite en minutos (null = sin límite)
alter table exams add column if not exists time_limit_min int;
alter table exams drop constraint if exists exams_time_limit_min_check;
alter table exams add constraint exams_time_limit_min_check check (time_limit_min is null or time_limit_min between 1 and 600);

-- 2) Un intento recuerda el límite con el que se hizo (en segundos; null = sin límite)
alter table attempts add column if not exists time_limit_sec int;

-- 3) Los intentos del Repaso Rápido y del Simulacro Sorpresa no pertenecen a un solo simulacro
alter table attempts alter column exam_id drop not null;

-- 4) Permitir los modos nuevos (busca la restricción que haya, sea cual sea su nombre)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.attempts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%retry_wrong%'
  loop
    execute format('alter table attempts drop constraint %I', c.conname);
  end loop;
end $$;
alter table attempts add constraint attempts_mode_check
  check (mode in ('full','retry_wrong','custom','quick_review','surprise'));
