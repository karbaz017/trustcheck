import pg from "pg";
import type { CheckResult } from "../types.js";
import type { SearchHit } from "../search/types.js";

export interface CheckRow {
  id: string;
  userId: string | null;
  inputText: string;
  inputUrl: string | null;
  status: "running" | "done" | "failed";
  result: CheckResult | null;
  error: string | null;
  timings: Record<string, number>;
  createdAt: string;
}

export interface Store {
  init(): Promise<void>;
  createCheck(row: Pick<CheckRow, "id" | "userId" | "inputText" | "inputUrl">): Promise<void>;
  finishCheck(id: string, patch: { status: "done" | "failed"; result?: CheckResult | null; error?: string | null; timings: Record<string, number> }): Promise<void>;
  getCheck(id: string): Promise<CheckRow | null>;
  listByUser(userId: string): Promise<CheckRow[]>;
  deleteCheck(id: string, userId: string): Promise<boolean>;
  purgeAnonymous(olderThanDays: number): Promise<number>;
  getSearchCache(hash: string): Promise<SearchHit[] | null>;
  putSearchCache(hash: string, hits: SearchHit[]): Promise<void>;
}

const CACHE_TTL_MS = 24 * 3600 * 1000;

class MemoryStore implements Store {
  private checks = new Map<string, CheckRow>();
  private cache = new Map<string, { hits: SearchHit[]; at: number }>();
  async init() {}
  async createCheck(r: Pick<CheckRow, "id" | "userId" | "inputText" | "inputUrl">) {
    this.checks.set(r.id, { ...r, status: "running", result: null, error: null, timings: {}, createdAt: new Date().toISOString() });
  }
  async finishCheck(id: string, p: { status: "done" | "failed"; result?: CheckResult | null; error?: string | null; timings: Record<string, number> }) {
    const row = this.checks.get(id);
    if (row) Object.assign(row, { status: p.status, result: p.result ?? null, error: p.error ?? null, timings: p.timings });
  }
  async getCheck(id: string) {
    return this.checks.get(id) ?? null;
  }
  async listByUser(userId: string) {
    return [...this.checks.values()].filter((c) => c.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async deleteCheck(id: string, userId: string) {
    const row = this.checks.get(id);
    if (!row || row.userId !== userId) return false;
    return this.checks.delete(id);
  }
  async purgeAnonymous(days: number) {
    const cutoff = Date.now() - days * 86400_000;
    let n = 0;
    for (const [id, c] of this.checks) if (!c.userId && Date.parse(c.createdAt) < cutoff) (this.checks.delete(id), n++);
    return n;
  }
  async getSearchCache(hash: string) {
    const c = this.cache.get(hash);
    return c && Date.now() - c.at < CACHE_TTL_MS ? c.hits : null;
  }
  async putSearchCache(hash: string, hits: SearchHit[]) {
    this.cache.set(hash, { hits, at: Date.now() });
  }
}

class PgStore implements Store {
  private pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url });
  }
  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS checks (
        id uuid PRIMARY KEY,
        user_id text NULL,
        input_text text NOT NULL,
        input_url text NULL,
        status text NOT NULL,
        result_json jsonb NULL,
        error text NULL,
        timings jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS checks_user_idx ON checks (user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS search_cache (
        query_hash text PRIMARY KEY,
        results_json jsonb NOT NULL,
        fetched_at timestamptz NOT NULL DEFAULT now()
      );`);
  }
  private map(r: Record<string, any>): CheckRow {
    return {
      id: r.id, userId: r.user_id, inputText: r.input_text, inputUrl: r.input_url, status: r.status,
      result: r.result_json, error: r.error, timings: r.timings, createdAt: new Date(r.created_at).toISOString(),
    };
  }
  async createCheck(r: Pick<CheckRow, "id" | "userId" | "inputText" | "inputUrl">) {
    await this.pool.query("INSERT INTO checks (id, user_id, input_text, input_url, status) VALUES ($1,$2,$3,$4,'running')", [r.id, r.userId, r.inputText, r.inputUrl]);
  }
  async finishCheck(id: string, p: { status: "done" | "failed"; result?: CheckResult | null; error?: string | null; timings: Record<string, number> }) {
    await this.pool.query("UPDATE checks SET status=$2, result_json=$3, error=$4, timings=$5 WHERE id=$1", [id, p.status, p.result ?? null, p.error ?? null, p.timings]);
  }
  async getCheck(id: string) {
    const { rows } = await this.pool.query("SELECT * FROM checks WHERE id=$1", [id]);
    return rows[0] ? this.map(rows[0]) : null;
  }
  async listByUser(userId: string) {
    const { rows } = await this.pool.query("SELECT * FROM checks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200", [userId]);
    return rows.map((r) => this.map(r));
  }
  async deleteCheck(id: string, userId: string) {
    const r = await this.pool.query("DELETE FROM checks WHERE id=$1 AND user_id=$2", [id, userId]);
    return (r.rowCount ?? 0) > 0;
  }
  async purgeAnonymous(days: number) {
    const r = await this.pool.query("DELETE FROM checks WHERE user_id IS NULL AND created_at < now() - ($1 || ' days')::interval", [String(days)]);
    return r.rowCount ?? 0;
  }
  async getSearchCache(hash: string) {
    const { rows } = await this.pool.query("SELECT results_json FROM search_cache WHERE query_hash=$1 AND fetched_at > now() - interval '24 hours'", [hash]);
    return rows[0]?.results_json ?? null;
  }
  async putSearchCache(hash: string, hits: SearchHit[]) {
    await this.pool.query(
      "INSERT INTO search_cache (query_hash, results_json) VALUES ($1,$2) ON CONFLICT (query_hash) DO UPDATE SET results_json=$2, fetched_at=now()",
      [hash, JSON.stringify(hits)],
    );
  }
}

export const store: Store = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new MemoryStore();
