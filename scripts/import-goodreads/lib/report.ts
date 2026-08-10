import fs from 'node:fs';
import path from 'node:path';

export interface ImportReport {
  timestamp: string;
  configuration: {
    sourceDir: string;
    worksLimit: number;
    editionsPerWork: number;
    outputPath: string | null;
    dryRun: boolean;
    resume: boolean;
  };
  datasetFiles: Record<string, { path: string; sizeBytes: number | null }>;
  phases: Record<string, { status: 'pending' | 'running' | 'done' | 'skipped'; durationMs?: number }>;
  counts: {
    worksSelected: number;
    worksImported: number;
    worksWithoutEditions: number;
    editionsScanned: number;
    editionsRetained: number;
    editionsRejectedByReason: Record<string, number>;
    authorsImported: number;
    seriesImported: number;
    genresImported: number;
    coverUrlsImported: number;
    isbnConflicts: number;
    externalIdConflicts: number;
    duplicateCandidateGroups: number;
  };
  integrity: Record<string, { passed: boolean; detail?: string }>;
  performance: {
    totalDurationMs: number;
    peakMemoryMb: number;
  };
  output: {
    dumpPath: string | null;
    dumpSizeBytes: number | null;
    restoreCommand: string | null;
  };
}

export function createReport(config: ImportReport['configuration']): ImportReport {
  return {
    timestamp: new Date().toISOString(),
    configuration: config,
    datasetFiles: {},
    phases: {},
    counts: {
      worksSelected: 0,
      worksImported: 0,
      worksWithoutEditions: 0,
      editionsScanned: 0,
      editionsRetained: 0,
      editionsRejectedByReason: {},
      authorsImported: 0,
      seriesImported: 0,
      genresImported: 0,
      coverUrlsImported: 0,
      isbnConflicts: 0,
      externalIdConflicts: 0,
      duplicateCandidateGroups: 0,
    },
    integrity: {},
    performance: {
      totalDurationMs: 0,
      peakMemoryMb: 0,
    },
    output: {
      dumpPath: null,
      dumpSizeBytes: null,
      restoreCommand: null,
    },
  };
}

export function saveReport(report: ImportReport, sourceDir: string): string {
  // Use a filesystem-friendly timestamp
  const ts = report.timestamp.replace(/[:.]/g, '-');
  const filename = `import-report-${ts}.json`;
  const reportPath = path.join(sourceDir, filename);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return reportPath;
}

export function trackMemory(report: ImportReport): void {
  const usedMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  if (usedMb > report.performance.peakMemoryMb) {
    report.performance.peakMemoryMb = usedMb;
  }
}
