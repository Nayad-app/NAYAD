-- iPhone camera/gallery selections may arrive as HEIC/HEIF.
alter table public.loan_documents
  drop constraint if exists loan_documents_mime_type_check;

alter table public.loan_documents
  add constraint loan_documents_mime_type_check
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'));

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf'
]::text[]
where id = 'loan-contracts';
