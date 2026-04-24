import { render, screen, fireEvent, within } from "@testing-library/react";
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
    // Rail lists every entry (scoped to the rail).
    const rail = screen.getByRole("complementary", { name: /change history/i });
    expect(within(rail).getByText("Latest change: price rose.")).toBeInTheDocument();
    expect(within(rail).getByText("Middle entry")).toBeInTheDocument();
    expect(within(rail).getByText("Initial snapshot taken.")).toBeInTheDocument();
    // Counter reflects position.
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("preloads every entry screenshot in a hidden layer for flicker-free nav", () => {
    render(<ScreenshotModal entries={entries} initialIndex={0} onClose={jest.fn()} />);
    const all = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
    const srcs = all.map((el) => el.src);
    // Every entry's screenshot appears somewhere in the DOM (main panel or
    // hidden preload block) so the browser fetches it up front.
    expect(srcs).toEqual(
      expect.arrayContaining([
        "https://example.test/one.png",
        "https://example.test/two.png",
        "https://example.test/three.png",
      ]),
    );
  });

  it("hovering a rail entry previews that screenshot without pinning it", () => {
    render(<ScreenshotModal entries={entries} initialIndex={0} onClose={jest.fn()} />);
    const rail = screen.getByRole("complementary", { name: /change history/i });
    // Hover the third entry.
    fireEvent.mouseEnter(within(rail).getByText("Initial snapshot taken."));
    expect((screen.getByAltText(/initial snapshot/i) as HTMLImageElement).src).toBe(
      "https://example.test/three.png",
    );
    // Pinned index (ArrowDown reference) is still 0 → arrow should go to 1.
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect((screen.getByAltText(/middle entry/i) as HTMLImageElement).src).toBe(
      "https://example.test/two.png",
    );
  });

  it("clicking the Close button calls onClose", () => {
    const onClose = jest.fn();
    render(<ScreenshotModal entries={entries} initialIndex={0} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
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
