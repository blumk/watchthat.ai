import { act, render, screen } from "@testing-library/react";
import { useVisibilityTick } from "@/lib/use-visibility-tick";

function Probe() {
  const tick = useVisibilityTick();
  return <span data-testid="tick">{tick}</span>;
}

describe("useVisibilityTick", () => {
  it("re-renders when the tab fires visibilitychange while visible", () => {
    render(<Probe />);
    expect(screen.getByTestId("tick").textContent).toBe("0");
    // jsdom defaults visibilityState to "visible"; dispatching the event
    // should bump the counter.
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("tick").textContent).toBe("1");
  });

  it("re-renders when the window fires focus", () => {
    render(<Probe />);
    expect(screen.getByTestId("tick").textContent).toBe("0");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByTestId("tick").textContent).toBe("1");
  });

  it("ignores visibilitychange when the tab is hidden", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    try {
      render(<Probe />);
      expect(screen.getByTestId("tick").textContent).toBe("0");
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(screen.getByTestId("tick").textContent).toBe("0");
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, "visibilityState", originalDescriptor);
      } else {
        // jsdom owns the prop on Document.prototype — leaving our override in
        // place wouldn't leak to other test files since each test file gets a
        // fresh jsdom, but reset for safety.
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
      }
    }
  });
});
