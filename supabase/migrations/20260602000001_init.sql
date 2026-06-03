-- Enable pgcrypto for password hashing
create extension if not exists pgcrypto;

-- Documents table
create table documents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  file_path text not null,
  file_size bigint,
  file_type text,
  recipient_password_hash text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Access logs table
create table access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  action text check (action in ('view', 'download')),
  ip_address text,
  user_agent text,
  accessed_at timestamptz default now()
);

-- Indexes
create index on documents(slug);
create index on access_logs(document_id);
create index on access_logs(accessed_at);

-- Row Level Security
alter table documents enable row level security;
alter table access_logs enable row level security;

-- Uploaders can only read/write their own documents
create policy "uploaders manage own docs"
  on documents for all
  using (auth.uid() = uploaded_by);

-- Anyone can insert an access log (done by edge function with service role)
-- Access logs are read-only for the uploader of the related document
create policy "uploaders read own doc logs"
  on access_logs for select
  using (
    document_id in (
      select id from documents where uploaded_by = auth.uid()
    )
  );
