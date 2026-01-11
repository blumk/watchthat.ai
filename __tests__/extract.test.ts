/**
 * @jest-environment node
 */
import { POST } from "@/app/api/extract/route";
import Anthropic from "@anthropic-ai/sdk";

jest.mock("@anthropic-ai/sdk");

const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  MockAnthropic.mockImplementation(
    () =>
      ({
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{ type: "text", text: "$99/month" }],
          }),
        },
      }) as unknown as InstanceType<typeof Anthropic>
  );
});

describe("POST /api/extract", () => {
  it("returns extracted value for valid input", async () => {
    const res = await POST(
      makeRequest({ markdown: "Pro plan costs $99/month.", watchTarget: "Pro plan price" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.value).toBe("$99/month");
  });

  it("returns 400 when markdown is missing", async () => {
    const res = await POST(makeRequest({ watchTarget: "Pro plan price" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when watchTarget is missing", async () => {
    const res = await POST(makeRequest({ markdown: "some content" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when Claude throws", async () => {
    MockAnthropic.mockImplementationOnce(
      () =>
        ({
          messages: {
            create: jest.fn().mockRejectedValue(new Error("API error")),
          },
        }) as unknown as InstanceType<typeof Anthropic>
    );
    const res = await POST(
      makeRequest({ markdown: "content", watchTarget: "price" })
    );
    expect(res.status).toBe(500);
  });
});
