/**
 * @jest-environment node
 */
import { POST } from "@/app/api/describe-change/route";
import Anthropic from "@anthropic-ai/sdk";

jest.mock("@anthropic-ai/sdk");

const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/describe-change", {
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
            content: [
              {
                type: "text",
                text: "The Pro plan price increased from $99/month to $149/month.",
              },
            ],
          }),
        },
      }) as unknown as InstanceType<typeof Anthropic>
  );
});

describe("POST /api/describe-change", () => {
  it("returns a description for valid input", async () => {
    const res = await POST(
      makeRequest({
        oldValue: "$99/month",
        newValue: "$149/month",
        watchTarget: "Pro plan price",
        url: "https://example.com/pricing",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.description).toBe("string");
    expect(body.description.length).toBeGreaterThan(0);
  });

  it("returns 400 when any required field is missing", async () => {
    const res = await POST(
      makeRequest({ oldValue: "$99", newValue: "$149" })
    );
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
      makeRequest({
        oldValue: "$99",
        newValue: "$149",
        watchTarget: "price",
        url: "https://example.com",
      })
    );
    expect(res.status).toBe(500);
  });
});
