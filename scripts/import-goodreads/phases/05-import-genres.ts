import path from 'node:path';
import { streamJsonl } from '../lib/stream';
import { getPool, getPhaseStatus, markPhaseStarted, markPhaseDone, copyFromArray } from '../lib/staging-db';
import { safeInt } from '../lib/normalize';
import type { ProgressLogger } from '../lib/progress';
import { type ImportReport, trackMemory } from '../lib/report';
import type { ImportConfig } from '../types';

/**
 * Phase 5: Import top genres per work.
 */
export async function phase05ImportGenres(
  config: ImportConfig,
  report: ImportReport,
  logger: ProgressLogger
): Promise<void> {
  const phaseName = '05-import-genres';
  const pool = getPool();
  const status = await getPhaseStatus(phaseName);
  
  if (config.resume && status === 'done') {
    logger.info(`Skipping ${phaseName}`);
    return;
  }
  
  await markPhaseStarted(phaseName);
  
  const booksRes = await pool.query('SELECT book_id, work_id FROM _import_editions');
  const bookToWorkMap = new Map<string, string>();
  for (const row of booksRes.rows) {
    bookToWorkMap.set(row.book_id.toString(), row.work_id.toString());
  }
  
  const genresPath = path.join(config.sourceDir, 'goodreads_book_genres_initial.json');
  const workGenres = new Map<string, Map<string, number>>();
  
  let lineCount = 0;
  
  await streamJsonl(genresPath, async (record: any) => {
    lineCount++;
    if (lineCount % 100000 === 0) {
      logger.info(`Phase 05: Scanned ${lineCount} genre records`);
      trackMemory(report);
    }
    
    if (record.book_id) {
      const workId = bookToWorkMap.get(record.book_id.toString());
      if (workId && record.genres) {
        let genreMap = workGenres.get(workId);
        if (!genreMap) {
          genreMap = new Map<string, number>();
          workGenres.set(workId, genreMap);
        }
        
        for (const [genre, countStr] of Object.entries(record.genres)) {
          const count = typeof countStr === 'number' ? countStr : safeInt(countStr as string) || 0;
          genreMap.set(genre, (genreMap.get(genre) || 0) + count);
        }
      }
    }
  }, { progressEvery: 100000 });
  
  const genresToInsert: any[] = [];
  
  for (const [workId, genreMap] of workGenres.entries()) {
    const sorted = Array.from(genreMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [genreName, score] of sorted) {
      genresToInsert.push({
        work_id: safeInt(workId),
        genre_name: genreName,
        score: score
      });
    }
  }
  
  logger.info(`Inserting ${genresToInsert.length} work genres`);
  await copyFromArray(pool, '_import_work_genres', ['work_id', 'genre_name', 'score'], genresToInsert.map(g => [g.work_id, g.genre_name, g.score]));
  
  report.counts = report.counts || {};
  report.counts.genresImported = genresToInsert.length;
  
  await markPhaseDone(phaseName);
  logger.info(`Finished phase: ${phaseName}`);
}
