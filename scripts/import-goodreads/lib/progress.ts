export interface ProgressLogger {
  update(phase: string, count: number, total?: number): void;
  log(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
  startPhase(name: string): void;
  endPhase(name: string, durationMs: number): void;
}

export function createProgressLogger(intervalMs: number = 5000): ProgressLogger {
  let lastPrintTime = 0;

  function formatTime() {
    return new Date().toISOString().substring(11, 19);
  }

  return {
    update(phase: string, count: number, total?: number) {
      const now = Date.now();
      if (now - lastPrintTime >= intervalMs) {
        lastPrintTime = now;
        if (total) {
          const percent = ((count / total) * 100).toFixed(1);
          console.log(`[${formatTime()}] ${phase}: ${count.toLocaleString()} / ${total.toLocaleString()} (${percent}%)`);
        } else {
          console.log(`[${formatTime()}] ${phase}: ${count.toLocaleString()}`);
        }
      }
    },
    log(message: string) {
      console.log(`[${formatTime()}] ${message}`);
    },
    info(message: string) {
      console.log(`[${formatTime()}] ${message}`);
    },
    warn(message: string) {
      console.warn(`[${formatTime()}] [WARN] ${message}`);
    },
    error(message: string, err?: unknown) {
      console.error(`[${formatTime()}] [ERROR] ${message}`);
      if (err) {
        console.error(err);
      }
    },
    startPhase(name: string) {
      console.log(`\n=== Starting Phase: ${name} ===`);
      lastPrintTime = 0; // Reset to force immediate next update
    },
    endPhase(name: string, durationMs: number) {
      const seconds = (durationMs / 1000).toFixed(2);
      console.log(`=== Completed Phase: ${name} in ${seconds}s ===\n`);
    }
  };
}
