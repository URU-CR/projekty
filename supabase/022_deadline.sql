-- 022: deadline projektu (finální termín – červená linka s plamenem; úkoly ho mohou přesahovat) a odpočet
alter table public.projects add column if not exists deadline date;
alter table public.projects add column if not exists countdown boolean not null default false;
