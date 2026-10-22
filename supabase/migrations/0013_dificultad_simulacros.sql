-- Dificultad de un simulacro, calificada por ti con estrellas (1 a 5; null = sin calificar).
-- Sirve para elegir simulacros difíciles o balanceados en el Super simulacro.
-- Seguro de ejecutar más de una vez.

alter table exams add column if not exists difficulty smallint;
alter table exams drop constraint if exists exams_difficulty_check;
alter table exams add constraint exams_difficulty_check check (difficulty is null or difficulty between 1 and 5);
