import { newId, AppError, sleep } from "@agency/core";
import type { Db } from "@agency/db";

export interface JobPayload {
  orgId: string;
  type: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
  delayMs?: number;
}

export interface ClaimedJob {
  id: string;
  orgId: string;
  jobType: string;
  payload: Record<string, unknown>;
  attempts: number;
}

type Handler = (job: ClaimedJob) => Promise<void>;

/**
 * Persistent job queue with at-least-once delivery, exponential backoff and a
 * dead-letter state. Claims are atomic via conditional UPDATE. Long-running
 * operations must go through this queue, never block HTTP handlers.
 */
export class JobQueue {
  private handlers = new Map<string, Handler>();
  private running = false;
  private pollMs: number;
  private concurrency: number;
  private db: Db;

  constructor(db: Db, opts?: { pollMs?: number; concurrency?: number }) {
    this.db = db;
    this.pollMs = opts?.pollMs ?? 500;
    this.concurrency = opts?.concurrency ?? 4;
  }

  register(jobType: string, handler: Handler): void {
    this.handlers.set(jobType, handler);
  }

  enqueue(p: JobPayload): { id: string } {
    // Phase A/F-02: INSERT-first atomic idempotency. Losers of the race
    // re-read the winner's row instead of check-then-insert.
    if (p.idempotencyKey) {
      const existing = this.db.get<{ id: string; status: string; last_error: string | null }>(
        "SELECT id, status, last_error FROM jobs WHERE idempotency_key = ?",
        [p.idempotencyKey]
      );
      if (existing && existing.status !== "failed" && existing.status !== "dead_letter") {
        return { id: String(existing.id) };
      }
    }
    const id = newId("job");
    const now = this.db.now();
    try {
      this.db.transaction(() => {
        this.db.insert("jobs", {
          id,
          org_id: p.orgId,
          queue: "default",
          job_type: p.type,
          payload: JSON.stringify({ orgId: p.orgId, type: p.type, data: p.data }),
          status: "pending",
          run_after: new Date(Date.parse(now) + (p.delayMs ?? 0)).toISOString(),
          max_attempts: p.maxAttempts ?? 5,
          attempts: 0,
          idempotency_key: p.idempotencyKey ?? null,
          created_at: now,
          updated_at: now,
        });
      });
      return { id };
    } catch (e) {
      // Unique violation on (idempotency_key) → loser re-reads winner.
      const msg = String((e as Error).message ?? e);
      if (/UNIQUE constraint failed|duplicate key value|unique/i.test(msg) && p.idempotencyKey) {
        const winner = this.db.get<{ id: string }>(
          "SELECT id FROM jobs WHERE idempotency_key = ?",
          [p.idempotencyKey]
        );
        if (winner) return { id: String(winner.id) };
      }
      throw e;
    }
  }

  /** Atomically claim due pending jobs. */
  private claim(workerId: string): ClaimedJob | undefined {
    return this.db.transaction(() => {
      const row = this.db.get<{
        id: string;
        org_id: string;
        job_type: string;
        payload: string;
        attempts: number;
        max_attempts: number;
        run_after: string;
      }>(
        `SELECT id, org_id, job_type, payload, attempts, max_attempts, run_after
         FROM jobs
         WHERE status = 'pending' AND run_after <= ?
         ORDER BY run_after LIMIT 1`,
        [this.db.now()]
      );
      if (!row) return undefined;
      const claimed = this.driverRunClaim(row.id, workerId);
      if (!claimed) return undefined;
      return {
        id: row.id,
        orgId: row.org_id,
        jobType: row.job_type,
        payload: JSON.parse(row.payload) as Record<string, unknown>,
        attempts: Number(row.attempts) + 1,
      };
    });
  }

  private driverRunClaim(jobId: string, workerId: string): boolean {
    const res = this.db.driver.run(
      `UPDATE jobs SET status='running', locked_by=?, locked_at=?, attempts=attempts+1, updated_at=?
       WHERE id=? AND status='pending'`,
      [workerId, this.db.now(), this.db.now(), jobId]
    );
    return Number(res.changes) === 1;
  }

  async processOne(): Promise<boolean> {
    const workerId = `worker-${process.pid}-${newId("w").slice(6, 12)}`;
    const job = this.claim(workerId);
    if (!job) return false;
    const handler = this.handlers.get(job.jobType);
    try {
      if (!handler) throw new Error(`no handler registered for ${job.jobType}`);
      await handler(job);
      // Phase A/F-02 companion fix: a handler may have already moved the job
      // to a terminal state (e.g. self-dead-lettered permanent policy errors).
      // Only mark succeeded if the row is still claimed/running.
      const res = this.db.driver.run(
        `UPDATE jobs SET status='succeeded', updated_at=?, locked_by=NULL WHERE id=? AND status='running'`,
        [this.db.now(), job.id]
      );
      void res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const row = this.db.get<{ attempts: number; max_attempts: number }>(
        "SELECT attempts, max_attempts FROM jobs WHERE id = ?",
        [job.id]
      );
      const attempts = Number(row?.attempts ?? 1);
      const maxAttempts = Number(row?.max_attempts ?? 5);
      if (attempts >= maxAttempts) {
        this.db.updateById("jobs", job.id, {
          status: "dead_letter",
          last_error: msg.slice(0, 2000),
          updated_at: this.db.now(),
        });
      } else {
        const backoffMs = Math.min(60_000, 500 * 2 ** attempts);
        this.db.updateById("jobs", job.id, {
          status: "pending",
          last_error: msg.slice(0, 2000),
          run_after: new Date(Date.now() + backoffMs).toISOString(),
          updated_at: this.db.now(),
          locked_by: null,
        });
      }
    }
    return true;
  }

  /**
   * Reclaim jobs whose worker died mid-run (GAP G-04): any 'running' job with
   * a lock older than `olderThanMs` goes back to 'pending' for retry.
   * Safe under concurrency — conditional UPDATE only flips matching rows.
   */
  reclaimStale(olderThanMs = 10 * 60_000): number {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const res = this.db.driver.run(
      `UPDATE jobs SET status = 'pending', updated_at = ?
       WHERE status = 'running' AND locked_at IS NOT NULL AND locked_at < ?`,
      [this.db.now(), cutoff]
    );
    return Number(res.changes);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    let sinceReclaim = 0;
    while (this.running) {
      let processed = 0;
      for (let i = 0; i < this.concurrency; i++) {
        const did = await this.processOne();
        if (did) processed++;
      }
      // Periodically reclaim crashed-worker jobs (every ~60s of idle loops).
      if (Date.now() - sinceReclaim > 60_000) {
        this.reclaimStale();
        sinceReclaim = Date.now();
      }
      if (processed === 0) await sleep(this.pollMs);
    }
  }

  stats(orgId: string): Record<string, number> {
    const rows = this.db.all<{ status: string; n: number }>(
      "SELECT status, COUNT(*) AS n FROM jobs WHERE org_id = ? GROUP BY status",
      [orgId]
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[String(r.status)] = Number(r.n);
    return out;
  }

  deadLetters(orgId: string): Row[] {
    return this.db.all(
      "SELECT * FROM jobs WHERE org_id = ? AND status = 'dead_letter' ORDER BY updated_at DESC LIMIT 50",
      [orgId]
    );
  }

  retryDeadLetter(jobId: string): void {
    const res = this.db.driver.run(
      `UPDATE jobs SET status='pending', attempts=0, last_error=NULL, run_after=?, updated_at=?
       WHERE id=? AND status='dead_letter'`,
      [this.db.now(), this.db.now(), jobId]
    );
    if (Number(res.changes) !== 1) {
      throw new AppError("NOT_FOUND", `dead-letter job ${jobId} not found`);
    }
  }
}

type Row = Record<string, unknown>;
