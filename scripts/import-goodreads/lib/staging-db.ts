import { Pool, PoolClient } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return _pool;
}

export async function createStagingTables(client?: Pool | PoolClient): Promise<void> {
  const query = `
-- Selected works from popularity ranking (Phase 1 output)
CREATE TABLE IF NOT EXISTS _import_works (
  work_id BIGINT PRIMARY KEY,
  best_book_id BIGINT,
  original_title TEXT NOT NULL DEFAULT '',
  original_language_id TEXT,
  original_publication_year INT,
  ratings_count BIGINT NOT NULL DEFAULT 0,
  ratings_sum BIGINT NOT NULL DEFAULT 0,
  text_reviews_count BIGINT NOT NULL DEFAULT 0,
  reviews_count BIGINT NOT NULL DEFAULT 0,
  books_count INT NOT NULL DEFAULT 0,
  media_type TEXT,
  popularity_score FLOAT NOT NULL DEFAULT 0,
  rank_position INT NOT NULL DEFAULT 0
);

-- Selected editions after filtering and ranking (Phase 2 output)
CREATE TABLE IF NOT EXISTS _import_editions (
  book_id BIGINT PRIMARY KEY,
  work_id BIGINT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  title_without_series TEXT,
  isbn TEXT,
  isbn13 TEXT,
  asin TEXT,
  kindle_asin TEXT,
  format TEXT,
  language_code TEXT,
  publisher TEXT,
  num_pages INT,
  publication_year INT,
  publication_month INT,
  publication_day INT,
  description TEXT,
  image_url TEXT,
  ratings_count BIGINT NOT NULL DEFAULT 0,
  text_reviews_count BIGINT NOT NULL DEFAULT 0,
  is_ebook BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  edition_rank INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS _import_editions_work_id_rank_idx
  ON _import_editions (work_id, is_default DESC, ratings_count DESC, book_id);

-- All author-edition relationships from selected editions
CREATE TABLE IF NOT EXISTS _import_edition_authors (
  book_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  position INT NOT NULL DEFAULT 0,
  PRIMARY KEY (book_id, author_id, role)
);
CREATE INDEX IF NOT EXISTS _import_edition_authors_author_id_idx
  ON _import_edition_authors (author_id);

-- Distinct author IDs needed (derived from _import_edition_authors)
CREATE TABLE IF NOT EXISTS _import_needed_authors (
  author_id BIGINT PRIMARY KEY
);

-- Author metadata (Phase 3 output)
CREATE TABLE IF NOT EXISTS _import_author_data (
  author_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT ''
);

-- Distinct series IDs needed (derived from edition series arrays)
CREATE TABLE IF NOT EXISTS _import_needed_series (
  series_id BIGINT PRIMARY KEY
);

-- Work-series memberships from editions
CREATE TABLE IF NOT EXISTS _import_work_series (
  work_id BIGINT NOT NULL,
  series_id BIGINT NOT NULL,
  PRIMARY KEY (work_id, series_id)
);

-- Series metadata (Phase 4 output)
CREATE TABLE IF NOT EXISTS _import_series_data (
  series_id BIGINT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  note TEXT,
  numbered BOOLEAN NOT NULL DEFAULT FALSE,
  series_works_count INT,
  primary_work_count INT
);

-- Aggregated genre data per work (Phase 5 output)
CREATE TABLE IF NOT EXISTS _import_work_genres (
  work_id BIGINT NOT NULL,
  genre_name TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  PRIMARY KEY (work_id, genre_name)
);

-- Phase state for resumability
CREATE TABLE IF NOT EXISTS _import_state (
  phase_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB
);
  `;
  const executor = client || getPool();
  await executor.query(query);
}

export async function dropStagingTables(client?: Pool | PoolClient): Promise<void> {
  const query = `
    DROP TABLE IF EXISTS _import_state;
    DROP TABLE IF EXISTS _import_work_genres;
    DROP TABLE IF EXISTS _import_series_data;
    DROP TABLE IF EXISTS _import_work_series;
    DROP TABLE IF EXISTS _import_needed_series;
    DROP TABLE IF EXISTS _import_author_data;
    DROP TABLE IF EXISTS _import_needed_authors;
    DROP TABLE IF EXISTS _import_edition_authors;
    DROP TABLE IF EXISTS _import_editions;
    DROP TABLE IF EXISTS _import_works;
  `;
  const executor = client || getPool();
  await executor.query(query);
}

export async function resetStagingTables(client?: Pool | PoolClient): Promise<void> {
  const executor = client || getPool();
  await executor.query(`
    TRUNCATE TABLE
      _import_work_genres,
      _import_series_data,
      _import_work_series,
      _import_needed_series,
      _import_author_data,
      _import_needed_authors,
      _import_edition_authors,
      _import_editions,
      _import_works,
      _import_state;
  `);
}

export async function getPhaseStatus(phaseKey: string): Promise<'pending' | 'running' | 'done' | 'skipped'> {
  const pool = getPool();
  const res = await pool.query('SELECT status FROM _import_state WHERE phase_key = $1', [phaseKey]);
  if (res.rows.length === 0) {
    return 'pending';
  }
  return res.rows[0].status as 'pending' | 'running' | 'done' | 'skipped';
}

export async function markPhaseStarted(phaseKey: string, metadata?: Record<string, unknown>): Promise<void> {
  const pool = getPool();
  const meta = metadata ? JSON.stringify(metadata) : null;
  await pool.query(`
    INSERT INTO _import_state (phase_key, status, started_at, metadata)
    VALUES ($1, 'running', NOW(), $2)
    ON CONFLICT (phase_key) DO UPDATE SET
      status = 'running',
      started_at = NOW(),
      metadata = COALESCE(EXCLUDED.metadata, _import_state.metadata)
  `, [phaseKey, meta]);
}

export async function markPhaseDone(phaseKey: string, metadata?: Record<string, unknown>): Promise<void> {
  const pool = getPool();
  const meta = metadata ? JSON.stringify(metadata) : null;
  await pool.query(`
    INSERT INTO _import_state (phase_key, status, completed_at, metadata)
    VALUES ($1, 'done', NOW(), $2)
    ON CONFLICT (phase_key) DO UPDATE SET
      status = 'done',
      completed_at = NOW(),
      metadata = COALESCE(EXCLUDED.metadata, _import_state.metadata)
  `, [phaseKey, meta]);
}

export async function markPhaseSkipped(phaseKey: string): Promise<void> {
  const pool = getPool();
  await pool.query(`
    INSERT INTO _import_state (phase_key, status)
    VALUES ($1, 'skipped')
    ON CONFLICT (phase_key) DO UPDATE SET
      status = 'skipped'
  `, [phaseKey]);
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

export async function copyFromArray<T>(
  client: Pool | PoolClient,
  tableName: string,
  columns: string[],
  rows: T[][],
  chunkSize: number = 5000
): Promise<number> {
  if (rows.length === 0) return 0;
  
  let inserted = 0;
  const cols = columns.map(c => `"${c}"`).join(', ');
  const numCols = Math.max(1, columns.length);
  const safeChunkSize = Math.max(1, Math.min(chunkSize, Math.floor(60000 / numCols)));

  for (let i = 0; i < rows.length; i += safeChunkSize) {
    const chunk = rows.slice(i, i + safeChunkSize);
    
    let queryParams: any[] = [];
    let valueStrings: string[] = [];
    
    let paramIndex = 1;
    for (const row of chunk) {
      const rowParams: string[] = [];
      for (const val of row) {
        rowParams.push(`$${paramIndex++}`);
        queryParams.push(val);
      }
      valueStrings.push(`(${rowParams.join(', ')})`);
    }

    const query = `
      INSERT INTO "${tableName}" (${cols})
      VALUES ${valueStrings.join(', ')}
      ON CONFLICT DO NOTHING;
    `;

    const res = await client.query(query, queryParams);
    inserted += res.rowCount || 0;
  }

  return inserted;
}
