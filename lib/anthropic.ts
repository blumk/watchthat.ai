import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";

// Single seam between the app and Anthropic. Constructs the instrumented
// client (Sentry input/output recording) in one place so describe-change and
// analyze share the same configuration, and so e2e tests can branch on
// E2E_MOCK=1 without each call site needing its own escape hatch.
//
// Safety: prod must NEVER set E2E_MOCK. We surface that as a Sentry warning
// rather than silently returning fixture data on prod.
export function createAnthropicClient(): Anthropic {
  if (process.env.E2E_MOCK === "1") {
    if (process.env.VERCEL_ENV === "production") {
      Sentry.captureMessage(
        "E2E_MOCK=1 observed in production — refusing to mock Anthropic",
        "error",
      );
    } else {
      return mockAnthropicClient() as unknown as Anthropic;
    }
  }

  return Sentry.instrumentAnthropicAiClient(
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    { recordInputs: true, recordOutputs: true },
  );
}

// Minimal fake Anthropic client for E2E_MOCK=1. Inspects the first user
// message and returns a canned JSON response shaped for whichever endpoint
// the prompt belongs to. Keep this dumb on purpose — real assertions about
// describe/analyze behavior belong in Jest unit tests, not e2e.
type FakeMessageRequest = {
  messages: Array<{ role: string; content: string }>;
};
type FakeMessage = { content: Array<{ type: "text"; text: string }> };

function mockAnthropicClient() {
  return {
    messages: {
      create: async (req: FakeMessageRequest): Promise<FakeMessage> => {
        const prompt = req.messages?.[0]?.content ?? "";
        const text = pickFixture(prompt);
        return { content: [{ type: "text", text }] };
      },
    },
  };
}

function pickFixture(prompt: string): string {
  // /api/analyze prompt has a distinctive "siteType" + "options" schema.
  if (prompt.includes('"siteType"') && prompt.includes('"options"')) {
    return JSON.stringify({
      siteType: "Sample product page",
      options: [
        {
          label: "Product price",
          watchTarget: "the listed price of the product",
        },
        {
          label: "Star rating",
          watchTarget: "the aggregate star rating shown on the page",
        },
      ],
    });
  }
  // describe-change asks for "description" + "classification" + "emoji".
  // Echo the "previous → new" pattern in a tiny way so tests can assert on it.
  const priceChange = /Price: \$(\d+)/g;
  const prices: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = priceChange.exec(prompt)) !== null) {
    prices.push(match[1]);
  }
  if (prices.length >= 2 && prices[0] !== prices[1]) {
    return JSON.stringify({
      description: `Price changed from $${prices[0]} to $${prices[1]}.`,
      classification: "major",
      emoji: "💰",
    });
  }
  return JSON.stringify({
    description: "Page content changed.",
    classification: "minor",
    emoji: "📝",
  });
}
