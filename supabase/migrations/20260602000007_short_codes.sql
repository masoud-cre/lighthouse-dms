-- Add short_code to documents for URL shortening
alter table documents add column if not exists short_code text unique;

-- Backfill existing documents with a short code
update documents
set short_code = substring(md5(random()::text), 1, 7)
where short_code is null;

-- Index for fast redirect lookups
create index if not exists idx_documents_short_code on documents(short_code);
