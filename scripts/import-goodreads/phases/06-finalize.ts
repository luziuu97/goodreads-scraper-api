import * as crypto from 'crypto';
import { getPool, markPhaseStarted, getPhaseStatus, copyFromArray } from '../lib/staging-db';
import { makeAuthorSlug, makeUniqueSlug, makeSeriesSlug } from '../lib/slug';
import { ProgressLogger } from '../lib/progress';
import { ImportReport } from '../lib/report';
import { ImportConfig } from '../types';
import { 
  normalizeIsbn, 
  normalizeLanguageCode, 
  normalizeBookFormat, 
  isPlaceholderCover,
  normalizePublicationDate, 
  normalizedTitleKey,
  normalizeTitle,
  normalizeContributorRole,
  safeInt 
} from '../lib/normalize';

export async function phase06Finalize(
  config: ImportConfig,
  report: ImportReport,
  logger: ProgressLogger
): Promise<void> {
  const phaseKey = '06-finalize';
  const status = await getPhaseStatus(phaseKey);
  
  if (config.resume && status === 'done') {
    logger.info('Phase 06 finalize already done, skipping.');
    return;
  }
  
  await markPhaseStarted(phaseKey);
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 6.1: Authors
    logger.info('Sub-phase 6.1: Authors');
    const existingSlugsRes = await client.query(`SELECT slug FROM "Author"`);
    const usedSlugs = new Set(existingSlugsRes.rows.map(r => r.slug));

    const newAuthorsRes = await client.query(`
      SELECT author_id, MAX(name) as name
      FROM _import_author_data 
      WHERE NOT EXISTS (
        SELECT 1 FROM "AuthorExternalId" 
        WHERE "externalId" = author_id::text AND provider = 'goodreads-dataset'
      )
      GROUP BY author_id
    `);

    if (newAuthorsRes.rows.length > 0) {
      const authorRows: any[][] = [];
      const authorExtRows: any[][] = [];
      for (const row of newAuthorsRes.rows) {
        const id = crypto.randomUUID();
        const slug = makeAuthorSlug(row.name || 'Unknown Author', String(row.author_id), usedSlugs);
        authorRows.push([id, row.name || 'Unknown Author', slug]);
        authorExtRows.push([crypto.randomUUID(), 'goodreads-dataset', String(row.author_id), id]);
      }
      const authorsInserted = await copyFromArray(client, 'Author', ['id', 'name', 'slug'], authorRows);
      const authorIdsInserted = await copyFromArray(client, 'AuthorExternalId', ['id', 'provider', 'externalId', 'authorId'], authorExtRows);
      if (authorsInserted !== authorRows.length || authorIdsInserted !== authorExtRows.length) {
        throw new Error(`Author insert conflict: expected ${authorRows.length}, inserted ${authorsInserted} authors and ${authorIdsInserted} external IDs`);
      }
      logger.info(`Inserted ${authorRows.length} authors`);
    }

    // 6.2: Series
    logger.info('Sub-phase 6.2: Series');
    const existingSeriesSlugsRes = await client.query(`SELECT slug FROM "Series"`);
    const usedSeriesSlugs = new Set(existingSeriesSlugsRes.rows.map(r => r.slug));

    const newSeriesRes = await client.query(`
      SELECT series_id, MAX(title) as title, MAX(primary_work_count) as primary_work_count
      FROM _import_series_data
      WHERE NOT EXISTS (
        SELECT 1 FROM "SeriesExternalId"
        WHERE "externalId" = series_id::text AND provider = 'goodreads-dataset'
      )
      GROUP BY series_id
    `);

    if (newSeriesRes.rows.length > 0) {
      const seriesRows: any[][] = [];
      const seriesExtRows: any[][] = [];
      for (const row of newSeriesRes.rows) {
        const id = crypto.randomUUID();
        const slug = makeSeriesSlug(row.title || 'Unknown Series', String(row.series_id), usedSeriesSlugs);
        seriesRows.push([id, slug, row.title || 'Unknown Series', safeInt(row.primary_work_count) || 0]);
        seriesExtRows.push([crypto.randomUUID(), 'goodreads-dataset', String(row.series_id), id]);
      }
      const seriesInserted = await copyFromArray(client, 'Series', ['id', 'slug', 'canonicalName', 'booksCount'], seriesRows);
      const seriesIdsInserted = await copyFromArray(client, 'SeriesExternalId', ['id', 'provider', 'externalId', 'seriesId'], seriesExtRows);
      if (seriesInserted !== seriesRows.length || seriesIdsInserted !== seriesExtRows.length) {
        throw new Error(`Series insert conflict: expected ${seriesRows.length}, inserted ${seriesInserted} series and ${seriesIdsInserted} external IDs`);
      }
      logger.info(`Inserted ${seriesRows.length} series`);
    }

    // 6.3: Works
    logger.info('Sub-phase 6.3: Works');
    const existingWorkSlugsRes = await client.query(`SELECT slug FROM "Work"`);
    const usedWorkSlugs = new Set(existingWorkSlugsRes.rows.map(r => r.slug));

    const newWorksRes = await client.query(`
      SELECT work_id, original_title, original_language_id, original_publication_year,
             ratings_sum, ratings_count, text_reviews_count, reviews_count, popularity_score
      FROM _import_works
      WHERE NOT EXISTS (
        SELECT 1 FROM "WorkExternalId"
        WHERE "externalId" = work_id::text AND provider = 'goodreads-dataset'
      )
    `);

    if (newWorksRes.rows.length > 0) {
      const workRows: any[][] = [];
      const workExtRows: any[][] = [];
      for (const row of newWorksRes.rows) {
        const id = crypto.randomUUID();
        const title = row.original_title || 'Unknown Title';
        const slug = makeUniqueSlug(title, String(row.work_id), usedWorkSlugs);
        
        const rc = safeInt(row.ratings_count) || 0;
        const rs = safeInt(row.ratings_sum) || 0;
        const avgRating = rc > 0 ? rs / rc : 0;
        const lang = normalizeLanguageCode(row.original_language_id) || null;
        const pubYear = safeInt(row.original_publication_year) || null;
        
        const now = new Date();
        workRows.push([
          id, slug, title, lang, pubYear, avgRating, rc, 
          safeInt(row.reviews_count) || 0, 
          safeInt(row.text_reviews_count) || 0, 
          row.popularity_score || 0,
          now, now
        ]);
        workExtRows.push([crypto.randomUUID(), 'goodreads-dataset', String(row.work_id), id]);
      }
      const worksInserted = await copyFromArray(client, 'Work', [
        'id', 'slug', 'canonicalTitle', 'originalLanguage', 'publicationYear',
        'averageRating', 'ratingsCount', 'reviewsCount', 'textReviewsCount', 'popularityScore',
        'createdAt', 'updatedAt'
      ], workRows);
      const workIdsInserted = await copyFromArray(client, 'WorkExternalId', ['id', 'provider', 'externalId', 'workId'], workExtRows);
      if (worksInserted !== workRows.length || workIdsInserted !== workExtRows.length) {
        throw new Error(`Work insert conflict: expected ${workRows.length}, inserted ${worksInserted} works and ${workIdsInserted} external IDs`);
      }
      logger.info(`Inserted ${workRows.length} works`);
    }

    // 6.4: WorkTitles (canonical)
    logger.info('Sub-phase 6.4: WorkTitles (canonical)');
    await client.query(`
      INSERT INTO "WorkTitle" (id, "workId", language, title, "normalizedTitle", "isPrimary", source)
      SELECT
        gen_random_uuid(),
        we."workId",
        NULL,
        iw.original_title,
        lower(regexp_replace(iw.original_title, '\\s+', ' ', 'g')),
        true,
        'goodreads-dataset'
      FROM _import_works iw
      JOIN "WorkExternalId" we ON we."externalId" = iw.work_id::text AND we.provider = 'goodreads-dataset'
      WHERE iw.original_title != ''
      ON CONFLICT ("workId", language, "normalizedTitle") DO NOTHING;
    `);

    // 6.5: Editions
    logger.info('Sub-phase 6.5: Editions');
    const newEditionsRes = await client.query(`
      SELECT 
        ie.book_id, ie.work_id, ie.title, ie.isbn, ie.isbn13, ie.asin,
        ie.format, ie.language_code, ie.publisher, ie.num_pages,
        ie.publication_year, ie.publication_month, ie.publication_day,
        ie.description, ie.is_default, ie.ratings_count, ie.text_reviews_count,
        we."workId" as "dbWorkId"
      FROM _import_editions ie
      JOIN "WorkExternalId" we ON we."externalId" = ie.work_id::text AND we.provider = 'goodreads-dataset'
      WHERE NOT EXISTS (
        SELECT 1 FROM "EditionExternalId"
        WHERE "externalId" = ie.book_id::text AND provider = 'goodreads-dataset'
      )
    `);

    if (newEditionsRes.rows.length > 0) {
      const editionRows: any[][] = [];
      const editionExtRows: any[][] = [];
      for (const row of newEditionsRes.rows) {
        const id = crypto.randomUUID();
        const format = normalizeBookFormat(row.format) || null;
        const lang = normalizeLanguageCode(row.language_code) || null;
        const isbn10 = normalizeIsbn(row.isbn, 10) || null;
        const isbn13 = normalizeIsbn(row.isbn13, 13) || null;
        const asin = row.asin || null;
        const pubDate = normalizePublicationDate(row.publication_year, row.publication_month, row.publication_day);
        const pages = safeInt(row.num_pages) || null;
        
        const now = new Date();
        editionRows.push([
          id, row.dbWorkId, row.title || 'Unknown Title',
          format, lang, isbn10, isbn13, asin, row.publisher || null,
          pubDate, pages, row.is_default || false,
          safeInt(row.ratings_count) || 0, safeInt(row.text_reviews_count) || 0,
          now, now
        ]);
        editionExtRows.push([crypto.randomUUID(), 'goodreads-dataset', String(row.book_id), id]);
      }
      const editionsInserted = await copyFromArray(client, 'Edition', [
        'id', 'workId', 'title', 'format', 'language', 'isbn10', 'isbn13', 'asin',
        'publisher', 'publicationDate', 'pages', 'isDefault', 'ratingsCount',
        'textReviewsCount', 'createdAt', 'updatedAt'
      ], editionRows);
      const editionIdsInserted = await copyFromArray(client, 'EditionExternalId', ['id', 'provider', 'externalId', 'editionId'], editionExtRows);
      if (editionsInserted !== editionRows.length || editionIdsInserted !== editionExtRows.length) {
        throw new Error(`Edition insert conflict: expected ${editionRows.length}, inserted ${editionsInserted} editions and ${editionIdsInserted} external IDs`);
      }
      logger.info(`Inserted ${editionRows.length} editions`);
    }

    // Keep mutable statistics in sync on idempotent re-runs as well.
    await client.query(`
      UPDATE "Edition" e
      SET
        "ratingsCount" = ie.ratings_count,
        "textReviewsCount" = ie.text_reviews_count,
        "updatedAt" = NOW()
      FROM _import_editions ie
      JOIN "EditionExternalId" ee
        ON ee."externalId" = ie.book_id::text AND ee.provider = 'goodreads-dataset'
      WHERE e.id = ee."editionId"
        AND (
          e."ratingsCount" IS DISTINCT FROM ie.ratings_count
          OR e."textReviewsCount" IS DISTINCT FROM ie.text_reviews_count
        );
    `);

    // 6.6: Edition Covers
    logger.info('Sub-phase 6.6: Edition Covers');
    const editionCoversRes = await client.query(`
      INSERT INTO "EditionCover" (id, "editionId", provider, url, width, height, "pixelCount", "imageFormat", "isDefault", "createdAt")
      SELECT
        gen_random_uuid(),
        ee."editionId",
        'goodreads-dataset',
        ie.image_url,
        NULL,
        NULL,
        NULL,
        'jpeg',
        true,
        NOW()
      FROM _import_editions ie
      JOIN "EditionExternalId" ee ON ee."externalId" = ie.book_id::text AND ee.provider = 'goodreads-dataset'
      WHERE ie.image_url IS NOT NULL
        AND ie.image_url != ''
        AND ie.image_url NOT LIKE '%nophoto%'
        AND ie.image_url NOT LIKE '%nocover%'
        AND ie.image_url NOT LIKE '%/assets/%'
        AND ie.image_url NOT LIKE '%placeholder%'
      ON CONFLICT ("editionId", url) DO NOTHING;
    `);
    report.counts.coverUrlsImported = (report.counts.coverUrlsImported || 0) + (editionCoversRes.rowCount ?? 0);

    // 6.7: WorkContributors
    logger.info('Sub-phase 6.7: WorkContributors (AUTHOR)');
    await client.query(`
      WITH candidates AS (
        SELECT DISTINCT ON (we."workId", ae."authorId")
          we."workId",
          ae."authorId",
          iea.position,
          ie.is_default
        FROM _import_edition_authors iea
        JOIN _import_editions ie ON ie.book_id = iea.book_id
        JOIN "WorkExternalId" we ON we."externalId" = ie.work_id::text AND we.provider = 'goodreads-dataset'
        JOIN "AuthorExternalId" ae ON ae."externalId" = iea.author_id::text AND ae.provider = 'goodreads-dataset'
        WHERE iea.role = '' OR iea.role IS NULL OR iea.role = 'Author'
        ORDER BY we."workId", ae."authorId", ie.is_default DESC, iea.position
      ), ranked AS (
        SELECT
          candidates.*,
          ROW_NUMBER() OVER (
            PARTITION BY "workId"
            ORDER BY is_default DESC, position, "authorId"
          ) AS author_rank
        FROM candidates
      )
      INSERT INTO "WorkContributor" ("workId", "authorId", role, position, "isPrimary")
      SELECT
        "workId",
        "authorId",
        'AUTHOR',
        position,
        author_rank = 1
      FROM ranked
      ON CONFLICT ("workId", "authorId", role) DO UPDATE SET
        position = EXCLUDED.position,
        "isPrimary" = EXCLUDED."isPrimary";
    `);

    // 6.8: EditionContributors
    logger.info('Sub-phase 6.8: EditionContributors (non-AUTHOR)');
    await client.query(`
      INSERT INTO "EditionContributor" ("editionId", "authorId", role, position)
      SELECT
        ee."editionId",
        ae."authorId",
        CASE 
          WHEN iea.role = 'Translator' THEN 'TRANSLATOR'
          WHEN iea.role = 'Narrator' THEN 'NARRATOR'
          WHEN iea.role = 'Editor' THEN 'EDITOR'
          WHEN iea.role = 'Adaptation' THEN 'ADAPTATION'
          ELSE 'CONTRIBUTOR'
        END,
        iea.position
      FROM _import_edition_authors iea
      JOIN "EditionExternalId" ee ON ee."externalId" = iea.book_id::text AND ee.provider = 'goodreads-dataset'
      JOIN "AuthorExternalId" ae ON ae."externalId" = iea.author_id::text AND ae.provider = 'goodreads-dataset'
      WHERE iea.role NOT IN ('', 'Author') AND iea.role IS NOT NULL
      ON CONFLICT ("editionId", "authorId", role) DO NOTHING;
    `);

    // 6.9: WorkSeries
    logger.info('Sub-phase 6.9: WorkSeries');
    await client.query(`
      INSERT INTO "WorkSeries" ("workId", "seriesId", position, "isPrimary")
      SELECT
        we."workId",
        se."seriesId",
        NULL,
        TRUE
      FROM _import_work_series iws
      JOIN "WorkExternalId" we ON we."externalId" = iws.work_id::text AND we.provider = 'goodreads-dataset'
      JOIN "SeriesExternalId" se ON se."externalId" = iws.series_id::text AND se.provider = 'goodreads-dataset'
      ON CONFLICT ("workId", "seriesId") DO NOTHING;
    `);

    // 6.10: WorkTranslations
    logger.info('Sub-phase 6.10: WorkTranslations');
    await client.query(`
      INSERT INTO "WorkTranslation" (id, "workId", language, title, description)
      SELECT DISTINCT ON (we."workId", ie.language_code)
        gen_random_uuid(),
        we."workId",
        ie.language_code,
        ie.title,
        CASE WHEN ie.description != '' AND ie.description IS NOT NULL THEN ie.description ELSE NULL END
      FROM _import_editions ie
      JOIN "WorkExternalId" we ON we."externalId" = ie.work_id::text AND we.provider = 'goodreads-dataset'
      WHERE ie.language_code IS NOT NULL AND ie.language_code != '' AND ie.language_code != 'und'
        AND ie.title != ''
      ORDER BY we."workId", ie.language_code, ie.ratings_count DESC
      ON CONFLICT ("workId", language) DO NOTHING;
    `);

    // 6.11: WorkTitle aliases
    logger.info('Sub-phase 6.11: WorkTitle aliases');
    await client.query(`
      INSERT INTO "WorkTitle" (id, "workId", language, title, "normalizedTitle", "isPrimary", source)
      SELECT DISTINCT ON (we."workId", ie.language_code, lower(trim(ie.title)))
        gen_random_uuid(),
        we."workId",
        NULLIF(ie.language_code, 'und'),
        ie.title,
        lower(trim(regexp_replace(ie.title, '\\s+', ' ', 'g'))),
        FALSE,
        'goodreads-dataset'
      FROM _import_editions ie
      JOIN "WorkExternalId" we ON we."externalId" = ie.work_id::text AND we.provider = 'goodreads-dataset'
      WHERE ie.title != ''
      ORDER BY we."workId", ie.language_code, lower(trim(ie.title)), ie.ratings_count DESC
      ON CONFLICT ("workId", language, "normalizedTitle") DO NOTHING;
    `);

    // 6.12: Genres
    logger.info('Sub-phase 6.12: Genres');
    await client.query(`
      INSERT INTO "Genre" (id, name)
      SELECT gen_random_uuid(), genre_name
      FROM (SELECT DISTINCT genre_name FROM _import_work_genres) g
      ON CONFLICT (name) DO NOTHING;
    `);
    
    await client.query(`
      INSERT INTO "GenreOnWork" ("workId", "genreId", source, score)
      SELECT
        we."workId",
        g.id,
        'goodreads-dataset',
        iwg.score
      FROM _import_work_genres iwg
      JOIN "WorkExternalId" we ON we."externalId" = iwg.work_id::text AND we.provider = 'goodreads-dataset'
      JOIN "Genre" g ON g.name = iwg.genre_name
      ON CONFLICT ("workId", "genreId", source) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO _import_state (phase_key, status, completed_at)
      VALUES ($1, 'done', NOW())
      ON CONFLICT (phase_key) DO UPDATE SET
        status = 'done',
        completed_at = NOW()
    `, [phaseKey]);
    await client.query('COMMIT');
    logger.info('Phase 06 finalize completed.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
