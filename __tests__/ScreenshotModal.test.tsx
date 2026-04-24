import { render, screen, fireEvent } from "@testing-library/react";
import ScreenshotModal from "@/components/ScreenshotModal";
import type { ChangeEntry } from "@/lib/db";

const entries: ChangeEntry[] = [
  {
    id: "e1",
    timestamp: Date.now() - 10_000,
    description: "Latest change: price rose.",
    classification: "major",
    screenshot: "https://example.test/one.png",
  },
  {
    id: "e2",
    timestamp: Date.now() - 60_000,
    description: "Middle entry",
    classification: "minor",
    screenshot: "https://example.test/two.png",
  },
  {
    id: "e3",
    timestamp: Date.now() - 120_000,
    description: "Initial snapshot taken.",
    classification: "quiet",
    screenshot: "https://example.test/three.png",
  },
];

describe("ScreenshotModal", () => {
  it("renders the selected entry's screenshot and shows all entries in the rail", () => {
    render(
      <ScreenshotModal entries={entries} initialIndex={1} onClose={jest.fn()} />,
    );
    // Image reflects the initialIndex entry.
    const img = screen.getByRole("img", { name: /middle entry/i }) as HTMLImageElement;
    expect(img.src).toBe("https://example.test/two.png");
    // Rail lists every entry's description.
    expect(screen.getByText("Latest change: price rose.")).toBeInTheDocument();
    expect(screen.getByText("Middle entry")).toBeInTheDocument();
    expect(screen.getByText("Initial snapshot taken.")).toBeInTheDocument();
    // Counter reflects position.
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("steps forward/back through entries with ArrowDown/ArrowUp", () => {
    render(
      <ScreenshotModal entries={entries} initialIndex={0} onClose={jest.fn()} />,
    );
    expect((screen.getByAltText(/latest change/i) as HTMLImageElement).src).toBe(
      "https://example.test/one.png",
    );

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect((screen.getByAltText(/middle entry/i) as HTMLImageElement).src).toBe(
      "https://example.test/two.png",
    );

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect((screen.getByAltText(/initial snapshot/i) as HTMLImageElement).src).toBe(
      "https://example.test/three.png",
    );

    // Past the last — clamps, no crash.
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect((screen.getByAltText(/initial snapshot/i) as HTMLImageElement).src).toBe(
      "https://example.test/three.png",
    );

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect((screen.getByAltText(/middle entry/i) as HTMLImageElement).src).toBe(
      "https://example.test/two.png",
    );
  });

  it("Escape closes the modal", () => {
    const onClose = jest.fn();
    render(<ScreenshotModal entries={entries} initialIndex={0} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking a rail entry jumps to that screenshot", () => {
    render(<ScreenshotModal entries={entries} initialIndex={0} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText("Initial snapshot taken."));
    expect((screen.getByAltText(/initial snapshot/i) as HTMLImageElement).src).toBe(
      "https://example.test/three.png",
    );
  });
});
