-- 025: urgence – 3. stav čtverečku denní kontroly (datum, kdy urgovat); filtr „Urgovat dnes“
alter table public.tasks add column if not exists urge_on date;
