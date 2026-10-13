-- 018: denní řízení – „Dnes zkontrolováno“ u úkolu a vazba osobního ToDo na úkol
-- tasks.checked_on: datum, kdy byl stav úkolu naposledy odsouhlasen bez dalšího opatření (ikona ✓ na konci baru platí jen v ten den)
alter table public.tasks add column if not exists checked_on date;
-- todos.task_ref: osobní ToDo „Kontrola <úkol>“ odkazuje na úkol (ikona ☐ na baru, dokud není odškrtnuto); smazání úkolu vazbu jen zruší
alter table public.todos add column if not exists task_ref uuid references public.tasks(id) on delete set null;
create index if not exists todos_task_ref_idx on public.todos(task_ref) where task_ref is not null;
