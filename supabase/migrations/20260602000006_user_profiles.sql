-- User profiles with roles
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text check (role in ('admin', 'standard')) default 'standard' not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table user_profiles enable row level security;

-- Admins can read all profiles; users can read their own
create policy "admins read all profiles"
  on user_profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1 from user_profiles where id = auth.uid() and role = 'admin'
    )
  );

-- Only admins can insert/update/delete profiles
create policy "admins manage profiles"
  on user_profiles for all
  using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'admin')
  );

-- Helper: check if current user is admin
create or replace function is_admin()
returns boolean language sql security definer as $$
  select exists (select 1 from user_profiles where id = auth.uid() and role = 'admin');
$$;

-- Auto-grant admin to masoud.assali@cresta.ai on first profile creation
create or replace function auto_create_profile()
returns trigger language plpgsql security definer as $$
declare
  v_role text;
begin
  select case
    when new.email = 'masoud.assali@cresta.ai' then 'admin'
    when not exists (select 1 from user_profiles) then 'admin'
    else 'standard'
  end into v_role;

  insert into user_profiles (id, full_name, role)
  values (new.id, split_part(new.email, '@', 1), v_role)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function auto_create_profile();

-- Backfill existing user (masoud)
insert into user_profiles (id, full_name, role)
select id, split_part(email, '@', 1), 'admin'
from auth.users
on conflict (id) do update set role = excluded.role;
