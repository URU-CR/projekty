-- 020: rychlá poznámka k úkolu (krátký stav z denní kontroly; ikonka za čtverečkem, text v bublině)
alter table public.tasks add column if not exists quick_note text not null default '';
