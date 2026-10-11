-- Secciones dentro de un simulacro (Gramática, Lectura 1, …).
-- Este script es seguro de ejecutar más de una vez.

alter table questions     add column if not exists section text;
alter table reading_texts add column if not exists section text;
