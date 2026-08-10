export interface ImportConfig {
  sourceDir: string;
  worksLimit: number;
  editionsPerWork: number;
  outputPath: string | null;
  dryRun: boolean;
  resume: boolean;
}
