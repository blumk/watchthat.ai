import { hashString } from "@/lib/hash";

describe("hashString", () => {
  it("returns an 8-character hex string", () => {
    expect(hashString("hello")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashString("hello world")).toBe(hashString("hello world"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashString("page content v1")).not.toBe(hashString("page content v2"));
  });

  it("handles empty string", () => {
    expect(hashString("")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("produces different hashes for similar inputs", () => {
    expect(hashString("price: $99")).not.toBe(hashString("price: $100"));
  });
});
