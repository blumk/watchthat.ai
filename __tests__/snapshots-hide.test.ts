/** @jest-environment node */

jest.mock("@/utils/supabase/service");
jest.mock("@/lib/auth", () => ({
  resolveUserFromAuthHeader: jest.fn(),
}));

import { createServiceClient } from "@/utils/supabase/service";
import { resolveUserFromAuthHeader } from "@/lib/auth";
import { POST } from "@/app/api/snapshots/hide/route";
import {
  makeFakeClient,
  makeFakeState,
  type FakeState,
} from "./helpers/supabase-mock";

const mockCreateServiceClient = createServiceClient as jest.MockedFunction<
  typeof createServiceClient
>;
const mockResolveUser = resolveUserFromAuthHeader as jest.MockedFunction<
  typeof resolveUserFromAuthHeader
>;

function makeRequest(body: Record<string, unknown>, auth?: string) {
  return new Request("https://example.test/api/snapshots/hide", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

let state: FakeState;

beforeEach(() => {
  state = makeFakeState();
  mockCreateServiceClient.mockReturnValue(
    makeFakeClient(state) as unknown as ReturnType<typeof createServiceClient>,
  );
  mockResolveUser.mockReset();
});

describe("POST /api/snapshots/hide", () => {
  it("returns 401 when the caller has no auth", async () => {
    mockResolveUser.mockResolvedValue(null);
    const res = await POST(makeRequest({ snapshotId: "snap-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when snapshotId is missing", async () => {
    mockResolveUser.mockResolvedValue({ id: "u-1" } as never);
    const res = await POST(makeRequest({}, "Bearer t"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the snapshot doesn't exist", async () => {
    mockResolveUser.mockResolvedValue({ id: "u-1" } as never);
    const res = await POST(
      makeRequest({ snapshotId: "snap-ghost" }, "Bearer t"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller doesn't watch the page", async () => {
    mockResolveUser.mockResolvedValue({ id: "u-stranger" } as never);
    state.pages.push({
      id: "page-1",
      url: "https://example.com/",
      label: "example.com",
      last_fetched_at: null,
      latest_snapshot_id: null,
      next_due_at: null,
      hidden_snapshot_ids: [],
    });
    state.snapshots.push({
      id: "snap-1",
      page_id: "page-1",
      fetched_at: new Date().toISOString(),
      content_hash: "h",
      markdown: "# x",
      screenshot_path: null,
      prev_snapshot_id: null,
      change_description: null,
      change_classification: null,
      change_emoji: null,
      facts: null,
    });
    const res = await POST(makeRequest({ snapshotId: "snap-1" }, "Bearer t"));
    expect(res.status).toBe(403);
    expect(state.pages[0].hidden_snapshot_ids).toEqual([]);
  });

  it("appends the snapshot id to pages.hidden_snapshot_ids when authorized", async () => {
    mockResolveUser.mockResolvedValue({ id: "u-1" } as never);
    state.pages.push({
      id: "page-1",
      url: "https://example.com/",
      label: "example.com",
      last_fetched_at: null,
      latest_snapshot_id: null,
      next_due_at: null,
      hidden_snapshot_ids: [],
    });
    state.snapshots.push({
      id: "snap-1",
      page_id: "page-1",
      fetched_at: new Date().toISOString(),
      content_hash: "h",
      markdown: "# x",
      screenshot_path: null,
      prev_snapshot_id: null,
      change_description: null,
      change_classification: null,
      change_emoji: null,
      facts: null,
    });
    state.watches.push({
      id: "w-1",
      user_id: "u-1",
      page_id: "page-1",
      watch_target: null,
      target_notes: null,
      refresh_interval_seconds: 86400,
      hidden_snapshot_ids: [],
      created_at: Date.now(),
    });

    const res = await POST(makeRequest({ snapshotId: "snap-1" }, "Bearer t"));
    expect(res.status).toBe(200);
    expect(state.pages[0].hidden_snapshot_ids).toEqual(["snap-1"]);
  });

  it("is idempotent — a second hide returns ok without duplicating the id", async () => {
    mockResolveUser.mockResolvedValue({ id: "u-1" } as never);
    state.pages.push({
      id: "page-1",
      url: "https://example.com/",
      label: "example.com",
      last_fetched_at: null,
      latest_snapshot_id: null,
      next_due_at: null,
      hidden_snapshot_ids: ["snap-1"],
    });
    state.snapshots.push({
      id: "snap-1",
      page_id: "page-1",
      fetched_at: new Date().toISOString(),
      content_hash: "h",
      markdown: "# x",
      screenshot_path: null,
      prev_snapshot_id: null,
      change_description: null,
      change_classification: null,
      change_emoji: null,
      facts: null,
    });
    state.watches.push({
      id: "w-1",
      user_id: "u-1",
      page_id: "page-1",
      watch_target: null,
      target_notes: null,
      refresh_interval_seconds: 86400,
      hidden_snapshot_ids: [],
      created_at: Date.now(),
    });

    const res = await POST(makeRequest({ snapshotId: "snap-1" }, "Bearer t"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyHidden).toBe(true);
    expect(state.pages[0].hidden_snapshot_ids).toEqual(["snap-1"]);
  });
});
