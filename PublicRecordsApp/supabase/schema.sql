create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  organization_name text,
  role text,
  subscription_tier text not null default 'free',
  account_status text not null default 'active',
  document_limit integer not null default 25,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  subscription_current_period_end timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists organization_name text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists subscription_tier text not null default 'free';
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists document_limit integer not null default 25;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists stripe_price_id text;
alter table public.profiles add column if not exists subscription_current_period_end timestamptz;

alter table public.profiles
  drop constraint if exists profiles_subscription_tier_check;

alter table public.profiles
  add constraint profiles_subscription_tier_check
  check (subscription_tier in ('free', 'starter', 'organization'));

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'trialing', 'past_due', 'canceled'));

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
