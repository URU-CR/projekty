-- 019: denní seznam ToDo – nadpisy skupin a ruční pořadí (přetažení)
alter table public.todos add column if not exists heading boolean not null default false;  -- řádek je nadpis skupiny položek (bez zaškrtávání)
alter table public.todos add column if not exists ord int not null default 0;              -- ruční pořadí v denním seznamu (v rámci dne)
