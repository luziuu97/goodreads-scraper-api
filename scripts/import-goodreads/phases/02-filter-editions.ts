import path from 'node:path';
import { streamJsonl } from '../lib/stream';
import { getPool, getPhaseStatus, markPhaseStarted, markPhaseDone, markPhaseSkipped, copyFromArray } from '../lib/staging-db';
import { safeInt } from '../lib/normalize';
import { rankEditionsForWork } from '../lib/edition-ranker';
import type { RawEdition } from '../lib/edition-ranker';
import type { ProgressLogger } from '../lib/progress';
import { type ImportReport, trackMemory } from '../lib/report';
import type { ImportConfig } from '../types';

/**
 * Phase 2: Filter and rank editions for the selected works.
 */
export async function phase02FilterEditions(
  config: ImportConfig,
  report: ImportReport,
  logger: ProgressLogger
): Promise<void> {
  const phaseName = '02-filter-editions';
  const pool = getPool();
  const status = await getPhaseStatus(phaseName);
  
  if (config.resume && status === 'done') {
    logger.info(`Skipping ${phaseName} (already done)`);
    await markPhaseSkipped(phaseName);
    return;
  }
  
  await markPhaseStarted(phaseName);
  
  const worksRes = await pool.query('SELECT work_id, best_book_id FROM _import_works');
  const bestBookMap = new Map<string, string>();
  const selectedWorkIds = new Set<string>();
  
  for (const row of worksRes.rows) {
    bestBookMap.set(row.work_id.toString(), row.best_book_id.toString());
    selectedWorkIds.add(row.work_id.toString());
  }
  
  const editionsPath = path.join(config.sourceDir, 'goodreads_books.json');
  const workEditions = new Map<string, RawEdition[]>();
  
  let lineCount = 0;
  let editionsScanned = 0;
  
  await streamJsonl(editionsPath, async (record: any) => {
    lineCount++;
    if (lineCount % 100000 === 0) {
      logger.info(`Phase 02: Scanned ${lineCount} books`);
      trackMemory(report);
    }
    
    if (record.work_id && selectedWorkIds.has(record.work_id.toString())) {
      editionsScanned++;
      const arr = workEditions.get(record.work_id.toString()) || [];
      arr.push(record as RawEdition);
      workEditions.set(record.work_id.toString(), arr);
    }
  }, { batchSize: 10000 });
  
  report.counts = report.counts || {};
  report.counts.editionsScanned = editionsScanned;
  
  const selectedEditions: any[] = [];
  const editionAuthors: any[] = [];
  const workSeries: any[] = [];
  let rejectedCount = 0;
  
  for (const [workId, editions] of workEditions.entries()) {
    const bestBookId = bestBookMap.get(workId);
    const ranked = rankEditionsForWork(editions, bestBookId || '', config.editionsPerWork);
    
    for (let rankIndex = 0; rankIndex < ranked.length; rankIndex++) {
      const r = ranked[rankIndex];
      selectedEditions.push({
        ...r,
        edition_rank: rankIndex + 1,
        book_id: safeInt(r.book_id),
        work_id: safeInt(workId),
        num_pages: safeInt(r.num_pages),
        ratings_count: safeInt(r.ratings_count),
        text_reviews_count: safeInt(r.text_reviews_count),
        publication_year: safeInt(r.publication_year),
        publication_month: safeInt(r.publication_month),
        publication_day: safeInt(r.publication_day),
        is_ebook: r.is_ebook === 'true',
        is_default: r._isDefault
      });
      
      if (Array.isArray(r.authors)) {
        for (let i = 0; i < r.authors.length; i++) {
          const author = r.authors[i];
          editionAuthors.push({
            book_id: safeInt(r.book_id),
            author_id: safeInt(author.author_id),
            role: author.role || '',
            position: i + 1
          });
        }
      }
      
      if (Array.isArray(r.series)) {
        for (const seriesId of r.series) {
          workSeries.push({
            work_id: safeInt(workId),
            series_id: safeInt(seriesId)
          });
        }
      }
    }
    rejectedCount += editions.length - ranked.length;
  }
  
  if (!config.dryRun) {
    logger.info(`Inserting ${selectedEditions.length} editions`);
    await copyFromArray(pool, '_import_editions', [
      'book_id', 'work_id', 'title', 'title_without_series', 'isbn', 'isbn13',
      'asin', 'kindle_asin', 'format', 'language_code', 'publisher', 'num_pages',
      'publication_year', 'publication_month', 'publication_day', 'description',
      'image_url', 'ratings_count', 'text_reviews_count', 'is_ebook', 'is_default', 'edition_rank'
    ], selectedEditions.map(e => [
      e.book_id, e.work_id, e.title, e.title_without_series, e.isbn, e.isbn13,
      e.asin, e.kindle_asin, e.format, e.language_code, e.publisher, e.num_pages,
      e.publication_year, e.publication_month, e.publication_day, e.description,
      e.image_url, e.ratings_count, e.text_reviews_count, e.is_ebook, e.is_default, e.edition_rank
    ]));
    
    logger.info(`Inserting ${editionAuthors.length} edition authors`);
    await copyFromArray(pool, '_import_edition_authors', [
      'book_id', 'author_id', 'role', 'position'
    ], editionAuthors.map(a => [a.book_id, a.author_id, a.role, a.position]));
    
    await pool.query('INSERT INTO _import_needed_authors (author_id) SELECT DISTINCT author_id FROM _import_edition_authors ON CONFLICT DO NOTHING');
    
    // deduplicate workSeries
    const uniqueWorkSeries = Array.from(new Set(workSeries.map(s => `${s.work_id}|${s.series_id}`))).map(str => {
      const [w, s] = str.split('|');
      return [Number(w), Number(s)];
    });
    
    logger.info(`Inserting ${uniqueWorkSeries.length} work series`);
    await copyFromArray(pool, '_import_work_series', ['work_id', 'series_id'], uniqueWorkSeries);
    
    await pool.query('INSERT INTO _import_needed_series (series_id) SELECT DISTINCT series_id FROM _import_work_series ON CONFLICT DO NOTHING');
  }
  
  report.counts.editionsImported = selectedEditions.length;
  report.counts.editionsRejected = rejectedCount;
  
  await markPhaseDone(phaseName);
  logger.info(`Finished phase: ${phaseName}`);
}
