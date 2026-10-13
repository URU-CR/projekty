-- 004: příznak „k upřesnění“ a text otázky u úkolu
alter table public.tasks add column if not exists unclear boolean default false;
alter table public.tasks add column if not exists question text default '';
