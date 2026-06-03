-- Private documents bucket (not public)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800, -- 50MB limit per file
  array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4',
    'image/jpeg',
    'image/png'
  ]
);

-- Only authenticated uploaders can upload to the bucket
create policy "authenticated users can upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

-- Authenticated users can read/delete their own uploads
create policy "authenticated users manage own files"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
