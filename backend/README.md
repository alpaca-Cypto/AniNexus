# AniNexus backend

This directory owns the AniNexus database layer. The old `search_manga`
database is an optional catalog source, not a hidden runtime requirement.
AniNexus can start with an empty `aninexus` database and add other providers
(such as Bangumi or Douban) later.

The AI assistant uses seven read-only tools for collection summaries, filtered
library access, subject search and details, similar subjects, taste profiles,
and personalized recommendations. Model calls use an OpenAI-compatible chat
completions endpoint while collection access remains server-side and scoped to
the current user.

## Run the API

After configuring `backend/.env`:

```powershell
.\.venv\Scripts\aninexus-api.exe
```

The API runs at `http://localhost:8000`; interactive OpenAPI documentation is
available at `http://localhost:8000/docs`.

Implemented API groups:

- `GET /api/v1/health`
- `GET /api/v1/subjects` and `GET /api/v1/subjects/{id}`
- `GET/PUT/DELETE /api/v1/collections`
- `GET /api/v1/schedules`, `POST /api/v1/schedules/bulk-upsert`, and delete-all
- `GET/PUT/DELETE /api/v1/reminders`
- `GET /api/v1/dashboard/stats`
- `GET /api/v1/assistant/tools` and `POST /api/v1/assistant/tools/{tool_name}`
- `POST /api/v1/chat` and `GET /api/v1/chat/history`

The public catalog defaults to `CATALOG_SOURCE_MODE=mixed`, which keeps the
existing MAL catalog available while Bangumi data is imported. Set
`CATALOG_SOURCE_MODE=bangumi` only after the Bangumi catalog has been populated;
the frontend continues to use the same `/api/v1/subjects` interface in either mode.

Authentication is deliberately not finalized yet. During local development,
requests use user `1` unless `X-AniNexus-User-Id` is supplied. Do not expose
this development mode directly to the public internet.

## Docker

The repository Compose file pins MySQL and runs the API:

```powershell
docker compose up -d mysql backend
```

After placing a published catalog archive in `backend/data`, import it with:

```powershell
docker compose --profile import run --rm catalog-import
```

## Bangumi Archive conversion

Convert the official Bangumi Archive `subject.jsonlines` into AniNexus's
validated public bundle before importing it. Omitting `--output` performs a
read-only dry-run; anime is the default and NSFW records are excluded.

```powershell
.\.venv\Scripts\python.exe -m aninexus_backend.importers.bangumi_archive `
  "E:\path\to\bangumi-dump" --kind anime --limit 1000

.\.venv\Scripts\python.exe -m aninexus_backend.importers.bangumi_archive `
  "E:\path\to\bangumi-dump" --kind anime `
  --output backend\data\aninexus-bangumi-anime.jsonl.gz
```

The generated bundle can be validated and imported with the existing
`aninexus-import-public-data` command. Keep `CATALOG_SOURCE_MODE=mixed` until
cross-source matching has been completed and the Bangumi catalog is populated.
Catalog imports also register each provider ID in `subject_external_ids`; this
mapping is idempotent and records the source timestamp and content hash for
later canonical matching and audit.

Before importing Bangumi data, generate a read-only match plan against the
current local catalog:

```powershell
.\.venv\Scripts\python.exe -m aninexus_backend.importers.match_bangumi_catalog `
  "E:\path\to\bangumi-dump" --kind anime `
  --output backend\data\bangumi-match-plan.jsonl
```

Each decision is one of `mapped`, `auto_link`, `review`, or `new_subject`.
`auto_link` requires one unique normalized-title match with the same content
type and exact release date. The planner never modifies the database. Review
the plan before applying it; importing a Bangumi bundle directly before
canonical linking can create MAL/Bangumi duplicates.

The apply command is read-only unless `--apply` is supplied. It writes only the
reviewed `auto_link` identities and does not modify canonical subject fields:

```powershell
.\.venv\Scripts\python.exe -m aninexus_backend.importers.apply_bangumi_matches `
  "E:\path\to\bangumi-dump" backend\data\bangumi-match-plan.jsonl

.\.venv\Scripts\python.exe -m aninexus_backend.importers.apply_bangumi_matches `
  "E:\path\to\bangumi-dump" backend\data\bangumi-match-plan.jsonl --apply
```

Provider identities are unique by `(provider, external_id, subject_type)` so
providers with separate anime and manga ID namespaces cannot collide.

## Database roles

- `anime_explorer`: existing search_manga database; importer uses it read-only.
- `aninexus`: application-owned database; the importer creates/updates `subjects`.

Do not point both URLs at the same database. Keeping them separate prevents a
new AniNexus migration from breaking search_manga.

## Install

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".\backend[dev]"
Copy-Item .\backend\.env.example .\backend\.env
```

Edit `backend/.env` with local credentials. Passwords containing URL-reserved
characters must be percent-encoded. The `.env` file is ignored by Git.

For least privilege, use a MySQL account with `SELECT` on
`anime_explorer.*` and a separate account with normal DDL/DML access to
`aninexus.*`. The example uses two URLs so those permissions can be separated.

## Public one-command import

The recommended distribution format is a gzip-compressed JSON Lines bundle.
It contains only normalized anime, manga, and public translation fields. It
cannot contain users, favorites, chat history, credentials, or password hashes.

After configuring `DATABASE_URL`, a user imports the published bundle with one
command:

```powershell
.\.venv\Scripts\aninexus-import-public-data.exe
```

The default file is
`backend/data/aninexus-public-catalog.jsonl.gz`. A different downloaded file can
be selected and verified before import:

```powershell
.\.venv\Scripts\aninexus-import-public-data.exe `
  --source .\downloads\aninexus-public-catalog.jsonl.gz `
  --sha256 <checksum-published-with-the-release>
```

This command creates the configured database when necessary, creates the
SQLAlchemy tables, verifies the bundle format/checksum, and performs an
idempotent batch upsert. Therefore a correctly configured MySQL database plus
the public bundle is sufficient; the user does not need search_manga.

## Publish the public data bundle

Only the dataset maintainer needs `LEGACY_DATABASE_URL`. Generate the public
bundle from `anime`, `manga`, and `detail_translations` with:

```powershell
.\.venv\Scripts\aninexus-export-public-data.exe
```

The command prints a SHA-256 checksum to publish alongside the archive. Review
the upstream dataset/image redistribution terms before attaching the generated
archive to a GitHub Release or tracking it with Git LFS.

## Direct local search_manga import

First verify that the legacy schema is recognized without writing anything:

```powershell
.\.venv\Scripts\aninexus-import-search-manga.exe --dry-run --limit 20
```

Run the complete, idempotent import:

```powershell
.\.venv\Scripts\aninexus-import-search-manga.exe
```

Useful options:

```text
--kind anime|manga|all   Import one or both legacy tables
--batch-size 1000       Commit size; defaults to IMPORT_BATCH_SIZE
--limit 100             Limit each selected table for development
--dry-run               Read and transform only; do not write target data
--skip-create-database  Require the aninexus database to exist already
```

Rows are imported with keyset pagination and MySQL upsert semantics. The unique
identity is `(source, source_id, subject_type)`, so rerunning the command updates
existing records instead of duplicating them. Legacy rows are mapped as:

- `anime` -> AniNexus type `2`
- `manga` -> AniNexus type `1`
- `mal_id` -> source `myanimelist` plus string `source_id`
- `detail_translations` -> optional Chinese title and summary enrichment
- pipe-separated genres and provider metadata -> JSON arrays

The importer intentionally does not copy `users`, `favorites`,
`chat_histories`, or `search_translation_cache`. Those tables contain old
application behavior or user state and require an explicit migration policy.

## No legacy database available

Normal users do not need the legacy database. They configure `DATABASE_URL` and
run `aninexus-import-public-data` against the released bundle. If they skip the
bundle, the project can still initialize an empty database and add data from
future providers later.

## Tests

## Bangumi calendar

For local development, put a personal Bangumi Access Token in
`apikey/bangumi.txt` as a single line. The directory is ignored by Git. The
backend also accepts `BANGUMI_ACCESS_TOKEN`, which is the recommended option for
containers and servers.

The public weekly schedule is available at `/api/v1/bangumi/calendar`. Check
whether the optional personal token is valid at `/api/v1/bangumi/status`.
An invalid token does not prevent the public calendar from loading.

Send `POST /api/v1/collections/sync/bgm` with
`{"subject_type": 2}` to import every anime collection from the connected
Bangumi account. The endpoint follows all upstream result pages and safely
upserts subjects and the local user's collection state.

Set `BANGUMI_USER_AGENT` to a deployment-specific identifier before a public
deployment.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest .\backend\tests
.\.venv\Scripts\ruff.exe check .\backend
```
