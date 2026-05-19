/** @jest-environment node */

jest.mock("@/utils/supabase/service");

import { createServiceClient } from "@/utils/supabase/service";
import { POST } from "@/app/api/cron/scrape/route";
import {
  makeFakeClient,
  makeFakeState,
  type FakeState,
} from "./helpers/supabase-mock";

const mockCreateServiceClient = createServiceClient as jest.MockedFunction<
  typeof createServiceClient
>;

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_SECRET = process.env.CRON_SECRET;

function makeRequest(body: Record<string, unknown>, auth?: string) {
  return new Request("https://example.test/api/cron/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

let state: FakeState;
let fetchMock: jest.Mock;

beforeEach(() => {
  state = makeFakeState();
  mockCreateServiceClient.mockReturnValue(
    makeFakeClient(state) as unknown as ReturnType<typeof createServiceClient>,
  );
  process.env.CRON_SECRET = "test-secret";
  fetchMock = jest.fn(async () =>
    new Response(JSON.stringify({ cached: false, newChange: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe("POST /api/cron/scrape", () => {
  it("returns 401 when the Authorization header doesn't match CRON_SECRET", async () => {
    const res = await POST(makeRequest({ pageId: "page-1" }, "Bearer wrong"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const res = await POST(makeRequest({ pageId: "page-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when pageId is missing", async () => {
    const res = await POST(makeRequest({}, "Bearer test-secret"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the page row no longer exists", async () => {
    const res = await POST(makeRequest({ pageId: "page-ghost" }, "Bearer test-secret"));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delegates to /api/scrape with the page's URL when authorized", async () => {
    state.pages.push({
      id: "page-1",
      url: "https://example.com/",
      label: "example.com",
      last_fetched_at: null,
      latest_snapshot_id: null,
      next_due_at: null,
    });
    const res = await POST(makeRequest({ pageId: "page-1" }, "Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.newChange).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toMatch(/\/api\/scrape$/);
    expect(calledInit.method).toBe("POST");
    expect(JSON.parse(calledInit.body as string)).toEqual({
      url: "https://example.com/",
    });
  });
});
