import { parseJsonResponse } from "@/lib/parse-json-response";

describe("parseJsonResponse", () => {
  it("parses a plain JSON object", () => {
    expect(parseJsonResponse('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("strips ```json … ``` fences", () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips ``` … ``` fences without the json hint", () => {
    expect(parseJsonResponse('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignores prose AFTER the closing brace (real Claude misbehavior)", () => {
    const raw =
      '{"description":"Ratings rose.","classification":"minor","emoji":"📈"} ``` **Note:** the visible page shows the same value.';
    expect(parseJsonResponse(raw)).toEqual({
      description: "Ratings rose.",
      classification: "minor",
      emoji: "📈",
    });
  });

  it("ignores prose BEFORE the opening brace", () => {
    const raw = 'Here you go:\n\n{"description":"x"}';
    expect(parseJsonResponse(raw)).toEqual({ description: "x" });
  });

  it("returns null when there's no JSON object at all", () => {
    expect(parseJsonResponse("Sorry, I can't do that.")).toBeNull();
    expect(parseJsonResponse("")).toBeNull();
  });

  it("returns null when the JSON inside the braces is malformed", () => {
    expect(parseJsonResponse("{not json}")).toBeNull();
    expect(parseJsonResponse('{"unterminated":')).toBeNull();
  });

  it("handles nested objects (uses LAST closing brace)", () => {
    const raw = '{"a":{"b":1,"c":2}}';
    expect(parseJsonResponse(raw)).toEqual({ a: { b: 1, c: 2 } });
  });
});
