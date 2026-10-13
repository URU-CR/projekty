-- 007: registrace nesmí padnout kvůli převodu pozvánek; převod lze zopakovat funkcí claim_invites()

create or replace function public.claim_invites_for(uid uuid, mail text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  insert into public.project_members (project_id, user_id, role)
  select i.project_id, uid, i.role from public.project_invites i where lower(i.email) = lower(mail)
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

-- volá aplikace po přihlášení (pojistka, kdyby trigger neproběhl)
create or replace function public.claim_invites() returns int
language plpgsql security definer set search_path = public as $$
declare mail text;
begin
  select email into mail from auth.users where id = auth.uid();
  if mail is null then return 0; end if;
  insert into public.profiles (id, email, name) values (auth.uid(), mail, split_part(mail,'@',1)) on conflict (id) do nothing;
  return public.claim_invites_for(auth.uid(), mail);
end $$;
grant execute on function public.claim_invites() to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.profiles (id, email, name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
    on conflict (id) do update set email = excluded.email, name = coalesce(excluded.name, public.profiles.name);
  exception when others then raise warning 'profiles: %', sqlerrm; end;
  begin
    perform public.claim_invites_for(new.id, new.email);
  exception when others then raise warning 'invites: %', sqlerrm; end;
  return new;
end $$;
