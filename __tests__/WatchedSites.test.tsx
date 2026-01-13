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
    // timestamp from history entry + refresh line, both show "ago"
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

  it("calls onRemove when × button is clicked", () => {
    const onRemove = jest.fn();
    render(<WatchedSites sites={[makeSite()]} onUpdate={jest.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith("abc123");
  });

  it("shows Preview button when lastContent is present", () => {
    render(<WatchedSites sites={[makeSite()]} onUpdate={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByRole("button", { name: /show preview/i })).toBeInTheDocument();
  });

  it("does not show Preview button when no content is available", () => {
    render(
      <WatchedSites
        sites={[makeSite({ lastContent: null, lastHtml: null, lastScreenshot: null })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
  });

  it("toggles content preview on Preview/Hide click", () => {
    render(<WatchedSites sites={[makeSite({ lastContent: "page text here" })]} onUpdate={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.queryByText("page text here")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show preview/i }));
    expect(screen.getByText("page text here")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide preview/i }));
    expect(screen.queryByText("page text here")).not.toBeInTheDocument();
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

  it("hides was/now values by default, shows them after toggling diff", () => {
    const entry = {
      id: "h1",
      timestamp: Date.now() - 60000,
      description: "Price rose from $99 to $149.",
      classification: "major" as const,
      oldValue: "$99",
      newValue: "$149",
    };
    render(
      <WatchedSites
        sites={[makeSite({ history: [entry] })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.queryByText("$99")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show diff/i }));
    expect(screen.getByText("$99")).toBeInTheDocument();
    expect(screen.getByText("$149")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide diff/i }));
    expect(screen.queryByText("$99")).not.toBeInTheDocument();
  });

  it("renders all history entries in the scrollable list", () => {
    const history = [
      { id: "h1", timestamp: Date.now() - 120000, description: "First change.", classification: "minor" as const },
      { id: "h2", timestamp: Date.now() - 60000, description: "Second change.", classification: "major" as const },
    ];
    render(
      <WatchedSites sites={[makeSite({ history })]} onUpdate={jest.fn()} onRemove={jest.fn()} />
    );
    // Both entries visible simultaneously in the scrollable list
    expect(screen.getByText("First change.")).toBeInTheDocument();
    expect(screen.getByText("Second change.")).toBeInTheDocument();
  });

  it("clicking an entry selects it and shows diff toggle", () => {
    const history = [
      { id: "h1", timestamp: Date.now() - 120000, description: "First change.", classification: "minor" as const, oldValue: "$99", newValue: "$149" },
      { id: "h2", timestamp: Date.now() - 60000, description: "Second change.", classification: "major" as const },
    ];
    render(
      <WatchedSites sites={[makeSite({ history })]} onUpdate={jest.fn()} onRemove={jest.fn()} />
    );
    // Newest is selected by default (no diff button on first change row since h2 has no values)
    // Click the older entry to select it
    fireEvent.click(screen.getByText("First change."));
    // Diff toggle now visible on that row
    expect(screen.getByRole("button", { name: /show diff/i })).toBeInTheDocument();
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
      json: async () => ({ markdown: "new content" }),
    });
    const onUpdate = jest.fn();
    render(<WatchedSites sites={[makeSite()]} onUpdate={onUpdate} onRemove={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /fetch/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith("/api/scrape", expect.objectContaining({ method: "POST" }));
  });
});
