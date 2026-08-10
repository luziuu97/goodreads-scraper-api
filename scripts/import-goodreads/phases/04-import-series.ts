import path from 'node:path';
import { streamJsonl } from '../lib/stream';
import { getPool, getPhaseStatus, markPhaseStarted, markPhaseDone, markPhaseSkipped, copyFromArray } from '../lib/staging-db';
import { safeInt } from '../lib/normalize';
import type { ProgressLogger } from '../lib/progress';
import { type ImportReport, trackMemory } from '../lib/report';
import type { ImportConfig } from '../types';

/**
 * Phase 4: Import relevant series.
 */
export async function phase04ImportSeries(
  config: ImportConfig,
  report: ImportReport,
  logger: ProgressLogger
): Promise<void> {
  const phaseName = '04-import-series';
  const pool = getPool();
  const status = await getPhaseStatus(phaseName);
  
  if (config.resume && status === 'done') {
    logger.info(`Skipping ${phaseName}`);
    await markPhaseSkipped(phaseName);
    return;
  }
  
  await markPhaseStarted(phaseName);
  
  const neededRes = await pool.query('SELECT series_id FROM _import_needed_series');
  const neededIds = new Set<string>();
  for (const row of neededRes.rows) {
    neededIds.add(row.series_id.toString());
  }
  
  const seriesPath = path.join(config.sourceDir, 'goodreads_book_series.json');
  const seriesToInsert: any[] = [];
  let lineCount = 0;
  
  await streamJsonl(seriesPath, async (record: any) => {
    lineCount++;
    if (lineCount % 100000 === 0) {
      logger.info(`Phase 04: Scanned ${lineCount} series`);
      trackMemory(report);
    }
    
    if (record.series_id && neededIds.has(record.series_id.toString())) {
      seriesToInsert.push({
        series_id: safeInt(record.series_id),
        title: record.title || '',
        description: record.description || '',
        note: record.note || '',
        numbered: record.numbered === 'true' || record.numbered === true,
        series_works_count: safeInt(record.series_works_count) || 0,
        primary_work_count: safeInt(record.primary_work_count) || 0
      });
    }
  }, { batchSize: 10000 });
  
  if (!config.dryRun) {
    logger.info(`Inserting ${seriesToInsert.length} series`);
    await copyFromArray(pool, '_import_series_data', [
      'series_id', 'title', 'description', 'note', 'numbered', 'series_works_count', 'primary_work_count'
    ], seriesToInsert.map(s => [
      s.series_id, s.title, s.description, s.note, s.numbered, s.series_works_count, s.primary_work_count
    ]));
  }
  
  report.counts = report.counts || {};
  report.counts.seriesImported = seriesToInsert.length;
  
  await markPhaseDone(phaseName);
  logger.info(`Finished phase: ${phaseName}`);
}
