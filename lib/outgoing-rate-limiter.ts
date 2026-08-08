/**
 * Outgoing API Rate Limiter
 * Ensures outbound requests to third-party providers do not exceed their API rate limits:
 * - Hardcover: max 60 requests per minute (1 req/sec average)
 * - ISBNDB: max 1 request per second (1 req/sec)
 */
class OutgoingRateLimiter {
  private minIntervalMs: number;
  private lastCallTime = 0;
  private queue: Array<() => void> = [];
  private processing = false;

  constructor(requestsPerSecond: number) {
    this.minIntervalMs = 1000 / Math.max(0.1, requestsPerSecond);
  }

  /**
   * Acquire a rate-limit slot before executing an outbound HTTP fetch call.
   */
  public acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastCallTime;
      if (elapsed < this.minIntervalMs) {
        await new Promise((res) => setTimeout(res, this.minIntervalMs - elapsed));
      }
      this.lastCallTime = Date.now();
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }

    this.processing = false;
  }
}

/** Hardcover rate limit: 60 req / minute = 1 req / second */
export const hardcoverLimiter = new OutgoingRateLimiter(1);

/** ISBNDB rate limit: 1 req / second */
export const isbndbLimiter = new OutgoingRateLimiter(1);
