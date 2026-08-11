import path from 'node:path';
import { streamJsonl } from '../lib/stream';
import { getPool, getPhaseStatus, markPhaseStarted, markPhaseDone, copyFromArray } from '../lib/staging-db';
import { safeInt } from '../lib/normalize';
import type { ProgressLogger } from '../lib/progress';
import { type ImportReport, trackMemory } from '../lib/report';
import type { ImportConfig } from '../types';

/**
 * Phase 3: Import relevant authors.
 */
export async function phase03ImportAuthors(
  config: ImportConfig,
  report: ImportReport,
  logger: ProgressLogger
): Promise<void> {
  const phaseName = '03-import-authors';
  const pool = getPool();
  const status = await getPhaseStatus(phaseName);
  
  if (config.resume && status === 'done') {
    logger.info(`Skipping ${phaseName}`);
    return;
  }
  
  await markPhaseStarted(phaseName);
  
  const neededRes = await pool.query('SELECT author_id FROM _import_needed_authors');
  const neededIds = new Set<string>();
  for (const row of neededRes.rows) {
    neededIds.add(row.author_id.toString());
  }
  
  const authorsPath = path.join(config.sourceDir, 'goodreads_book_authors.json');
  const authorsToInsert: any[] = [];
  let lineCount = 0;
  
  await streamJsonl(authorsPath, async (record: any) => {
    lineCount++;
    if (lineCount % 100000 === 0) {
      logger.info(`Phase 03: Scanned ${lineCount} authors`);
      trackMemory(report);
    }
    
    if (record.author_id && neededIds.has(record.author_id.toString())) {
      authorsToInsert.push({
        author_id: safeInt(record.author_id),
        name: record.name || ''
      });
    }
  }, { progressEvery: 100000 });
  
  logger.info(`Inserting ${authorsToInsert.length} authors`);
  await copyFromArray(pool, '_import_author_data', ['author_id', 'name'], authorsToInsert.map(a => [a.author_id, a.name]));
  
  report.counts = report.counts || {};
  report.counts.authorsImported = authorsToInsert.length;
  
  await markPhaseDone(phaseName);
  logger.info(`Finished phase: ${phaseName}`);
}
