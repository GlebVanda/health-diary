-- Дневник здоровья: схема облачной базы.
-- Выполнить один раз: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Повторный запуск безопасен.

-- 1. Таблица записей. Каждая строка локальной базы приложения — одна запись (jsonb).
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null,
  id         text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, tbl, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

-- 2. Время изменения ставит сервер, а не устройство: часы телефонов могут расходиться.
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

-- 3. Доступ: каждый видит и меняет только свои записи.
alter table public.records enable row level security;

drop policy if exists "records: own rows" on public.records;
create policy "records: own rows" on public.records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Анонимным пользователям (без входа) таблица недоступна.
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- 4. Хранилище фото тела: закрытый бакет, у каждого пользователя своя папка (его id).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos: own folder" on storage.objects;
create policy "photos: own folder" on storage.objects
  for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
