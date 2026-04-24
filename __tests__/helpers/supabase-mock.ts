// Minimal in-memory fake of the supabase-js client, scoped to the subset of
// calls lib/db.ts actually makes. Enough to assert behaviour without a real
// Supabase instance.

import type { User } from "@supabase/supabase-js";
import { extractLabel } from "@/lib/url";

export interface FakePage {
  id: string;
  url: string;
  label: string;
  last_fetched_at: string | null;
  latest_snapshot_id: string | null;
}

export interface FakeWatch {
  id: string;
  user_id: string;
  page_id: string;
  watch_target: string | null;
  created_at: number;
}

export interface FakeSnapshot {
  id: string;
  page_id: string;
  fetched_at: string;
  content_hash: string;
  markdown: string | null;
  screenshot_path: string | null;
  prev_snapshot_id: string | null;
  change_description: string | null;
  change_classification: "major" | "minor" | "quiet" | "error" | null;
  change_emoji: string | null;
  facts: Record<string, string> | null;
}

export interface FakeStorageObject {
  bucket: string;
  path: string;
  bytes: Uint8Array;
  contentType: string | null;
}

export interface FakeState {
  pages: FakePage[];
  watches: FakeWatch[];
  snapshots: FakeSnapshot[];
  storage: FakeStorageObject[];
  user: User;
  nextId: number;
}

export function makeFakeState(userId = "test-user"): FakeState {
  return {
    pages: [],
    watches: [],
    snapshots: [],
    storage: [],
    user: { id: userId } as User,
    nextId: 1,
  };
}

function genId(state: FakeState, prefix: string): string {
  return `${prefix}-${state.nextId++}`;
}

// The query builder returned by `.from(table)`. Each operation (select/insert/
// update/delete/upsert) returns a thenable that resolves to `{ data, error }`.
class Query {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private filters: Array<{ col: string; val: unknown }> = [];
  private inFilters: Array<{ col: string; vals: unknown[] }> = [];
  private payload: unknown = null;
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitTo: number | null = null;

  constructor(
    private state: FakeState,
    private table: "pages" | "watches" | "snapshots",
  ) {}

  select(_cols?: string) {
    this.op = this.op === "select" ? "select" : this.op;
    return this;
  }
  insert(row: unknown) {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(row: unknown) {
    this.op = "update";
    this.payload = row;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert(row: unknown, _opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = row;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.inFilters.push({ col, vals });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  maybeSingle() {
    this.limitTo = 1;
    return this.resolve().then(({ data, error }) => ({
      data: Array.isArray(data) ? (data[0] ?? null) : data,
      error,
    }));
  }
  single() {
    this.limitTo = 1;
    return this.resolve().then(({ data, error }) => ({
      data: Array.isArray(data) ? (data[0] ?? null) : data,
      error,
    }));
  }
  // Terminal — called when awaited directly (no .single/.maybeSingle).
  then<T1, T2>(
    onFulfilled?: (v: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>,
    onRejected?: (reason: unknown) => T2 | PromiseLike<T2>,
  ) {
    return this.resolve().then(onFulfilled, onRejected);
  }

  private matches(row: Record<string, unknown>): boolean {
    if (!this.filters.every((f) => row[f.col] === f.val)) return false;
    if (!this.inFilters.every((f) => f.vals.includes(row[f.col]))) return false;
    return true;
  }

  private rowsForTable(): unknown[] {
    if (this.table === "pages") return this.state.pages;
    if (this.table === "watches") return this.state.watches;
    return this.state.snapshots;
  }

  private async resolve(): Promise<{ data: unknown; error: unknown }> {
    const rows = this.rowsForTable();
    try {
      switch (this.op) {
        case "select": {
          let out = rows.filter((r) => this.matches(r as unknown as Record<string, unknown>));
          if (this.orderCol) {
            out = [...out].sort((a, b) => {
              const av = (a as Record<string, unknown>)[this.orderCol!] as number | string;
              const bv = (b as Record<string, unknown>)[this.orderCol!] as number | string;
              return this.orderAsc ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
            });
          }
          // hydrate joined pages(...) selection on watches
          if (this.table === "watches") {
            out = out.map((w) => ({
              ...w,
              pages: this.state.pages.find((p) => p.id === (w as FakeWatch).page_id) ?? null,
            })) as unknown as typeof out;
          }
          if (this.limitTo) out = out.slice(0, this.limitTo);
          return { data: out, error: null };
        }
        case "insert": {
          const row = this.payload as Record<string, unknown>;
          if (this.table === "pages") {
            const existing = this.state.pages.find((p) => p.url === row.url);
            if (existing) {
              return { data: null, error: { code: "23505", message: "duplicate key" } };
            }
            const created: FakePage = {
              id: genId(this.state, "page"),
              url: row.url as string,
              label: row.label as string,
              last_fetched_at: null,
              latest_snapshot_id: null,
            };
            this.state.pages.push(created);
            return { data: [created], error: null };
          }
          if (this.table === "watches") {
            const existing = this.state.watches.find(
              (w) => w.user_id === row.user_id && w.page_id === row.page_id,
            );
            if (existing) return { data: null, error: { code: "23505", message: "duplicate key" } };
            const created: FakeWatch = {
              id: genId(this.state, "watch"),
              user_id: row.user_id as string,
              page_id: row.page_id as string,
              watch_target: (row.watch_target as string | null) ?? null,
              created_at: Date.now(),
            };
            this.state.watches.push(created);
            return { data: [created], error: null };
          }
          if (this.table === "snapshots") {
            const created: FakeSnapshot = {
              id: genId(this.state, "snap"),
              page_id: row.page_id as string,
              fetched_at:
                (row.fetched_at as string | undefined) ?? new Date().toISOString(),
              content_hash: row.content_hash as string,
              markdown: (row.markdown as string | null | undefined) ?? null,
              screenshot_path: (row.screenshot_path as string | null) ?? null,
              prev_snapshot_id: (row.prev_snapshot_id as string | null) ?? null,
              change_description: (row.change_description as string | null) ?? null,
              change_classification:
                (row.change_classification as FakeSnapshot["change_classification"]) ?? null,
              change_emoji: (row.change_emoji as string | null) ?? null,
              facts:
                (row.facts as Record<string, string> | null | undefined) ?? null,
            };
            this.state.snapshots.push(created);
            return { data: [created], error: null };
          }
          return { data: null, error: { message: "unknown table" } };
        }
        case "upsert": {
          const row = this.payload as Record<string, unknown>;
          if (this.table === "watches") {
            const existing = this.state.watches.find(
              (w) => w.user_id === row.user_id && w.page_id === row.page_id,
            );
            if (existing) {
              existing.watch_target = (row.watch_target as string | null) ?? null;
              return { data: [existing], error: null };
            }
            const created: FakeWatch = {
              id: genId(this.state, "watch"),
              user_id: row.user_id as string,
              page_id: row.page_id as string,
              watch_target: (row.watch_target as string | null) ?? null,
              created_at: Date.now(),
            };
            this.state.watches.push(created);
            return { data: [created], error: null };
          }
          return { data: null, error: { message: "unsupported upsert target" } };
        }
        case "update": {
          const patch = this.payload as Record<string, unknown>;
          const updated: Record<string, unknown>[] = [];
          for (const r of rows) {
            if (this.matches(r as unknown as Record<string, unknown>)) {
              Object.assign(r as object, patch);
              updated.push(r as unknown as Record<string, unknown>);
            }
          }
          return { data: updated, error: null };
        }
        case "delete": {
          if (this.table === "pages") {
            const before = this.state.pages.length;
            this.state.pages = this.state.pages.filter(
              (r) => !this.matches(r as unknown as Record<string, unknown>),
            );
            return { data: { removed: before - this.state.pages.length }, error: null };
          }
          if (this.table === "snapshots") {
            const before = this.state.snapshots.length;
            this.state.snapshots = this.state.snapshots.filter(
              (r) => !this.matches(r as unknown as Record<string, unknown>),
            );
            return { data: { removed: before - this.state.snapshots.length }, error: null };
          }
          const before = this.state.watches.length;
          this.state.watches = this.state.watches.filter(
            (r) => !this.matches(r as unknown as Record<string, unknown>),
          );
          return { data: { removed: before - this.state.watches.length }, error: null };
        }
        default:
          return { data: null, error: { message: "unhandled op" } };
      }
    } catch (err) {
      return { data: null, error: err };
    }
  }
}

export function makeFakeClient(state: FakeState) {
  return {
    from: (table: "pages" | "watches" | "snapshots") => new Query(state, table),
    storage: {
      from: (bucket: string) => ({
        upload: async (
          path: string,
          data: ArrayBuffer | Uint8Array | Blob,
          opts?: { contentType?: string; upsert?: boolean },
        ) => {
          const bytes =
            data instanceof Uint8Array
              ? data
              : data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : new Uint8Array(await (data as Blob).arrayBuffer());
          const existingIdx = state.storage.findIndex(
            (o) => o.bucket === bucket && o.path === path,
          );
          const obj: FakeStorageObject = {
            bucket,
            path,
            bytes,
            contentType: opts?.contentType ?? null,
          };
          if (existingIdx >= 0) {
            if (!opts?.upsert) {
              return { data: null, error: { message: "already exists" } };
            }
            state.storage[existingIdx] = obj;
          } else {
            state.storage.push(obj);
          }
          return { data: { path }, error: null };
        },
      }),
    },
    auth: {
      getSession: async () => ({
        data: { session: { user: state.user, access_token: "fake-token" } },
        error: null,
      }),
      getUser: async () => ({ data: { user: state.user }, error: null }),
      signInAnonymously: async () => ({
        data: { session: { user: state.user, access_token: "fake-token" } },
        error: null,
      }),
    },
  };
}

// Convenience: patch the POST /api/watches route that lib/db.ts calls during
// addSite. Forwards to the same in-memory state as the supabase fake so the
// two stay consistent.
export function installFetchMock(state: FakeState) {
  const original = global.fetch;
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/watches" && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as {
        url: string;
        watchTarget: string | null;
      };
      let page = state.pages.find((p) => p.url === body.url);
      if (!page) {
        page = {
          id: genId(state, "page"),
          url: body.url,
          label: extractLabel(body.url),
          last_fetched_at: null,
          latest_snapshot_id: null,
        };
        state.pages.push(page);
      }
      let watch = state.watches.find(
        (w) => w.user_id === state.user.id && w.page_id === page!.id,
      );
      if (!watch) {
        watch = {
          id: genId(state, "watch"),
          user_id: state.user.id,
          page_id: page.id,
          watch_target: body.watchTarget ?? null,
          created_at: Date.now(),
        };
        state.watches.push(watch);
      }
      const responseBody = JSON.stringify({
        watch: { id: watch.id, watch_target: watch.watch_target },
        page,
      });
      return {
        ok: true,
        status: 200,
        text: async () => responseBody,
        json: async () => JSON.parse(responseBody),
      } as unknown as Response;
    }
    throw new Error(`unmocked fetch: ${init?.method ?? "GET"} ${url}`);
  }) as unknown as typeof global.fetch;
  return () => {
    global.fetch = original;
  };
}
