-- 021: ToDo bez priority (pri = 0 je výchozí; 1 = A, 2 = B, 3 = C)
alter table public.todos drop constraint if exists todos_pri_check;
alter table public.todos add constraint todos_pri_check check (pri between 0 and 3);
alter table public.todos alter column pri set default 0;
