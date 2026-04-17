/**
 * @jest-environment node
 */
import { POST } from "@/app/api/analyze/route";
import Anthropic from "@anthropic-ai/sdk";

jest.mock("@anthropic-ai/sdk");

const MockAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/analyze", {
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
                text: JSON.stringify({
                  siteType: "E-commerce product page",
                  options: [
                    { label: "Product price", watchTarget: "the product price" },
                    { label: "Stock status", watchTarget: "whether the product is in stock" },
                  ],
                }),
              },
            ],
          }),
        },
      }) as unknown as InstanceType<typeof Anthropic>
  );
});

describe("POST /api/analyze", () => {
  it("returns siteType and options for valid input", async () => {
    const res = await POST(
      makeRequest({ markdown: "# Product\n\n$49.99\n\nIn stock" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.siteType).toBe("string");
    expect(body.siteType.length).toBeGreaterThan(0);
    expect(Array.isArray(body.options)).toBe(true);
    expect(body.options.length).toBeGreaterThan(0);
    expect(typeof body.options[0].label).toBe("string");
    expect(typeof body.options[0].watchTarget).toBe("string");
  });

  it("strips markdown code fences from Claude response", async () => {
    MockAnthropic.mockImplementation(
      () =>
        ({
          messages: {
            create: jest.fn().mockResolvedValue({
              content: [
                {
                  type: "text",
                  text:
                    "```json\n" +
                    JSON.stringify({
                      siteType: "News website",
                      options: [{ label: "Top headline", watchTarget: "the top news headline" }],
                    }) +
                    "\n```",
                },
              ],
            }),
          },
        }) as unknown as InstanceType<typeof Anthropic>
    );
    const res = await POST(
      makeRequest({ markdown: "# Breaking News" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.siteType).toBe("News website");
  });

  it("returns 400 when markdown is missing", async () => {
    const res = await POST(makeRequest({}));
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
      makeRequest({ markdown: "content" })
    );
    expect(res.status).toBe(500);
  });
});
