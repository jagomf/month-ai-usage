import * as vscode from 'vscode';

const MIN_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

/** Result of a refresh: a retry hint in ms when the provider asked us to slow down. */
export type RefreshResult = { retryAfterMs?: number } | void;

export class Scheduler implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private lastRun = 0;
  private backoffMs = 0;
  private running = false;

  constructor(
    private readonly run: () => Promise<RefreshResult>,
    private readonly getIntervalMs: () => number,
  ) {}

  start(): void {
    void this.refreshNow(true);
  }

  /** `force` skips the minimum spacing between requests; used by the manual command. */
  async refreshNow(force = false): Promise<void> {
    if (this.running) {
      return;
    }
    if (!force && Date.now() - this.lastRun < MIN_INTERVAL_MS) {
      return;
    }

    this.running = true;
    try {
      const result = await this.run();
      const retryAfterMs = result?.retryAfterMs;
      this.backoffMs = retryAfterMs
        ? Math.min(Math.max(retryAfterMs, this.backoffMs * 2 || MIN_INTERVAL_MS), MAX_BACKOFF_MS)
        : 0;
    } finally {
      this.running = false;
      this.lastRun = Date.now();
      this.schedule();
    }
  }

  /** Called when the configured interval changes. */
  reschedule(): void {
    this.schedule();
  }

  private schedule(): void {
    this.clearTimer();
    const delay = Math.max(MIN_INTERVAL_MS, this.backoffMs, this.getIntervalMs());
    this.timer = setTimeout(() => {
      void this.refreshNow(true);
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    this.clearTimer();
  }
}
