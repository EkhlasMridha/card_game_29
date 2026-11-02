/** Token-bucket rate limiter, one per connection. */
export class RateLimiter {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly capacity = 30,
    private readonly refillPerSecond = 12,
  ) {
    this.tokens = capacity;
  }

  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
