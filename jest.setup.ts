import "@testing-library/jest-dom";

// fake-indexeddb v6 requires structuredClone; jsdom doesn't expose Node's built-in
if (typeof globalThis.structuredClone === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).structuredClone = <T>(val: T): T => JSON.parse(JSON.stringify(val));
}

import "fake-indexeddb/auto";
