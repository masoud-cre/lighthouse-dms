# Lighthouse DMS

A secure document management and sharing system built for the Cresta team. Upload documents privately, generate password-protected shareable links, and track recipient access with built-in analytics.

## Live Site

**https://masoud-cre.github.io/lighthouse-dms/**

| Page | URL |
|---|---|
| Admin Login | `/admin/` |
| Dashboard | `/admin/dashboard/` |
| Upload Document | `/admin/upload/` |
| Recipient Access | `/docs/?slug={slug}` |

## Features

- **Secure storage** — documents stored privately in Supabase Storage, never publicly accessible
- **Password-protected access** — per-document passwords hashed with bcrypt; recipients never see raw file URLs
- **Signed URLs** — access links expire after 15 minutes; forwarding a URL doesn't grant access
- **Shareable links** — unique slug per document (e.g. `/docs/?slug=abc123`)
- **Analytics** — every view and download logged with timestamp, IP, and user agent
- **Rate limiting** — 5 password attempts per minute per document

## Stack

| Layer | Technology |
|---|---|
| Frontend | Static HTML/CSS/JS hosted on GitHub Pages |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage (private bucket) |
| Database | Supabase PostgreSQL |
| API | Supabase Edge Functions (Deno) |

## Project Structure

```
site/                         ← GitHub Pages root
├── admin/
│   ├── index.html            ← Team login
│   ├── dashboard/
│   │   └── index.html        ← Document list + analytics
│   └── upload/
│       └── index.html        ← Upload + generate link
└── docs/
    └── index.html            ← Recipient password gate + viewer

../supabase/                  ← Supabase project (not deployed to GitHub Pages)
├── migrations/               ← Database schema
└── functions/
    ├── upload-doc/           ← Handles file upload + metadata
    ├── verify-password/      ← Verifies recipient password, returns signed URL
    ├── log-access/           ← Logs view/download events
    └── get-analytics/        ← Returns access stats per document
```

## Adding Team Members

Use the Supabase Admin API to create uploader accounts:

```bash
curl -s -X POST "https://yuwvruokfrbizjiyobrx.supabase.co/auth/v1/admin/users" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teammate@cresta.ai",
    "password": "TemporaryPassword123!",
    "email_confirm": true
  }'
```

Keys are stored in `../.env` (not committed to git).

## Deploying Edge Function Updates

```bash
cd ../   # from site/ to Lighthouse DMS root
export SUPABASE_ACCESS_TOKEN=<token from .env>
npx supabase functions deploy <function-name> --no-verify-jwt
```

## Supabase Project

- **Project:** Lighthouse_DMS
- **Ref:** `yuwvruokfrbizjiyobrx`
- **Dashboard:** https://supabase.com/dashboard/project/yuwvruokfrbizjiyobrx
