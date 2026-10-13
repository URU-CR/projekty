-- 009: pravidla pro vkládání nesmí vyžadovat „autor = já“ (upsert cizího řádku vedoucím padal na RLS).
-- Autorství doplňují triggery, RLS kontroluje jen roli.

create or replace function public.set_owner_cols() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'proposals'  and new.created_by is null then new.created_by := auth.uid(); end if;
  if tg_table_name = 'tasks'      and new.created_by is null then new.created_by := auth.uid(); end if;
  if tg_table_name = 'todos'      and new.owner      is null then new.owner      := auth.uid(); end if;
  if tg_table_name = 'task_log'   and new.author     is null then new.author     := auth.uid(); end if;
  if tg_table_name = 'proposal_versions' and new.author is null then new.author := auth.uid(); end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['proposals','tasks','todos','task_log','proposal_versions'] loop
    execute format('drop trigger if exists set_owner_%1$s on public.%1$s', t);
    execute format('create trigger set_owner_%1$s before insert on public.%1$s for each row execute function public.set_owner_cols()', t);
  end loop; end $$;

-- návrhy
drop policy if exists prop_insert on public.proposals;
create policy prop_insert on public.proposals for insert to authenticated
  with check (public.group_editable(project_id, group_id));

-- úkoly: řešitel může vložit/aktualizovat i úkol, kde je spolupracovník (shodně s pravidlem pro update)
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_edit_task(project_id, resp, collab));

-- ToDo: osobní jen vlastní; projektové podle role
drop policy if exists todos_insert on public.todos;
create policy todos_insert on public.todos for insert to authenticated
  with check ((project_id is null and task_id is null and (owner is null or owner = auth.uid()))
              or (project_id is not null and public.can_write(project_id)));

-- deník: podle role; autor se doplní triggerem
drop policy if exists log_insert on public.task_log;
create policy log_insert on public.task_log for insert to authenticated
  with check (public.can_write(public.task_project(task_id)));

-- verze návrhu
drop policy if exists pv_insert on public.proposal_versions;
create policy pv_insert on public.proposal_versions for insert to authenticated
  with check (public.group_editable(project_id, public.proposal_group(proposal_id)));
