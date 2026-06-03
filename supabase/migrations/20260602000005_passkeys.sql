-- Passkey credentials
create table passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  credential_id text unique not null,
  public_key text not null,
  counter bigint default 0 not null,
  transports text[],
  created_at timestamptz default now()
);

create index on passkey_credentials(user_id);
alter table passkey_credentials enable row level security;
create policy "users manage own passkeys"
  on passkey_credentials for all
  using (auth.uid() = user_id);

-- Ephemeral challenges (expire after 5 min)
create table passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  challenge text not null,
  created_at timestamptz default now()
);

create index on passkey_challenges(user_id);
-- Auto-cleanup: delete challenges older than 10 minutes
create or replace function cleanup_passkey_challenges()
returns void language sql security definer as $$
  delete from passkey_challenges where created_at < now() - interval '10 minutes';
$$;
