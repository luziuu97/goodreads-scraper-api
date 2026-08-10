import fs from 'node:fs';
import path from 'node:path';
import { streamJsonl } from '../lib/stream';
import { BoundedTopHeap } from '../lib/heap';
import { safeInt } from '../lib/normalize';
import { getPool, getPhaseStatus, markPhaseStarted, markPhaseDone, markPhaseSkipped, copyFromArray } from '../lib/staging-db';
import { DuplicateDetector } from '../lib/duplicate-detector';
import type { ProgressLogger } from '../lib/progress';
import { type ImportReport, trackMemory } from '../lib/report';
import type { ImportConfig } from '../types';

/**
 * Phase 1: Select top works by popularity.
 */
export async function phase01SelectWorks(
  config: ImportConfig,
  report: ImportReport,
  logger: ProgressLogger
): Promise<void> {
  const phaseName = '01-select-works';
  const pool = getPool();
  const status = await getPhaseStatus(phaseName);
  
  if (config.resume && status === 'done') {
    logger.info(`Skipping ${phaseName} (already done)`);
    await markPhaseSkipped(phaseName);
    return;
  }
  
  await markPhaseStarted(phaseName);
  logger.info(`Starting phase: ${phaseName}`);
  
  const worksPath = path.join(config.sourceDir, 'goodreads_book_works.json');
  
  const heap = new BoundedTopHeap<any>(config.worksLimit, (a, b) => {
    if (a.ratings_count !== b.ratings_count) return a.ratings_count - b.ratings_count;
    if (a.text_reviews_count !== b.text_reviews_count) return a.text_reviews_count - b.text_reviews_count;
    if (a.reviews_count !== b.reviews_count) return a.reviews_count - b.reviews_count;
    if (a.books_count !== b.books_count) return a.books_count - b.books_count;
    return b.work_id - a.work_id; // smaller work_id is kept
  });
  
  const duplicateDetector = new DuplicateDetector();
  let lineCount = 0;
  
  await streamJsonl(worksPath, async (record: any) => {
    lineCount++;
    if (lineCount % 100000 === 0) {
      logger.info(`Phase 01: Scanned ${lineCount} works`);
      trackMemory(report);
    }
    
    const work = {
      work_id: safeInt(record.work_id) || 0,
      best_book_id: safeInt(record.best_book_id) || 0,
      original_title: record.original_title || '',
      original_language_id: record.original_language_id || '',
      original_publication_year: safeInt(record.original_publication_year),
      ratings_count: safeInt(record.ratings_count) || 0,
      ratings_sum: safeInt(record.ratings_sum) || 0,
      text_reviews_count: safeInt(record.text_reviews_count) || 0,
      reviews_count: safeInt(record.reviews_count) || 0,
      books_count: safeInt(record.books_count) || 0,
      media_type: record.media_type || '',
    };
    
    heap.push(work);
    duplicateDetector.addWork({
      work_id: String(work.work_id),
      original_title: work.original_title,
      best_book_id: String(work.best_book_id),
      ratings_count: work.ratings_count,
      text_reviews_count: work.text_reviews_count,
      original_publication_year: String(work.original_publication_year),
      media_type: work.media_type
    });
  }, { progressEvery: 100000 });
  
  const topWorks = heap.toArray();
  
  const worksWithScore = topWorks.map(work => {
    const avgRating = work.ratings_count > 0 ? work.ratings_sum / work.ratings_count : 0;
    const popularityScore = Math.log10(work.ratings_count + 1) * avgRating * Math.log10(work.text_reviews_count + 1);
    return { ...work, popularity_score: popularityScore };
  });
  
  worksWithScore.sort((a, b) => b.popularity_score - a.popularity_score);
  
  const finalWorks = worksWithScore.map((w, idx) => ({
    ...w,
    rank_position: idx + 1
  }));
  
  if (!config.dryRun) {
    logger.info(`Inserting ${finalWorks.length} works into _import_works`);
    await copyFromArray(pool, '_import_works', [
      'work_id', 'best_book_id', 'original_title', 'original_language_id', 
      'original_publication_year', 'ratings_count', 'ratings_sum', 'text_reviews_count',
      'reviews_count', 'books_count', 'media_type', 'popularity_score', 'rank_position'
    ], finalWorks.map(w => [
      w.work_id, w.best_book_id, w.original_title, w.original_language_id,
      w.original_publication_year, w.ratings_count, w.ratings_sum, w.text_reviews_count,
      w.reviews_count, w.books_count, w.media_type, w.popularity_score, w.rank_position
    ]));
  }
  
  report.counts = report.counts || {};
  report.counts.worksSelected = finalWorks.length;
  
  const duplicates = duplicateDetector.getCandidates();
  if (duplicates.length > 0) {
    logger.warn(`Found ${duplicates.length} duplicate candidates`);
    const dupPath = path.join(config.sourceDir, `duplicate-candidates-${Date.now()}.json`);
    fs.writeFileSync(dupPath, JSON.stringify(duplicates, null, 2));
  }
  
  await markPhaseDone(phaseName);
  logger.info(`Finished phase: ${phaseName}`);
}
