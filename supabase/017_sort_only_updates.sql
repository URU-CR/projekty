-- 017: řazení (sort) a sbalení (collapsed) smí změnit každý člen, který úkol vidí.
-- Při vložení úkolu doprostřed seznamu aplikace přečísluje sort u následujících úkolů; řešitel na ně jinak nemá právo.
-- Politika UPDATE se rozšíří o větev „jen sort/collapsed“, kterou hlídá trigger: pokud uživatel nemá plné právo,
-- jakákoli jiná změna než sort/collapsed se odmítne.

create or replace function public.task_update_allowed(t public.tasks) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_edit_task_g(t.project_id, t.group_id, t.resp, t.collab)
      or (public.is_member(t.project_id) and public.group_visible(t.project_id, t.group_id))
$$;

create or replace function public.tasks_restrict_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.can_edit_task_g(old.project_id, old.group_id, old.resp, old.collab) then return new; end if;
  -- bez plného práva: povoleno jen sort a collapsed
  if row(new.name,new.start_date,new.end_date,new.group_id,new.color,new.resp,new.collab,new.critical,new.milestone,new.progress,new.auto_prog,new.note,new.deps,new.parent_id,new.unclear,new.question,new.project_id)
     is distinct from
     row(old.name,old.start_date,old.end_date,old.group_id,old.color,old.resp,old.collab,old.critical,old.milestone,old.progress,old.auto_prog,old.note,old.deps,old.parent_id,old.unclear,old.question,old.project_id)
  then
    raise exception 'new row violates row-level security policy for table "tasks"' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists restrict_task_update on public.tasks;
create trigger restrict_task_update before update on public.tasks for each row execute function public.tasks_restrict_update();

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.task_update_allowed(tasks)) with check (public.task_update_allowed(tasks));

-- vkládání: INSERT ... ON CONFLICT DO UPDATE kontroluje i INSERT politiku pro existující řádky; proto totéž i tam
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_edit_task_g(project_id, group_id, resp, collab)
              or exists (select 1 from public.tasks x where x.id = id and public.is_member(x.project_id) and public.group_visible(x.project_id, x.group_id)));
