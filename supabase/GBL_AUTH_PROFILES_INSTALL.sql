-- ============================================================
-- GBL OS AUTHENTICATION + PROFILES INSTALL
-- ============================================================
-- Run this entire file in the Supabase SQL Editor.
--
-- This creates:
--   1. profiles table
--   2. role validation
--   3. automatic profile creation for new users
--   4. updated_at automation
--   5. row-level security policies
-- ============================================================


-- ------------------------------------------------------------
-- 1. CREATE PROFILES TABLE
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  email text,
  full_name text not null default '',
  phone text,

  role text not null default 'customer'
    check (
      role in (
        'admin',
        'technician',
        'customer'
      )
    ),

  active boolean not null default true,

  employee_id uuid,
  customer_id uuid,

  avatar_url text,

  last_login_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 2. CREATE INDEXES
-- ------------------------------------------------------------

create index if not exists profiles_email_idx
  on public.profiles (email);

create index if not exists profiles_role_idx
  on public.profiles (role);

create index if not exists profiles_active_idx
  on public.profiles (active);

create index if not exists profiles_employee_id_idx
  on public.profiles (employee_id);

create index if not exists profiles_customer_id_idx
  on public.profiles (customer_id);


-- ------------------------------------------------------------
-- 3. UPDATED_AT FUNCTION
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ------------------------------------------------------------
-- 4. UPDATED_AT TRIGGER
-- ------------------------------------------------------------

drop trigger if exists set_profiles_updated_at
on public.profiles;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 5. AUTOMATIC PROFILE CREATION
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
begin
  requested_role :=
    lower(
      coalesce(
        new.raw_user_meta_data ->> 'role',
        'customer'
      )
    );

  if requested_role not in (
    'admin',
    'technician',
    'customer'
  ) then
    requested_role := 'customer';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    active,
    avatar_url
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      ''
    ),
    coalesce(
      new.raw_user_meta_data ->> 'phone',
      new.phone
    ),
    requested_role,
    true,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = case
      when public.profiles.full_name = ''
        then excluded.full_name
      else public.profiles.full_name
    end,
    phone = coalesce(
      public.profiles.phone,
      excluded.phone
    ),
    avatar_url = coalesce(
      public.profiles.avatar_url,
      excluded.avatar_url
    ),
    updated_at = now();

  return new;
end;
$$;


-- ------------------------------------------------------------
-- 6. AUTH USER TRIGGER
-- ------------------------------------------------------------

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert or update of email, phone, raw_user_meta_data
on auth.users
for each row
execute function public.handle_new_user();


-- ------------------------------------------------------------
-- 7. CREATE PROFILES FOR EXISTING AUTH USERS
-- ------------------------------------------------------------

insert into public.profiles (
  id,
  email,
  full_name,
  phone,
  role,
  active,
  avatar_url
)
select
  users.id,
  users.email,
  coalesce(
    users.raw_user_meta_data ->> 'full_name',
    ''
  ),
  coalesce(
    users.raw_user_meta_data ->> 'phone',
    users.phone
  ),
  case
    when lower(
      coalesce(
        users.raw_user_meta_data ->> 'role',
        'customer'
      )
    ) in (
      'admin',
      'technician',
      'customer'
    )
    then lower(
      coalesce(
        users.raw_user_meta_data ->> 'role',
        'customer'
      )
    )
    else 'customer'
  end,
  true,
  users.raw_user_meta_data ->> 'avatar_url'
from auth.users as users
on conflict (id) do nothing;


-- ------------------------------------------------------------
-- 8. ROLE HELPER FUNCTIONS
-- ------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select profiles.role
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.active = true
      limit 1
    ),
    'customer'
  );
$$;


create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_role() = 'admin';
$$;


create or replace function public.current_user_is_technician()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_role() = 'technician';
$$;


create or replace function public.current_user_is_customer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_role() = 'customer';
$$;


-- ------------------------------------------------------------
-- 9. ENABLE ROW-LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.profiles
enable row level security;


-- ------------------------------------------------------------
-- 10. REMOVE OLD POLICIES
-- ------------------------------------------------------------

drop policy if exists
  "Users can view their own profile"
on public.profiles;

drop policy if exists
  "Users can update their own profile"
on public.profiles;

drop policy if exists
  "Admins can view all profiles"
on public.profiles;

drop policy if exists
  "Admins can insert profiles"
on public.profiles;

drop policy if exists
  "Admins can update all profiles"
on public.profiles;

drop policy if exists
  "Admins can delete profiles"
on public.profiles;


-- ------------------------------------------------------------
-- 11. PROFILE SELECT POLICIES
-- ------------------------------------------------------------

create policy
  "Users can view their own profile"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);


create policy
  "Admins can view all profiles"
on public.profiles
for select
to authenticated
using (
  public.current_user_is_admin()
);


-- ------------------------------------------------------------
-- 12. PROFILE INSERT POLICY
-- ------------------------------------------------------------

create policy
  "Admins can insert profiles"
on public.profiles
for insert
to authenticated
with check (
  public.current_user_is_admin()
);


-- ------------------------------------------------------------
-- 13. PROFILE UPDATE POLICIES
-- ------------------------------------------------------------

create policy
  "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
  and role = (
    select existing_profile.role
    from public.profiles as existing_profile
    where existing_profile.id = auth.uid()
  )
  and active = (
    select existing_profile.active
    from public.profiles as existing_profile
    where existing_profile.id = auth.uid()
  )
  and employee_id is not distinct from (
    select existing_profile.employee_id
    from public.profiles as existing_profile
    where existing_profile.id = auth.uid()
  )
  and customer_id is not distinct from (
    select existing_profile.customer_id
    from public.profiles as existing_profile
    where existing_profile.id = auth.uid()
  )
);


create policy
  "Admins can update all profiles"
on public.profiles
for update
to authenticated
using (
  public.current_user_is_admin()
)
with check (
  public.current_user_is_admin()
);


-- ------------------------------------------------------------
-- 14. PROFILE DELETE POLICY
-- ------------------------------------------------------------

create policy
  "Admins can delete profiles"
on public.profiles
for delete
to authenticated
using (
  public.current_user_is_admin()
);


-- ------------------------------------------------------------
-- 15. TABLE PERMISSIONS
-- ------------------------------------------------------------

grant usage on schema public
to authenticated;

grant select, insert, update, delete
on public.profiles
to authenticated;


-- ------------------------------------------------------------
-- 16. FUNCTION PERMISSIONS
-- ------------------------------------------------------------

revoke all
on function public.current_user_role()
from public;

revoke all
on function public.current_user_is_admin()
from public;

revoke all
on function public.current_user_is_technician()
from public;

revoke all
on function public.current_user_is_customer()
from public;

grant execute
on function public.current_user_role()
to authenticated;

grant execute
on function public.current_user_is_admin()
to authenticated;

grant execute
on function public.current_user_is_technician()
to authenticated;

grant execute
on function public.current_user_is_customer()
to authenticated;


-- ============================================================
-- INSTALL COMPLETE
-- ============================================================