-- 013: výslovný přepínač „omezit na skupiny“ u člena / pozvánky (místo odvozování z existence záznamů v group_access)
alter table public.project_members add column if not exists scoped boolean not null default false;
alter table public.project_invites add column if not exists scoped boolean not null default false;
-- existující řešitelé/čtenáři s nastavenými skupinami zůstanou omezeni
update public.project_members m set scoped = true
  where role in ('editor','viewer') and exists (select 1 from public.group_access a where a.project_id = m.project_id and a.user_id = m.user_id);

create or replace function public.has_group_scope(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select scoped from public.project_members where project_id = pid and user_id = auth.uid()), false)
$$;

-- převod pozvánky: přenést i příznak scoped
create or replace function public.claim_invites_for(uid uuid, mail text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  insert into public.project_members (project_id, user_id, role, scoped)
  select i.project_id, uid, i.role, i.scoped from public.project_invites i where lower(i.email) = lower(mail)
  on conflict do nothing;
  get diagnostics n = row_count;
  insert into public.group_access (project_id, group_id, user_id, can_edit)
  select i.project_id, (a->>'group_id')::uuid, uid, coalesce((a->>'can_edit')::boolean, true)
  from public.project_invites i, jsonb_array_elements(coalesce(i.access, '[]'::jsonb)) a
  where lower(i.email) = lower(mail) and (a->>'group_id') is not null
  on conflict (group_id, user_id) do update set can_edit = excluded.can_edit;
  delete from public.project_invites where lower(email) = lower(mail);
  return n;
end $$;
