/**
 * Per-provider circuit breaker.
 * CLOSED → failures exceed threshold → OPEN (reject fast, fallback)
 *        → cooldown → HALF_OPEN → probe success → CLOSED / failure → OPEN
 */
export type CircuitState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private openedAt = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly nowFn: () => number;

  constructor(
    threshold = 5,
    cooldownMs = 30_000,
    nowFn: () => number = () => Date.now()
  ) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.nowFn = nowFn;
  }

  get currentState(): CircuitState {
    if (this.state === "open" && this.nowFn() - this.openedAt >= this.cooldownMs) {
      this.state = "half_open";
    }
    return this.state;
  }

  /** Throws when calls are not allowed right now. */
  acquire(): void {
    const s = this.currentState;
    if (s === "open") throw new Error("circuit_open");
    // closed & half_open allow the attempt
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  onFailure(): void {
    if (this.state === "half_open") {
      this.trip();
      return;
    }
    this.failures++;
    if (this.failures >= this.threshold) this.trip();
  }

  private trip(): void {
    this.state = "open";
    this.openedAt = this.nowFn();
    this.failures = this.threshold;
  }
}
