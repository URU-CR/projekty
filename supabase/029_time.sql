-- 029: nepovinný čas milníku (HH:MM)
alter table public.tasks add column if not exists at_time text;
