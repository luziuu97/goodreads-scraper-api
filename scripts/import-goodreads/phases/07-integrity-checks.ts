import { getPool } from '../lib/staging-db';
import { ProgressLogger } from '../lib/progress';
import { ImportReport } from '../lib/report';
import { ImportConfig } from '../types';

export interface IntegrityCheckResult {
  name: string;
  passed: boolean;
  detail: string;
  count?: number;
}

export async function phase07IntegrityChecks(
  config: ImportConfig,
  report: ImportReport,
  logger: ProgressLogger
): Promise<IntegrityCheckResult[]> {
  logger.info('Starting Phase 07: Integrity Checks');
  const pool = getPool();
  const results: IntegrityCheckResult[] = [];
  let criticalFailures = 0;

  const runCheck = async (
    name: string,
    query: string,
    evaluate: (val: number) => { passed: boolean; detail: string; critical?: boolean }
  ) => {
    try {
      const res = await pool.query(query);
      const key = Object.keys(res.rows[0] || {})[0];
      const rawVal = res.rows[0] ? res.rows[0][key] : 0;
      const val = rawVal === null || rawVal === undefined || isNaN(parseInt(rawVal, 10)) ? 0 : parseInt(rawVal, 10);
      
      const { passed, detail, critical } = evaluate(val);
      results.push({ name, passed, detail, count: val });
      
      if (passed) {
        logger.info(`Check passed: ${name} - ${detail}`);
      } else {
        if (critical === false) {
          logger.warn(`Check warning: ${name} - ${detail}`);
        } else {
          criticalFailures++;
          logger.error(`Check failed: ${name} - ${detail}`);
        }
      }
    } catch (err) {
      criticalFailures++;
      logger.error(`Error running check ${name}: ${err instanceof Error ? err.message : String(err)}`);
      results.push({ name, passed: false, detail: `Query error: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const isDry = config.dryRun;

  // 1. works_count
  await runCheck(
    'works_count',
    isDry
      ? `SELECT COUNT(*) FROM _import_works`
      : `SELECT COUNT(*)
         FROM _import_works iw
         JOIN "WorkExternalId" we
           ON we."externalId" = iw.work_id::text AND we.provider = 'goodreads-dataset'`,
    (val) => ({
      passed: val <= config.worksLimit,
      detail: `Found ${val} works (limit ${config.worksLimit})`
    })
  );

  // 2. editions_per_work
  await runCheck(
    'editions_per_work',
    isDry
      ? `SELECT COALESCE(MAX(cnt), 0) FROM (SELECT COUNT(*) cnt FROM _import_editions GROUP BY work_id) sub`
      : `SELECT COALESCE(MAX(cnt), 0) FROM (
           SELECT COUNT(*) cnt
           FROM _import_editions ie
           JOIN "EditionExternalId" ee
             ON ee."externalId" = ie.book_id::text AND ee.provider = 'goodreads-dataset'
           GROUP BY ie.work_id
         ) sub`,
    (val) => ({
      passed: val <= config.editionsPerWork,
      detail: `Max editions per work is ${val} (limit ${config.editionsPerWork})`
    })
  );

  // 3. work_external_ids
  await runCheck(
    'work_external_ids',
    isDry
      ? `SELECT COUNT(*) FROM (SELECT work_id FROM _import_works GROUP BY work_id HAVING COUNT(work_id) != 1) sub`
      : `SELECT COUNT(*) FROM (
           SELECT iw.work_id FROM _import_works iw
           LEFT JOIN "WorkExternalId" we
             ON we."externalId" = iw.work_id::text AND we.provider = 'goodreads-dataset'
           GROUP BY iw.work_id HAVING COUNT(we.id) != 1
         ) sub`,
    (val) => ({
      passed: val === 0,
      detail: `${val} works have missing or multiple goodreads-dataset external IDs`
    })
  );

  // 4. edition_external_ids
  await runCheck(
    'edition_external_ids',
    isDry
      ? `SELECT COUNT(*) FROM (SELECT book_id FROM _import_editions GROUP BY book_id HAVING COUNT(book_id) != 1) sub`
      : `SELECT COUNT(*) FROM (
           SELECT ie.book_id FROM _import_editions ie
           LEFT JOIN "EditionExternalId" ee
             ON ee."externalId" = ie.book_id::text AND ee.provider = 'goodreads-dataset'
           GROUP BY ie.book_id HAVING COUNT(ee.id) != 1
         ) sub`,
    (val) => ({
      passed: val === 0,
      detail: `${val} editions have missing or multiple goodreads-dataset external IDs`
    })
  );

  // 5. default_edition
  await runCheck(
    'default_edition',
    isDry
      ? `SELECT COUNT(*) FROM (SELECT work_id FROM _import_editions WHERE is_default=true GROUP BY work_id HAVING COUNT(*)>1) sub`
      : `SELECT COUNT(*) FROM (SELECT "workId" FROM "Edition" e JOIN "EditionExternalId" ee ON ee."editionId" = e.id AND ee.provider = 'goodreads-dataset' WHERE e."isDefault"=true GROUP BY "workId" HAVING COUNT(*)>1) sub`,
    (val) => ({
      passed: val === 0,
      detail: `${val} works have multiple default editions`
    })
  );

  // 6. no_empty_isbns
  await runCheck(
    'no_empty_isbns',
    isDry
      ? `SELECT COUNT(*) FROM _import_editions WHERE isbn = '' OR isbn13 = ''`
      : `SELECT COUNT(*) FROM "Edition" e JOIN "EditionExternalId" ee ON ee."editionId" = e.id AND ee.provider = 'goodreads-dataset' WHERE e.isbn10='' OR e.isbn13=''`,
    (val) => ({
      passed: val === 0,
      detail: `${val} editions have empty string ISBNs`
    })
  );

  // 7. no_placeholder_covers
  await runCheck(
    'no_placeholder_covers',
    isDry
      ? `SELECT COUNT(*) FROM _import_editions WHERE image_url LIKE '%nophoto%' OR image_url LIKE '%nocover%' OR image_url LIKE '%/assets/%'`
      : `SELECT COUNT(*) FROM "EditionCover" WHERE provider = 'goodreads-dataset' AND (url LIKE '%nophoto%' OR url LIKE '%nocover%' OR url LIKE '%/assets/%')`,
    (val) => ({
      passed: val === 0,
      detail: `${val} edition covers are placeholders`
    })
  );

  // 8. contributors_valid
  await runCheck(
    'contributors_valid',
    isDry
      ? `SELECT COUNT(*) FROM _import_edition_authors iea LEFT JOIN _import_needed_authors ina ON ina.author_id = iea.author_id WHERE ina.author_id IS NULL`
      : `SELECT COUNT(*) FROM "WorkContributor" wc JOIN "WorkExternalId" we ON we."workId" = wc."workId" AND we.provider = 'goodreads-dataset' LEFT JOIN "Author" a ON a.id=wc."authorId" WHERE a.id IS NULL`,
    (val) => ({
      passed: val === 0,
      detail: `${val} work contributors have invalid author IDs`
    })
  );

  // 9. series_valid
  await runCheck(
    'series_valid',
    isDry
      ? `SELECT COUNT(*) FROM _import_work_series iws LEFT JOIN _import_needed_series ins ON ins.series_id = iws.series_id WHERE ins.series_id IS NULL`
      : `SELECT COUNT(*) FROM "WorkSeries" ws JOIN "WorkExternalId" we ON we."workId" = ws."workId" AND we.provider = 'goodreads-dataset' LEFT JOIN "Series" s ON s.id=ws."seriesId" WHERE s.id IS NULL`,
    (val) => ({
      passed: val === 0,
      detail: `${val} work series links have invalid series IDs`
    })
  );

  // 10. works_without_editions
  await runCheck(
    'works_without_editions',
    isDry
      ? `SELECT COUNT(*) FROM _import_works w LEFT JOIN _import_editions e ON e.work_id = w.work_id WHERE e.book_id IS NULL`
      : `SELECT COUNT(*) FROM "Work" w JOIN "WorkExternalId" we ON we."workId" = w.id AND we.provider = 'goodreads-dataset' LEFT JOIN "Edition" e ON e."workId" = w.id WHERE e.id IS NULL`,
    (val) => ({
      passed: true,
      critical: false,
      detail: `${val} works have no editions`
    })
  );

  // 11. imported edition statistics survived finalization
  await runCheck(
    'edition_statistics_match_staging',
    isDry
      ? `SELECT 0`
      : `SELECT COUNT(*)
         FROM _import_editions ie
         JOIN "EditionExternalId" ee
           ON ee."externalId" = ie.book_id::text AND ee.provider = 'goodreads-dataset'
         JOIN "Edition" e ON e.id = ee."editionId"
         WHERE COALESCE(e."ratingsCount", 0) != COALESCE(ie.ratings_count, 0)
            OR COALESCE(e."textReviewsCount", 0) != COALESCE(ie.text_reviews_count, 0)`,
    (val) => ({
      passed: val === 0,
      detail: `${val} editions have statistics that differ from staging`
    })
  );

  // 12. every imported work with contributors has one primary author
  await runCheck(
    'primary_contributors',
    isDry
      ? `SELECT COUNT(*) FROM (
           SELECT ie.work_id
           FROM _import_editions ie
           JOIN _import_edition_authors iea ON iea.book_id = ie.book_id
           WHERE iea.role = '' OR iea.role IS NULL OR iea.role = 'Author'
           GROUP BY ie.work_id
           HAVING COUNT(*) FILTER (WHERE iea.position = 0) = 0
         ) sub`
      : `SELECT COUNT(*) FROM (
           SELECT wc."workId"
           FROM "WorkContributor" wc
           JOIN "WorkExternalId" we ON we."workId" = wc."workId" AND we.provider = 'goodreads-dataset'
           JOIN _import_works iw ON iw.work_id::text = we."externalId"
           WHERE wc.role = 'AUTHOR'
           GROUP BY wc."workId"
           HAVING COUNT(*) FILTER (WHERE wc."isPrimary") != 1
         ) sub`,
    (val) => ({
      passed: val === 0,
      detail: `${val} works with authors do not have exactly one primary author`
    })
  );

  report.integrity = report.integrity || {};
  for (const r of results) {
    report.integrity[r.name] = { passed: r.passed, detail: r.detail };
  }

  if (criticalFailures > 0) {
    throw new Error(`Integrity checks failed: ${criticalFailures} critical check(s)`);
  }

  logger.info('Phase 07 integrity checks completed.');
  return results;
}
