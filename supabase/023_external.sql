-- 023: cizí (vnější) termín – úkol/milník se v grafu zobrazí jako svislá linka přes celý graf s popiskem v časové ose
alter table public.tasks add column if not exists external boolean not null default false;
