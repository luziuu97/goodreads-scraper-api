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
- `--dry-run`: Run the work and edition selection phases without writing to the final tables.
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

The import process is divided into 8 distinct, memory-efficient phases:
1. **Phase 1: Setup & Validation** - Checks database connectivity, verifies that all necessary dataset files exist, and ensures `pg_dump` is available.
2. **Phase 2: Staging Tables Creation** - Creates temporary `_staging_*` tables to hold parsed JSON data securely before final insertion.
3. **Phase 3: Work Selection** - Scans `goodreads_book_works.json` to calculate popularity scores for all works, sorting and selecting the top N works requested.
4. **Phase 4: Edition Selection** - Scans the massive `goodreads_books.json` file. It evaluates every edition against the selected top works, ranking them and keeping only the best M editions per work.
5. **Phase 5: Metadata Extraction** - Scans authors, series, and genres JSON files, extracting only the metadata relevant to the selected works and editions.
6. **Phase 6: Data Transformation** - Maps and normalizes the raw staged data to the final Prisma schema format, handling type conversions and relation linkages.
7. **Phase 7: Database Insertion** - Inserts the transformed data into the main Prisma tables in bulk, utilizing idempotent `ON CONFLICT DO NOTHING` operations.
8. **Phase 8: Cleanup & Dump** - Optionally creates a standard `pg_dump` archive of the populated database and drops the temporary staging tables.

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
| `work_id` | `Work.goodreadsId` | Unique identifier for a Work |
| `book_id` | `Edition.goodreadsId` | Unique identifier for an Edition |
| `original_title` | `Work.title` | Fallback to `best_book_id` title if empty |
| `original_publication_year` | `Work.firstPublishYear` | Extracted and parsed as Integer |
| `isbn13` / `isbn` | `Edition.isbn13` / `Edition.isbn10` | Validated and cleaned |
| `image_url` | `Edition.coverUrl` | Ignored if it matches Goodreads placeholders |
| `num_pages` | `Edition.pageCount` | Parsed as Integer |
| `language_code` | `Edition.language` | Normalized to standard locales |
| `description` | `Edition.description` | HTML tags stripped or sanitized |
| `author_id` | `Author.goodreadsId` | Linked via `_WorkAuthors` and `_EditionAuthors` |

## 11. Expected Storage Requirements

Based on typical runs, here are the expected disk and storage requirements:
- **~50,000 works**: ~50 MB raw data
- **~500,000 editions** (10 per work): ~2 GB raw data
- **Total DB Size (with Indexes)**: ~3 to 5 GB
- **Compressed PostgreSQL Dump (`.dump`)**: ~500 MB to 1 GB

## 12. Resume and Retry Behavior

The importer is built to be resilient. If the script crashes (e.g., OOM error, manual cancellation), you can restart it using the `--resume` flag.
- The importer detects which staging tables are already populated.
- **Phase Skipping**: If Phase 3 (Work Selection) was completed, it will skip rescanning the works file and move directly to Phase 4.
- If you wish to start entirely from scratch, omit `--resume` and include the `--drop-staging` flag to clear the interrupted state.

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

Running the import directly against an existing database is completely safe. All database insertion operations (Phase 7) use PostgreSQL's `ON CONFLICT DO NOTHING` (or Prisma equivalent `upsert`/`createMany` with `skipDuplicates`). It will not create duplicate authors, works, or editions if they already exist.

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
