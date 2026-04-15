create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  original_filename text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  year text,
  month text,
  status text not null default 'uploaded',
  processing_error text,
  extracted_text text,
  search_tsv tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(original_filename, '') || ' ' || coalesce(extracted_text, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_status_check check (status in ('uploaded', 'processing', 'ready', 'failed'))
);

create index if not exists documents_user_id_idx on public.documents (user_id);
create index if not exists documents_created_at_idx on public.documents (created_at desc);
create index if not exists documents_search_tsv_idx on public.documents using gin (search_tsv);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.documents enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
on public.documents
for select
using (auth.uid() = user_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
on public.documents
for insert
with check (auth.uid() = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
on public.documents
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
on public.documents
for delete
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "storage_select_own_documents" on storage.objects;
create policy "storage_select_own_documents"
on storage.objects
for select
using (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "storage_insert_own_documents" on storage.objects;
create policy "storage_insert_own_documents"
on storage.objects
for insert
with check (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "storage_update_own_documents" on storage.objects;
create policy "storage_update_own_documents"
on storage.objects
for update
using (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "storage_delete_own_documents" on storage.objects;
create policy "storage_delete_own_documents"
on storage.objects
for delete
using (
  bucket_id = 'documents'
  and auth.uid()::text = split_part(name, '/', 1)
);
