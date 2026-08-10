import fs from 'node:fs';
import readline from 'node:readline';

/**
 * Streams a JSONL file line by line, calling the callback for each parsed record.
 * Handles malformed lines by logging a warning and continuing.
 * Reports progress every `progressEvery` lines.
 */
export async function streamJsonl<T>(
  filePath: string,
  onRecord: (record: T, lineNumber: number) => Promise<void> | void,
  options?: {
    progressEvery?: number;
    onProgress?: (linesRead: number, linesErrored: number) => void;
    signal?: AbortSignal;
  }
): Promise<{ linesRead: number; linesErrored: number }> {
  const progressEvery = options?.progressEvery ?? 100000;
  let linesRead = 0;
  let linesErrored = 0;

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const signal = options?.signal;
  let aborted = false;

  const onAbort = () => {
    aborted = true;
    rl.close();
  };

  if (signal) {
    if (signal.aborted) {
      return { linesRead, linesErrored };
    }
    signal.addEventListener('abort', onAbort);
  }

  try {
    for await (const line of rl) {
      if (aborted) break;

      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      linesRead++;
      let record: T;
      try {
        record = JSON.parse(trimmed);
      } catch (err) {
        console.warn(`[streamJsonl] Failed to parse JSON on line ${linesRead} in ${filePath}:`, err);
        linesErrored++;
        continue;
      }

      try {
        await onRecord(record, linesRead);
      } catch (err) {
        console.warn(`[streamJsonl] Error processing record on line ${linesRead} in ${filePath}:`, err);
        linesErrored++;
      }

      if (options?.onProgress && linesRead % progressEvery === 0) {
        options.onProgress(linesRead, linesErrored);
      }
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
    rl.close();
    fileStream.close();
  }

  return { linesRead, linesErrored };
}
