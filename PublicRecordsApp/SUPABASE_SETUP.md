# Supabase Setup

This repo now includes a first-pass authenticated app at [app/index.html](/Users/quentinnichols/Documents/Websites/PublicRecordsApp/app/index.html) plus Supabase schema and ingestion scaffolding.

## What this MVP does

- Users sign up and log in with Supabase Auth.
- Each user uploads into their own private storage path: `auth.uid()/filename`.
- A `documents` row stores metadata and extracted text.
- The app searches the saved text, not the original file, which matches the pattern you described from the CAT minutes system.

Short version:

> Upload file -> save metadata -> extract text once -> store extracted text -> search stored text later.

## Files added

- [app/index.html](/Users/quentinnichols/Documents/Websites/PublicRecordsApp/app/index.html): browser app UI
- [app/app.js](/Users/quentinnichols/Documents/Websites/PublicRecordsApp/app/app.js): auth, upload, search, and extraction calls
- [app/config.example.js](/Users/quentinnichols/Documents/Websites/PublicRecordsApp/app/config.example.js): client config template
- [supabase/schema.sql](/Users/quentinnichols/Documents/Websites/PublicRecordsApp/supabase/schema.sql): tables, RLS, storage policies, and bucket creation
- [supabase/functions/ingest-document/index.ts](/Users/quentinnichols/Documents/Websites/PublicRecordsApp/supabase/functions/ingest-document/index.ts): text extraction function

## Create the Supabase project

Use a free project if you want to avoid paid compute while testing, or create it in your Pro organization if you want it under that org.

Recommended project name:

- `records-database`

## Configure the project

1. In Supabase, create the project.
2. Run the SQL in [supabase/schema.sql](/Users/quentinnichols/Documents/Websites/PublicRecordsApp/supabase/schema.sql) in the SQL editor.
3. Deploy the edge function from [supabase/functions/ingest-document/index.ts](/Users/quentinnichols/Documents/Websites/PublicRecordsApp/supabase/functions/ingest-document/index.ts).
4. Copy [app/config.example.js](/Users/quentinnichols/Documents/Websites/PublicRecordsApp/app/config.example.js) to `app/config.js` and paste in:
   - Project URL
   - Anon key

## Recommended CLI commands

If you install the Supabase CLI locally, the usual commands are:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy ingest-document
```

You can also paste the SQL manually in the dashboard if that is easier.

## Supported extraction in this MVP

Currently supported:

- `.docx`
- `.txt`
- `.md`
- `.csv`
- `.json`
- `.html`
- `.htm`

Not implemented yet:

- `.pdf` text extraction
- scanned image OCR
- legacy `.doc` extraction inside Supabase

Important note:

Your existing CAT minutes pipeline used macOS `textutil` for `.doc`. That will not work inside a Supabase Edge Function. For now, convert `.doc` files to `.docx` before upload.

## How the extraction function works

The function follows the same general model as your existing CAT minutes process:

1. Look up the uploaded document row.
2. Download the file from private Supabase Storage.
3. If it is `.docx`, open the file as a zip archive.
4. Read `word/document.xml`.
5. Pull out the text runs.
6. Normalize whitespace.
7. Save the cleaned text back into `documents.extracted_text`.
8. Mark the row as `ready`.

That keeps extraction separate from search and later AI steps.

## How search works right now

Search is keyword-based over `documents.extracted_text` and title data already stored in Postgres.

That means:

- uploads are parsed once
- search reads saved text
- later AI can use the same saved text instead of reparsing files

## Next steps I recommend

1. Add an organization model so documents belong to a board/org instead of only one person.
2. Add PDF extraction and OCR.
3. Add chunking for long documents.
4. Add AI summaries and question answering from extracted chunks.
5. Add invites and shared access for multi-user boards.
