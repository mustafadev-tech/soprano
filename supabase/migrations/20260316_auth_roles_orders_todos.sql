create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'soprano_garson',
  created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('soprano_garson', 'soprano_admin'));
  end if;
end
$$;

insert into public.profiles (id, email, full_name, role, created_at)
select
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name'),
  'soprano_garson',
  coalesce(users.created_at, timezone('utc', now()))
from auth.users as users
left join public.profiles on profiles.id = users.id
where profiles.id is null;

alter table public.orders
  add column if not exists closed_by uuid;

alter table public.orders
  add column if not exists closed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_closed_by_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_closed_by_fkey
      foreign key (closed_by) references public.profiles (id) on delete set null;
  end if;
end
$$;

alter table public.order_items
  add column if not exists added_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_added_by_fkey'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_added_by_fkey
      foreign key (added_by) references public.profiles (id) on delete set null;
  end if;
end
$$;

create unique index if not exists orders_one_open_per_table_idx
  on public.orders (table_id)
  where status = 'open';

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  is_completed boolean not null default false,
  completed_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint todos_completed_by_fkey
    foreign key (completed_by) references public.profiles (id) on delete set null,
  constraint todos_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete cascade
);

create or replace function public.current_soprano_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select profiles.role
      from public.profiles
      where profiles.id = auth.uid()
    ),
    'soprano_garson'
  );
$$;

create or replace function public.is_soprano_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_soprano_role() = 'soprano_admin';
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    'soprano_garson',
    coalesce(new.created_at, timezone('utc', now()))
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

create or replace function public.set_order_item_added_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.added_by is null then
    new.added_by := auth.uid();
  end if;

  if new.note is not null then
    new.note := nullif(btrim(new.note), '');
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_set_added_by on public.order_items;

create trigger order_items_set_added_by
before insert on public.order_items
for each row
execute function public.set_order_item_added_by();

create or replace function public.sync_order_totals_from_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders
  set
    total_amount = coalesce(
      (
        select round(coalesce(sum((order_items.quantity * order_items.unit_price)::numeric), 0), 2)
        from public.order_items
        where order_items.order_id = target_order_id
      ),
      0
    ),
    order_revision = coalesce(public.orders.order_revision, 0) + 1
  where public.orders.id = target_order_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists order_items_sync_order_totals on public.order_items;

create trigger order_items_sync_order_totals
after insert or update or delete on public.order_items
for each row
execute function public.sync_order_totals_from_items();

create or replace function public.guard_order_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if not public.is_soprano_admin() then
    if new.status is distinct from old.status
      or new.payment_method is distinct from old.payment_method
      or new.closed_by is distinct from old.closed_by
      or new.closed_at is distinct from old.closed_at then
      raise exception 'Only admins can close bills.';
    end if;
  elsif old.status = 'open' and new.status = 'closed' then
    new.closed_by := coalesce(new.closed_by, auth.uid());
    new.closed_at := coalesce(new.closed_at, timezone('utc', now()));
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_updates on public.orders;

create trigger orders_guard_updates
before update on public.orders
for each row
execute function public.guard_order_updates();

create or replace function public.handle_todo_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_at := coalesce(new.updated_at, timezone('utc', now()));

    if new.is_completed then
      new.completed_by := coalesce(new.completed_by, auth.uid());
    else
      new.completed_by := null;
    end if;

    return new;
  end if;

  if not public.is_soprano_admin() then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.created_by is distinct from old.created_by then
      raise exception 'Waiters can only toggle todo completion.';
    end if;
  end if;

  new.updated_at := timezone('utc', now());

  if new.is_completed is distinct from old.is_completed then
    if new.is_completed then
      new.completed_by := auth.uid();
    else
      new.completed_by := null;
    end if;
  elsif not public.is_soprano_admin() then
    new.completed_by := old.completed_by;
  end if;

  return new;
end;
$$;

drop trigger if exists todos_handle_write on public.todos;

create trigger todos_handle_write
before insert or update on public.todos
for each row
execute function public.handle_todo_write();

alter table public.profiles enable row level security;
alter table public.tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.todos enable row level security;
alter table public.z_report_snapshots enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_soprano_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
on public.profiles
for update
to authenticated
using (public.is_soprano_admin())
with check (public.is_soprano_admin());

drop policy if exists tables_select_authenticated on public.tables;
create policy tables_select_authenticated
on public.tables
for select
to authenticated
using (true);

drop policy if exists tables_write_authenticated on public.tables;
create policy tables_write_authenticated
on public.tables
for all
to authenticated
using (true)
with check (true);

drop policy if exists orders_select_authenticated on public.orders;
create policy orders_select_authenticated
on public.orders
for select
to authenticated
using (true);

drop policy if exists orders_insert_open_authenticated on public.orders;
create policy orders_insert_open_authenticated
on public.orders
for insert
to authenticated
with check (status = 'open');

drop policy if exists orders_update_authenticated on public.orders;
create policy orders_update_authenticated
on public.orders
for update
to authenticated
using (true)
with check (true);

drop policy if exists orders_delete_open_authenticated on public.orders;
create policy orders_delete_open_authenticated
on public.orders
for delete
to authenticated
using (status = 'open');

drop policy if exists order_items_select_authenticated on public.order_items;
create policy order_items_select_authenticated
on public.order_items
for select
to authenticated
using (true);

drop policy if exists order_items_insert_open_order on public.order_items;
create policy order_items_insert_open_order
on public.order_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.status = 'open'
  )
);

drop policy if exists order_items_update_open_order on public.order_items;
create policy order_items_update_open_order
on public.order_items
for update
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.status = 'open'
  )
)
with check (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.status = 'open'
  )
);

drop policy if exists order_items_delete_open_order on public.order_items;
create policy order_items_delete_open_order
on public.order_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.status = 'open'
  )
);

drop policy if exists categories_select_authenticated on public.categories;
create policy categories_select_authenticated
on public.categories
for select
to authenticated
using (true);

drop policy if exists categories_insert_admin on public.categories;
create policy categories_insert_admin
on public.categories
for insert
to authenticated
with check (public.is_soprano_admin());

drop policy if exists categories_update_admin on public.categories;
create policy categories_update_admin
on public.categories
for update
to authenticated
using (public.is_soprano_admin())
with check (public.is_soprano_admin());

drop policy if exists categories_delete_admin on public.categories;
create policy categories_delete_admin
on public.categories
for delete
to authenticated
using (public.is_soprano_admin());

drop policy if exists menu_items_select_authenticated on public.menu_items;
create policy menu_items_select_authenticated
on public.menu_items
for select
to authenticated
using (true);

drop policy if exists menu_items_insert_admin on public.menu_items;
create policy menu_items_insert_admin
on public.menu_items
for insert
to authenticated
with check (public.is_soprano_admin());

drop policy if exists menu_items_update_admin on public.menu_items;
create policy menu_items_update_admin
on public.menu_items
for update
to authenticated
using (public.is_soprano_admin())
with check (public.is_soprano_admin());

drop policy if exists menu_items_delete_admin on public.menu_items;
create policy menu_items_delete_admin
on public.menu_items
for delete
to authenticated
using (public.is_soprano_admin());

drop policy if exists todos_select_authenticated on public.todos;
create policy todos_select_authenticated
on public.todos
for select
to authenticated
using (true);

drop policy if exists todos_insert_admin on public.todos;
create policy todos_insert_admin
on public.todos
for insert
to authenticated
with check (public.is_soprano_admin());

drop policy if exists todos_update_authenticated on public.todos;
create policy todos_update_authenticated
on public.todos
for update
to authenticated
using (true)
with check (true);

drop policy if exists todos_delete_admin on public.todos;
create policy todos_delete_admin
on public.todos
for delete
to authenticated
using (public.is_soprano_admin());

drop policy if exists snapshots_select_admin on public.z_report_snapshots;
create policy snapshots_select_admin
on public.z_report_snapshots
for select
to authenticated
using (public.is_soprano_admin());

drop policy if exists snapshots_insert_authenticated on public.z_report_snapshots;
create policy snapshots_insert_authenticated
on public.z_report_snapshots
for insert
to authenticated
with check (true);

drop policy if exists snapshots_update_authenticated on public.z_report_snapshots;
create policy snapshots_update_authenticated
on public.z_report_snapshots
for update
to authenticated
using (true)
with check (true);

do $$
begin
  if exists (
    select 1
    from pg_views
    where schemaname = 'public'
      and viewname = 'order_item_details'
  ) then
    execute 'alter view public.order_item_details set (security_invoker = true)';
  end if;

  if exists (
    select 1
    from pg_views
    where schemaname = 'public'
      and viewname = 'daily_summary'
  ) then
    execute 'alter view public.daily_summary set (security_invoker = true)';
  end if;
end
$$;
