-- 028: rozhodovací bod a varianty navazujících úkolů
-- tasks.decision = {"a":"Ano","b":"Ne","pick":"a","resolved":null|"a"|"b","on":"2026-11-15"}
-- tasks.variants = {"dec":"<id rozhodovacího úkolu>","a":{"start":"..","end":".."},"b":{"start":"..","end":".."}}
alter table public.tasks add column if not exists decision jsonb;
alter table public.tasks add column if not exists variants jsonb;
