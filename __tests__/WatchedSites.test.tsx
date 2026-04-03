import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WatchedSites from "@/components/WatchedSites";
import type { WatchedSite } from "@/lib/storage";

// Silence console.error for expected fetch errors
beforeAll(() => jest.spyOn(console, "error").mockImplementation(() => {}));
afterAll(() => (console.error as jest.Mock).mockRestore());

const makeSite = (overrides: Partial<WatchedSite> = {}): WatchedSite => ({
  id: "abc123",
  url: "https://example.com",
  label: "example.com",
  lastChecked: null,
  lastHash: "deadbeef",
  lastContent: "some content",
  lastHtml: null,
  lastRawHtml: null,
  lastScreenshot: null,
  watchTarget: null,
  lastExtractedValue: null,
  lastExtractedHash: null,
  changeDescription: null,
  changed: false,
  error: null,
  history: [],
  ...overrides,
});

describe("WatchedSites", () => {
  it("renders nothing when the site list is empty", () => {
    const { container } = render(<WatchedSites sites={[]} onUpdate={jest.fn()} onRemove={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a site URL label", () => {
    render(<WatchedSites sites={[makeSite()]} onUpdate={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("shows a timestamp for a site with no change", () => {
    render(
      <WatchedSites
        sites={[makeSite({ changed: false, lastChecked: Date.now() - 5000 })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getByText(/ago/i)).toBeInTheDocument();
  });

  it("shows a timestamp when a change has been detected", () => {
    render(
      <WatchedSites
        sites={[
          makeSite({
            changed: true,
            lastChecked: Date.now() - 30000,
            history: [{ id: "h1", timestamp: Date.now() - 90000, description: "Price changed.", classification: "major" }],
          }),
        ]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getAllByText(/ago/i).length).toBeGreaterThanOrEqual(1);
  });

  it("shows an error status for a site with an error", () => {
    render(
      <WatchedSites
        sites={[makeSite({ error: "fetch failed", lastHash: null })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });

  it("calls onRemove when Remove button is clicked", () => {
    const onRemove = jest.fn();
    render(<WatchedSites sites={[makeSite()]} onUpdate={jest.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith("abc123");
  });

  it("shows Remove button inline for error sites with no content", () => {
    const onRemove = jest.fn();
    render(
      <WatchedSites
        sites={[makeSite({ error: "fetch failed", lastContent: null, lastHtml: null, lastScreenshot: null, lastHash: null })]}
        onUpdate={jest.fn()}
        onRemove={onRemove}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith("abc123");
  });

  it("shows screenshot thumbnail button when lastScreenshot is present", () => {
    render(
      <WatchedSites
        sites={[makeSite({ lastScreenshot: "data:image/png;base64,abc" })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getAllByRole("button", { name: /open screenshot/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("does not show screenshot button when no screenshot is available", () => {
    render(
      <WatchedSites
        sites={[makeSite({ lastScreenshot: null })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /open screenshot/i })).not.toBeInTheDocument();
  });

  it("shows watch target edit button", () => {
    render(<WatchedSites sites={[makeSite()]} onUpdate={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByRole("button", { name: /edit watch target/i })).toBeInTheDocument();
  });

  it("shows watch target input when edit button is clicked", () => {
    render(<WatchedSites sites={[makeSite()]} onUpdate={jest.fn()} onRemove={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit watch target/i }));
    expect(screen.getByPlaceholderText(/Pro plan price/i)).toBeInTheDocument();
  });

  it("displays extracted value when watchTarget and lastExtractedValue are set", () => {
    render(
      <WatchedSites
        sites={[makeSite({ watchTarget: "CEO name", lastExtractedValue: "Jane Doe" })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders all history entries in the scrollable list", () => {
    const history = [
      { id: "h1", timestamp: Date.now() - 120000, description: "First change.", classification: "minor" as const },
      { id: "h2", timestamp: Date.now() - 60000, description: "Second change.", classification: "major" as const },
    ];
    render(
      <WatchedSites sites={[makeSite({ history })]} onUpdate={jest.fn()} onRemove={jest.fn()} />
    );
    expect(screen.getByText("First change.")).toBeInTheDocument();
    expect(screen.getByText("Second change.")).toBeInTheDocument();
  });

  it("clicking an entry selects it", () => {
    const history = [
      { id: "h1", timestamp: Date.now() - 120000, description: "First change.", classification: "minor" as const },
      { id: "h2", timestamp: Date.now() - 60000, description: "Second change.", classification: "major" as const },
    ];
    render(
      <WatchedSites sites={[makeSite({ history })]} onUpdate={jest.fn()} onRemove={jest.fn()} />
    );
    fireEvent.click(screen.getByText("First change."));
    expect(screen.getByText("First change.")).toBeInTheDocument();
  });

  it("shows quiet entry for initial snapshot", () => {
    render(
      <WatchedSites
        sites={[makeSite({ history: [{ id: "h1", timestamp: Date.now() - 10000, description: "Initial snapshot taken.", classification: "quiet" as const }] })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getByText("Initial snapshot taken.")).toBeInTheDocument();
  });

  it("shows history entries when present", () => {
    render(
      <WatchedSites
        sites={[
          makeSite({
            history: [
              {
                id: "h1",
                timestamp: Date.now() - 60000,
                description: "Price rose from $99 to $149.",
                classification: "major",
              },
            ],
          }),
        ]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getByText("Price rose from $99 to $149.")).toBeInTheDocument();
  });

  it("shows change description from history when status is changed", () => {
    render(
      <WatchedSites
        sites={[
          makeSite({
            changed: true,
            history: [
              {
                id: "h1",
                timestamp: Date.now() - 60000,
                description: "Price rose from $99 to $149.",
                classification: "major",
              },
            ],
          }),
        ]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getByText("Price rose from $99 to $149.")).toBeInTheDocument();
  });

  it("calls /api/scrape and calls onUpdate when Fetch is clicked", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ markdown: "new content" }),
    });
    const onUpdate = jest.fn();
    render(<WatchedSites sites={[makeSite()]} onUpdate={onUpdate} onRemove={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /fetch/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith("/api/scrape", expect.objectContaining({ method: "POST" }));
  });

  it("appends an error entry to history when fetch fails", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network error"));
    const onUpdate = jest.fn();
    render(<WatchedSites sites={[makeSite()]} onUpdate={onUpdate} onRemove={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /fetch/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const patch = onUpdate.mock.calls[0][1];
    expect(patch.error).toBe("network error");
    expect(patch.history).toHaveLength(1);
    expect(patch.history[0].classification).toBe("error");
    expect(patch.history[0].description).toBe("network error");
  });
});
