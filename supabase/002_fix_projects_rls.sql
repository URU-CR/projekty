-- 002: zpevnění politik pro projects + diagnostická funkce. Spustit v SQL Editoru.

-- created_by nastavuje databáze sama, klient ho nemůže poslat špatně
create or replace function public.set_created_by() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists projects_set_creator on public.projects;
create trigger projects_set_creator before insert on public.projects
  for each row execute function public.set_created_by();

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (auth.uid() is not null);

-- update: vedoucí; explicitní with check, aby upsert (insert ... on conflict do update) nepadal
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (public.is_lead(id)) with check (public.is_lead(id));

-- pojistka: kdo projekt založil, je vždy vedoucí (i kdyby trigger selhal)
create or replace function public.is_lead(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.member_role(pid) = 'lead'
      or exists (select 1 from public.projects where id = pid and created_by = auth.uid())
$$;
create or replace function public.is_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = pid and user_id = auth.uid())
      or exists (select 1 from public.projects where id = pid and created_by = auth.uid())
$$;

-- diagnostika: co databáze vidí jako přihlášeného uživatele
create or replace function public.whoami() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'uid', auth.uid(),
    'role', auth.role(),
    'projects', (select count(*) from public.projects),
    'memberships', (select json_agg(json_build_object('project', project_id, 'role', role)) from public.project_members where user_id = auth.uid())
  )
$$;
grant execute on function public.whoami() to authenticated;
