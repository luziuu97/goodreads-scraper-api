import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ProgressLogger } from '../lib/progress';
import { ImportReport } from '../lib/report';
import { ImportConfig } from '../types';

export async function phase08Dump(
  config: ImportConfig,
  report: ImportReport,
  logger: ProgressLogger
): Promise<void> {
  logger.info('Starting Phase 08: Dump');
  
  if (config.dryRun) {
    logger.info('Skipping dump (dry run)');
    return;
  }
  
  if (!config.outputPath) {
    logger.warn('Skipping dump: outputPath is not configured');
    return;
  }

  const dbUrlStr = process.env.DATABASE_URL;
  if (!dbUrlStr) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  let dbUrl: URL;
  try {
    dbUrl = new URL(dbUrlStr);
  } catch (err) {
    throw new Error('DATABASE_URL is not a valid URL');
  }

  const host = dbUrl.hostname || 'localhost';
  const port = dbUrl.port || '5432';
  const user = dbUrl.username || 'postgres';
  const password = dbUrl.password;
  const dbname = dbUrl.pathname.slice(1) || 'postgres';

  const outputPath = config.outputPath;
  
  try {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf8');
      if (!gitignore.includes('*.dump')) {
        fs.appendFileSync(gitignorePath, '\n*.dump\n');
        logger.info('Added *.dump to .gitignore');
      }
    }
  } catch (err) {
    logger.warn(`Could not update .gitignore: ${err instanceof Error ? err.message : String(err)}`);
  }

  return new Promise((resolve, reject) => {
    logger.info(`Starting pg_dump to ${outputPath}`);
    const args = [
      '-Fc',
      '--no-owner',
      '--no-acl',
      '-h', host,
      '-p', port,
      '-U', user,
      '-d', dbname,
      '-f', outputPath
    ];

    const env = { ...process.env };
    if (password) {
      env.PGPASSWORD = password;
    }

    const pgDump = child_process.spawn('pg_dump', args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    pgDump.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pgDump.on('close', (code) => {
      if (code === 0) {
        try {
          const stats = fs.statSync(outputPath);
          
          if (!report.output) {
            report.output = {
              dumpPath: null,
              dumpSizeBytes: null,
              restoreCommand: null,
            };
          }
          
          report.output.dumpPath = outputPath;
          report.output.dumpSizeBytes = stats.size;
          
          const restoreCommand = `pg_restore -Fc --no-owner -d <dbname> ${outputPath}`;
          report.output.restoreCommand = restoreCommand;
          
          logger.info(`Dump completed successfully. Size: ${stats.size} bytes`);
          console.log(`Restore command: ${restoreCommand}`);
          
          resolve();
        } catch (err) {
          reject(new Error(`Failed to stat dump file: ${err instanceof Error ? err.message : String(err)}`));
        }
      } else {
        reject(new Error(`pg_dump failed with code ${code}: ${stderr}`));
      }
    });

    pgDump.on('error', (err) => {
      reject(new Error(`Failed to spawn pg_dump: ${err.message}`));
    });
  });
}
