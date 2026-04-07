// Minimal in-memory fake of the supabase-js client, scoped to the subset of
// calls lib/db.ts actually makes. Enough to assert behaviour without a real
// Supabase instance.

import type { User } from "@supabase/supabase-js";
import { extractLabel } from "@/lib/url";

export interface FakePage {
  id: string;
  url: string;
  label: string;
}

export interface FakeWatch {
  id: string;
  user_id: string;
  page_id: string;
  watch_target: string | null;
  created_at: number;
}

export interface FakeState {
  pages: FakePage[];
  watches: FakeWatch[];
  user: User;
  nextId: number;
}

export function makeFakeState(userId = "test-user"): FakeState {
  return {
    pages: [],
    watches: [],
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
  private payload: unknown = null;
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitTo: number | null = null;

  constructor(private state: FakeState, private table: "pages" | "watches") {}

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
    return this.filters.every((f) => row[f.col] === f.val);
  }

  private async resolve(): Promise<{ data: unknown; error: unknown }> {
    const rows = this.table === "pages" ? this.state.pages : this.state.watches;
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
              Object.assign(r, patch);
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
    from: (table: "pages" | "watches") => new Query(state, table),
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
