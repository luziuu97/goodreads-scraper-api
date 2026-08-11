# Goodreads Importer Documentation

## 1. Overview
The Goodreads Importer is a robust, fault-tolerant script designed to ingest the Goodreads academic dataset into a PostgreSQL database managed by Prisma. It parses massive newline-delimited JSON (JSONL) files to selectively import the most popular books, along with their top editions, authors, series, genres, and cover metadata. By scoring works and editions by popularity and language, it constructs a dense, realistic, multilingual local development catalog.

## 2. Dataset Prerequisites and Restrictions

This importer relies on the **2017 Goodreads Academic Dataset**. 
- **License**: The dataset is strictly licensed for **academic and non-commercial use only**.
- **Data Freshness**: The data is approximately 7 years old (as of 2024). It should be enriched with current, permitted metadata providers (e.g., Open Library, Google Books) if modern completeness is required.
- **Redistribution Restrictions**: The resulting database or SQL dumps must **not** be published or redistributed in any form. It is for local development and academic environments only.

### Required Files and Expected Sizes
You need the following files downloaded and placed in your source directory. They are expected to be in JSONL (newline-delimited JSON) format:

| File Name | Expected Size |
|-----------|---------------|
| `goodreads_book_works.json` | ~697 MB |
| `goodreads_books.json` | ~8.57 GB |
| `goodreads_book_authors.json` | ~101 MB |
| `goodreads_book_series.json` | ~106 MB |
| `goodreads_book_genres_initial.json` | ~191 MB |

## 3. Prerequisites
To run the importer, your environment must have:
- **Node.js**: v18 or newer
- **PostgreSQL**: v14 or newer
- **pg_dump**: Available in your system `PATH`
- **Environment Variables**: A valid `DATABASE_URL` pointing to your PostgreSQL instance.

## 4. Installation and Setup
1. Install project dependencies:
   ```bash
   npm install
   ```
2. Configure your environment by setting the `DATABASE_URL` in your `.env` file at the project root:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/goodreads_db?schema=public"
   ```

## 5. Import Command and Options

The importer is triggered via the npm script `import:goodreads`.

**Command:**
```bash
npm run import:goodreads -- [options]
```

**Options:**
- `--source <path>`: (Required) Path to the directory containing the JSON dataset files.
- `--works <number>`: Number of works to import (e.g., 50000).
- `--editions-per-work <number>`: Maximum number of editions to import per work (e.g., 12).
- `--output <path>`: Path where the final `pg_dump` file should be saved (e.g., `/path/to/dump.dump`).
- `--resume`: Resume an interrupted import using existing staging tables.
- `--dry-run`: Run every staging and validation phase without writing to canonical tables or creating a dump.
- `--drop-staging`: Drop all staging tables before starting (useful to force a fresh run).

**Examples:**
*Dry run for 100 works to test configuration:*
```bash
npm run import:goodreads -- --source /data/goodreads --works 100 --dry-run
```

*Full import of top 50,000 works with up to 12 editions each:*
```bash
npm run import:goodreads -- --source /data/goodreads --works 50000 --editions-per-work 12 --output ./goodreads_dev.dump
```

*Resume an interrupted import:*
```bash
npm run import:goodreads -- --source /data/goodreads --works 50000 --editions-per-work 12 --resume
```

## 6. Execution Phases

After staging setup, the import process runs eight resumable phases:
1. **Work selection** - Scans `goodreads_book_works.json`, ranks works, and stages the top N.
2. **Edition selection** - Scans `goodreads_books.json`, maintains bounded candidate pools, and stages up to M diverse editions per work.
3. **Authors** - Extracts metadata for referenced authors.
4. **Series** - Extracts metadata for referenced series.
5. **Genres** - Aggregates the strongest genre associations for selected works.
6. **Finalize** - Normalizes and transactionally writes canonical tables and relationships.
7. **Integrity checks** - Reconciles staging and canonical data and fails on critical discrepancies.
8. **Dump** - Optionally creates a `pg_dump` archive, excluding `_import_*` staging tables.

## 7. Popularity Formula and Work Selection

Works are selected based on a derived popularity score to ensure the local database contains highly recognizable books.

**Popularity Formula:**
```text
avgRating = ratingsSum / max(1, ratingsCount)
popularityScore = log10(ratingsCount + 1) × avgRating × log10(textReviewsCount + 1)
```

**Selection Ordering:**
When selecting the top works, the following order is applied to break ties and ensure consistent results:
1. `ratings_count` DESC
2. `text_reviews_count` DESC
3. `reviews_count` DESC
4. `books_count` DESC
5. `work_id` ASC (Deterministic tie-breaker)

## 8. Edition Ranking Formula

When multiple editions exist for a single work, they are ranked and scored to select the best candidates. The formula considers completeness and quality:
- Base score derived from edition `ratings_count` and `average_rating`.
- **Bonuses:**
  - Has an ISBN/ISBN13: + Points
  - Has a valid cover image URL (excluding default/placeholder images): + Points
  - Has a described page count: + Points
  - Has a known language code: + Points

## 9. Language Diversity Algorithm

To prevent the resulting database from becoming an English monoculture, the importer employs a language diversity algorithm when selecting editions. 
After editions are scored and grouped by their `language_code`, the importer selects editions in a **round-robin fashion** across the available languages for that work. This ensures that if a work has popular editions in Spanish, French, and Japanese, they will be included alongside the primary English editions.

## 10. Schema Mappings

The following table summarizes how key fields from the Goodreads dataset map to the Prisma schema:

| Goodreads Field | Prisma Field | Notes |
|-----------------|--------------|-------|
| `work_id` | `WorkExternalId.externalId` | Stored with provider `goodreads-dataset` |
| `book_id` | `EditionExternalId.externalId` | Stored with provider `goodreads-dataset` |
| `original_title` | `Work.canonicalTitle` | Falls back to `Unknown Title` if empty |
| `original_publication_year` | `Work.publicationYear` | Extracted and parsed as Integer |
| `isbn13` / `isbn` | `Edition.isbn13` / `Edition.isbn10` | Validated and cleaned |
| `image_url` | `EditionCover.url` | Ignored if it matches Goodreads placeholders |
| `num_pages` | `Edition.pages` | Parsed as Integer |
| `language_code` | `Edition.language` | Normalized to standard locales |
| `description` | `WorkTranslation.description` | Stored for a selected localized edition |
| `author_id` | `AuthorExternalId.externalId` | Linked through contributor tables |

## 11. Expected Storage Requirements

Based on typical runs, here are the expected disk and storage requirements:
- **~50,000 works**: ~50 MB raw data
- **~500,000 editions** (10 per work): ~2 GB raw data
- **Total DB Size (with Indexes)**: ~3 to 5 GB
- **Compressed PostgreSQL Dump (`.dump`)**: ~500 MB to 1 GB

## 12. Resume and Retry Behavior

The importer is built to be resilient. If the script crashes (e.g., OOM error, manual cancellation), you can restart it using the `--resume` flag.
- The importer detects which staging tables are already populated.
- **Phase Skipping**: With `--resume`, phases whose state is `done` remain completed and are skipped.
- Without `--resume`, staging rows and phase state are cleared automatically before a fresh run. `--drop-staging` additionally recreates the staging schema.
- `--dry-run` still writes to staging so every selection and integrity phase can execute, but it does not modify canonical tables or create a dump.

## 13. Creating and Restoring the Dump

The importer can automatically generate a `.dump` file for easy distribution among your team.

**Creating the Dump:**
```bash
npm run import:goodreads -- --source /path/to/data --works 50000 --editions-per-work 12 --output /path/to/dump.dump
```

**Restoring the Dump:**
The importer will print the exact restore command upon completion. Generally, you restore it using:
```bash
pg_restore -Fc --no-owner -d your_local_db_name /path/to/dump.dump
```

## 14. Idempotency

Finalization is transactional: either all canonical entities, external IDs, and relationships are committed, or the phase is rolled back. Existing Goodreads entities are reused through their external IDs, mutable edition statistics are refreshed, and explicit conflict handling prevents duplicate relationships. Integrity-check failures make the command fail instead of producing a silently invalid dump.

## 15. Duplicate Work Candidates

During Phase 3, the importer attempts to identify works that might be duplicates (e.g., highly similar titles with identical primary authors). It outputs a `duplicate-candidates.json` file in the project root.
- **Contents**: Arrays of work IDs that share identical normalized titles and authors.
- **Usage**: You can use this file post-import to run merging logic, set up aliases, or manually curate the database to remove redundant work entries.

## 16. Search Example (WorkTitle Aliases)

Because editions often have localized titles, the importer associates these titles with the parent Work as aliases.
For example, searching for **"juego de tronos"** (the Spanish edition title) in your application will correctly resolve to the parent Work **"A Game of Thrones"**, because the importer stored "Juego de tronos" in the Work's search aliases/metadata during Phase 4 and 6.

## 17. Data Freshness Warning

**WARNING**: The dataset was captured in late **2017**.
- Ratings and review counts are frozen at that point in time.
- Books published after 2017 are not present.
- It is highly recommended to run a secondary background job in your application to enrich this baseline catalog by fetching live metadata from current providers (e.g., Open Library, Google Books API) when a user views a specific book.

## 18. Legal Notice

**IMPORTANT:** This dataset and the tools provided are for **local development and academic research ONLY**. Do not publish, monetize, or redistribute the derived database dumps or host them on a public-facing production server without verifying compliance with Goodreads/Amazon's terms of service.
