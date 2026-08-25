#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import fs from 'fs';
import { getPool, createStagingTables, dropStagingTables, resetStagingTables, closePool } from './lib/staging-db';
import { createProgressLogger } from './lib/progress';
import { createReport, saveReport } from './lib/report';
import { phase01SelectWorks } from './phases/01-select-works';
import { phase02FilterEditions } from './phases/02-filter-editions';
import { phase03ImportAuthors } from './phases/03-import-authors';
import { phase04ImportSeries } from './phases/04-import-series';
import { phase05ImportGenres } from './phases/05-import-genres';
import { phase06Finalize } from './phases/06-finalize';
import { phase07IntegrityChecks } from './phases/07-integrity-checks';
import { phase08Dump } from './phases/08-dump';

export interface ImportConfig {
  sourceDir: string;
  worksLimit: number;
  editionsPerWork: number;
  outputPath: string | null;
  dryRun: boolean;
  resume: boolean;
}

const program = new Command();

program
  .name('import-goodreads')
  .description('CLI to import Goodreads dataset')
  .requiredOption('--source <dir>', 'Directory containing dataset files')
  .option('--works <number>', 'Number of top works to import', '50000')
  .option('--editions-per-work <number>', 'Max editions per work', '12')
  .option('--output <path>', 'Output dump file path')
  .option('--resume', 'Resume interrupted import (skip completed phases)')
  .option('--dry-run', 'Process and validate without writing to production tables or dumping')
  .option('--drop-staging', 'Drop staging tables before starting (forces fresh import)');

program.parse(process.argv);

const options = program.opts();

const config: ImportConfig = {
  sourceDir: options.source,
  worksLimit: parseInt(options.works, 10),
  editionsPerWork: parseInt(options.editionsPerWork, 10),
  outputPath: options.output || null,
  dryRun: !!options.dryRun,
  resume: !!options.resume,
};

if (!fs.existsSync(config.sourceDir) || !fs.statSync(config.sourceDir).isDirectory()) {
  console.error(`Error: Source directory '${config.sourceDir}' does not exist or is not a directory.`);
  process.exit(1);
}

if (isNaN(config.worksLimit) || config.worksLimit <= 0) {
  console.error(`Error: --works must be a positive integer.`);
  process.exit(1);
}

if (isNaN(config.editionsPerWork) || config.editionsPerWork < 1 || config.editionsPerWork > 12) {
  console.error(`Error: --editions-per-work must be between 1 and 12.`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(`Error: DATABASE_URL must be set in environment.`);
  process.exit(1);
}

if (
  process.env.RAILWAY_ENVIRONMENT === "production" &&
  process.env.ALLOW_CATALOG_IMPORT !== "true"
) {
  console.error(
    "Refusing to grow the production catalog. Set ALLOW_CATALOG_IMPORT=true to override."
  );
  process.exit(1);
}

const logger = createProgressLogger();
const report = createReport(config);

console.log(`====================================
  Goodreads Dataset Importer
====================================
  Works limit:     ${config.worksLimit.toLocaleString()}
  Editions/work:   ${config.editionsPerWork}
  Source:          ${config.sourceDir}
  Output:          ${config.outputPath || 'none'}
  Dry run:         ${config.dryRun}
  Resume:          ${config.resume}
====================================`);

async function main() {
  try {
    const pool = getPool();
    
    if (options.dropStaging) {
      console.log('Dropping staging tables...');
      await dropStagingTables(pool);
    }
    
    console.log('Creating staging tables if not exists...');
    await createStagingTables(pool);

    if (!config.resume) {
      console.log('Clearing staging data for a fresh import...');
      await resetStagingTables(pool);
    }

    console.log('Starting phases...');

    await phase01SelectWorks(config, report, logger);
    await phase02FilterEditions(config, report, logger);
    await phase03ImportAuthors(config, report, logger);
    await phase04ImportSeries(config, report, logger);
    await phase05ImportGenres(config, report, logger);

    // Rehydrate summary counts when completed phases were skipped during resume.
    const stagedCounts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM _import_works)::int AS works,
        (SELECT COUNT(*) FROM _import_editions)::int AS editions,
        (SELECT COUNT(*) FROM _import_author_data)::int AS authors,
        (SELECT COUNT(*) FROM _import_series_data)::int AS series,
        (SELECT COUNT(*) FROM _import_work_genres)::int AS genres
    `);
    const counts = stagedCounts.rows[0];
    report.counts.worksSelected = counts.works;
    report.counts.editionsRetained = counts.editions;
    report.counts.authorsImported = counts.authors;
    report.counts.seriesImported = counts.series;
    report.counts.genresImported = counts.genres;
    
    if (!config.dryRun) {
      await phase06Finalize(config, report, logger);
    } else {
      console.log('Skipping Phase 06 (Finalize) due to --dry-run');
    }

    await phase07IntegrityChecks(config, report, logger);

    if (!config.dryRun && config.outputPath) {
      await phase08Dump(config, report, logger);
    } else {
      console.log('Skipping Phase 08 (Dump) due to --dry-run or no output path');
    }

    const reportPath = saveReport(report, config.sourceDir);

    const durationSec = Math.round((Date.now() - new Date(report.timestamp).getTime()) / 1000);
    const durationStr = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

    console.log(`====================================
  Import Complete
====================================
  Works imported:     ${(report.counts.worksSelected || 0).toLocaleString()}
  Editions imported:  ${(report.counts.editionsRetained || 0).toLocaleString()}
  Authors imported:   ${(report.counts.authorsImported || 0).toLocaleString()}
  Series imported:    ${(report.counts.seriesImported || 0).toLocaleString()}
  Genres:             ${(report.counts.genresImported || 0).toLocaleString()} associations
  Covers:             ${(report.counts.coverUrlsImported || 0).toLocaleString()} URLs
  Duration:           ${durationStr}
  Report:             ${reportPath}
====================================`);

    await closePool();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error during import:', error);
    try {
      await saveReport(report, options.source);
    } catch (saveError) {
      console.error('Failed to save partial report:', saveError);
    }
    await closePool().catch(() => {});
    process.exit(1);
  }
}

main();
