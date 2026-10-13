-- 024: druh ToDo (telefonát / e-mail) a jméno kontaktu pro zkratky Zavolat / Napsat
alter table public.todos add column if not exists kind text not null default '';     -- '' | 'call' | 'mail'
alter table public.todos add column if not exists contact text not null default '';  -- jméno osoby jako v Kontaktech
