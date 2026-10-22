-- Super simulacro: permitir el modo nuevo 'super' en los intentos.
-- Seguro de ejecutar más de una vez.

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
  check (mode in ('full','retry_wrong','custom','quick_review','surprise','super'));
