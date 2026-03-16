create extension if not exists pgcrypto with schema extensions;

create table if not exists public.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  full_name text null,
  role text not null check (role in ('soprano_garson', 'soprano_admin')),
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.staff_accounts enable row level security;

drop policy if exists "staff_accounts_no_direct_access" on public.staff_accounts;
create policy "staff_accounts_no_direct_access"
on public.staff_accounts
as restrictive
for all
to public
using (false)
with check (false);

create or replace function public.authenticate_staff_user(
  p_username text,
  p_password text
)
returns table (
  id uuid,
  username text,
  full_name text,
  role text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    staff_accounts.id,
    staff_accounts.username,
    staff_accounts.full_name,
    staff_accounts.role,
    staff_accounts.created_at
  from public.staff_accounts
  where lower(staff_accounts.username) = lower(trim(p_username))
    and staff_accounts.password_hash = extensions.crypt(trim(p_password), staff_accounts.password_hash)
  limit 1;
$$;

grant execute on function public.authenticate_staff_user(text, text) to anon, authenticated;

insert into public.staff_accounts (
  id,
  username,
  full_name,
  role,
  password_hash
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'sopranoAdmin',
    'Soprano Admin',
    'soprano_admin',
    extensions.crypt('sopranoAdmin', extensions.gen_salt('bf'))
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'sopranoGarson',
    'Soprano Garson',
    'soprano_garson',
    extensions.crypt('sopranoGarson', extensions.gen_salt('bf'))
  )
on conflict (username) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  password_hash = excluded.password_hash;
