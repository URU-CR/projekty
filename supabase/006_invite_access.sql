-- 006: přístup ke skupinám lze nastavit už u pozvánky; při registraci se převede na group_access
alter table public.project_invites add column if not exists access jsonb not null default '[]';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do update set email = excluded.email;
  insert into public.project_members (project_id, user_id, role)
  select i.project_id, new.id, i.role from public.project_invites i where lower(i.email) = lower(new.email)
  on conflict do nothing;
  insert into public.group_access (project_id, group_id, user_id, can_edit)
  select i.project_id, (a->>'group_id')::uuid, new.id, coalesce((a->>'can_edit')::boolean, true)
  from public.project_invites i, jsonb_array_elements(i.access) a
  where lower(i.email) = lower(new.email)
  on conflict (group_id, user_id) do update set can_edit = excluded.can_edit;
  delete from public.project_invites where lower(email) = lower(new.email);
  return new;
end $$;
