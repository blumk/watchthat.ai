import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WatchedSites from "@/components/WatchedSites";
import type { WatchedSite } from "@/lib/db";

// Stub lib/db so component-level fire-and-forget writes don't try to reach
// Supabase. The component also calls onUpdate/onRemove props, which is what
// these tests actually assert against.
jest.mock("@/lib/db", () => ({
  updateSite: jest.fn().mockResolvedValue(undefined),
  removeSite: jest.fn().mockResolvedValue(undefined),
  hideHistoryEntry: jest.fn().mockResolvedValue(undefined),
}));


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

  it("calls onRemove when Remove button is clicked after expanding and opening edit", () => {
    const history = [{ id: "h1", timestamp: Date.now() - 5000, description: "Initial snapshot taken.", classification: "quiet" as const }];
    const onRemove = jest.fn();
    render(<WatchedSites sites={[makeSite({ history })]} onUpdate={jest.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByText("example.com")); // expand card
    fireEvent.click(screen.getByRole("button", { name: /edit/i })); // open edit
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith("abc123");
  });

  it("shows screenshot thumbnail when lastScreenshot is present", () => {
    render(
      <WatchedSites
        sites={[makeSite({ lastScreenshot: "data:image/png;base64,abc" })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    expect(screen.getByRole("img", { name: /screenshot of example\.com/i })).toBeInTheDocument();
  });

  it("screenshot area does not open modal when card is collapsed", () => {
    render(
      <WatchedSites
        sites={[makeSite({ lastScreenshot: "data:image/png;base64,abc" })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />
    );
    // Click the screenshot area while collapsed — should expand, not open modal
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    // Modal would render a fixed overlay; it should not be present
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("renders all history entries in the scrollable list", () => {
    const history = [
      { id: "h1", timestamp: Date.now() - 120000, description: "First change.", classification: "minor" as const },
      { id: "h2", timestamp: Date.now() - 60000, description: "Second change.", classification: "major" as const },
    ];
    render(
      <WatchedSites sites={[makeSite({ history })]} onUpdate={jest.fn()} onRemove={jest.fn()} />
    );
    fireEvent.click(screen.getByText("example.com")); // expand card
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
    fireEvent.click(screen.getByText("example.com")); // expand card
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
    fireEvent.click(screen.getByText("example.com")); // expand card
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
      text: async () =>
        JSON.stringify({
          snapshot: {
            id: "snap-1",
            page_id: "p1",
            fetched_at: new Date().toISOString(),
            content_hash: "abc123",
            markdown: "new content",
            screenshot_path: null,
            screenshot_url: null,
            prev_snapshot_id: null,
            change_description: null,
            change_classification: "quiet",
            change_emoji: null,
          },
          cached: false,
          newChange: false,
        }),
    });
    const onUpdate = jest.fn();
    render(<WatchedSites sites={[makeSite()]} onUpdate={onUpdate} onRemove={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /fetch/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith("/api/scrape", expect.objectContaining({ method: "POST" }));
    const patch = onUpdate.mock.calls[0][1];
    expect(patch.lastContent).toBe("new content");
    expect(patch.lastHash).toBe("abc123");
    expect(patch.changed).toBe(false);
  });

  it("logs an 'Initial snapshot taken.' quiet entry on the first fetch", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          snapshot: {
            id: "snap-init",
            page_id: "p1",
            fetched_at: new Date().toISOString(),
            content_hash: "abc123",
            markdown: "initial content",
            screenshot_path: "s/1.png",
            screenshot_url: "https://storage.example/s/1.png",
            prev_snapshot_id: null,
            change_description: null,
            change_classification: "quiet",
            change_emoji: null,
          },
          cached: false,
          newChange: false,
        }),
    });
    const onUpdate = jest.fn();
    render(
      <WatchedSites
        sites={[makeSite({ lastHash: null, lastContent: null })]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    // Component auto-fetches when lastHash === null; no click needed.
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const patch = onUpdate.mock.calls[0][1];
    expect(patch.history).toHaveLength(1);
    expect(patch.history[0]).toMatchObject({
      description: "Initial snapshot taken.",
      classification: "quiet",
      screenshot: "https://storage.example/s/1.png",
    });
  });

  it("appends a change-history entry when the server reports a new change", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          snapshot: {
            id: "snap-2",
            page_id: "p1",
            fetched_at: new Date().toISOString(),
            content_hash: "def456",
            markdown: "updated content",
            screenshot_path: null,
            screenshot_url: null,
            prev_snapshot_id: "snap-1",
            change_description: "Price dropped from $99 to $79.",
            change_classification: "major",
            change_emoji: "💰",
          },
          cached: false,
          newChange: true,
        }),
    });
    const onUpdate = jest.fn();
    render(
      <WatchedSites
        sites={[makeSite({ lastHash: "abc", lastContent: "old" })]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /fetch/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const patch = onUpdate.mock.calls[0][1];
    expect(patch.changed).toBe(true);
    expect(patch.changeDescription).toBe("Price dropped from $99 to $79.");
    expect(patch.history).toHaveLength(1);
    expect(patch.history[0].classification).toBe("major");
    expect(patch.history[0].description).toBe("Price dropped from $99 to $79.");
  });

  it("dismisses a history entry when the × button is clicked", () => {
    const onUpdate = jest.fn();
    const history = [
      {
        id: "a1b2c3d4-1111-2222-3333-444455556666",
        timestamp: Date.now() - 60_000,
        description: "Major change",
        classification: "major" as const,
      },
      {
        id: "a1b2c3d4-aaaa-bbbb-cccc-ddddeeeeffff",
        timestamp: Date.now() - 30_000,
        description: "Minor change",
        classification: "minor" as const,
      },
    ];
    render(
      <WatchedSites
        sites={[makeSite({ history })]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    // Two × buttons — one per entry. Click the first one (newest, listed
    // first because history is reversed in render).
    const dismissButtons = screen.getAllByRole("button", { name: /dismiss entry/i });
    expect(dismissButtons).toHaveLength(2);
    fireEvent.click(dismissButtons[0]);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [siteId, patch] = onUpdate.mock.calls[0];
    expect(siteId).toBe("abc123");
    // The newest entry (id ending in eeffff) was dismissed; the other survives.
    expect(patch.history).toHaveLength(1);
    expect(patch.history[0].id).toBe("a1b2c3d4-1111-2222-3333-444455556666");
  });

  it("dismisses an entry via touch swipe past the threshold", async () => {
    const onUpdate = jest.fn();
    const entryId = "a1b2c3d4-1111-2222-3333-444455556666";
    render(
      <WatchedSites
        sites={[
          makeSite({
            history: [
              {
                id: entryId,
                timestamp: Date.now() - 60_000,
                description: "Major change",
                classification: "major" as const,
              },
            ],
          }),
        ]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    const row = screen.getByText("Major change").closest("div[onTouchStart], .group\\/entry") as HTMLElement
      ?? screen.getByText("Major change").parentElement!.parentElement!.parentElement!;
    // Swipe left past the 80px dismiss threshold.
    fireEvent.touchStart(row, { touches: [{ clientX: 200, clientY: 0 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 80, clientY: 0 }] });
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 80, clientY: 0 }] });
    // Dismiss runs after the 200ms fling-out timer. waitFor wraps the
    // poll in act() so the trailing setSwipe(null) state update doesn't
    // print an "update not wrapped in act" warning.
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0][1].history).toEqual([]);
  });

  it("swipe under the threshold snaps back without dismissing", () => {
    const onUpdate = jest.fn();
    render(
      <WatchedSites
        sites={[
          makeSite({
            history: [
              {
                id: "a1b2c3d4-1111-2222-3333-444455556666",
                timestamp: Date.now() - 60_000,
                description: "Major change",
                classification: "major" as const,
              },
            ],
          }),
        ]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    const row = screen.getByText("Major change").parentElement!.parentElement!.parentElement!;
    // Swipe just 20px — under the 80px threshold.
    fireEvent.touchStart(row, { touches: [{ clientX: 100, clientY: 0 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 80, clientY: 0 }] });
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 80, clientY: 0 }] });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("persists target notes on blur via onUpdate", () => {
    const onUpdate = jest.fn();
    render(
      <WatchedSites
        sites={[makeSite({ targetNotes: null })]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const notes = screen.getByLabelText("Refinement notes for the AI");
    fireEvent.change(notes, {
      target: { value: "Look for $ value under '### General Admission'." },
    });
    fireEvent.blur(notes);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][1]).toEqual({
      targetNotes: "Look for $ value under '### General Admission'.",
    });
  });

  it("no-ops the notes textarea blur when nothing changed", () => {
    const onUpdate = jest.fn();
    render(
      <WatchedSites
        sites={[makeSite({ targetNotes: "Existing notes" })]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const notes = screen.getByLabelText("Refinement notes for the AI");
    expect((notes as HTMLTextAreaElement).value).toBe("Existing notes");
    fireEvent.blur(notes);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("shows the refresh cadence line on a collapsed card when refreshInterval is set", () => {
    // 5h + 60s buffer — without the buffer, ms drift between setup and
    // render can roll Math.floor(sec/3600) down to "in 4h" on slow CI.
    const futureMs = Date.now() + 5 * 3600 * 1000 + 60_000;
    render(
      <WatchedSites
        sites={[makeSite({ refreshInterval: 86400, nextDueAt: futureMs })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />,
    );
    const badge = screen.getByLabelText("Refresh cadence");
    expect(badge).toHaveTextContent(/Every 24h/);
    expect(badge).toHaveTextContent(/next in 5h/);
  });

  it("highlights the currently-selected interval chip in edit mode", () => {
    render(
      <WatchedSites
        sites={[makeSite({ refreshInterval: 21600, nextDueAt: Date.now() + 1000 })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const six = screen.getByRole("radio", { name: "6h" });
    expect(six).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "1h" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "24h" })).toHaveAttribute("aria-checked", "false");
  });

  it("clicking an interval chip patches refreshInterval + nextDueAt via onUpdate", () => {
    const onUpdate = jest.fn();
    const lastChecked = Date.now() - 60_000;
    render(
      <WatchedSites
        sites={[makeSite({ refreshInterval: 86400, lastChecked, nextDueAt: lastChecked + 86400_000 })]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("radio", { name: "1h" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [id, patch] = onUpdate.mock.calls[0];
    expect(id).toBe("abc123");
    expect(patch.refreshInterval).toBe(3600);
    // nextDueAt = lastChecked + 1h
    expect(patch.nextDueAt).toBe(lastChecked + 3600 * 1000);
  });

  it("no-ops when clicking the already-selected interval chip", () => {
    const onUpdate = jest.fn();
    render(
      <WatchedSites
        sites={[makeSite({ refreshInterval: 3600 })]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("radio", { name: "1h" }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("copies a /p/<pageId> share URL to the clipboard when the Share button is clicked", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    // jsdom's location.origin is "http://localhost" by default — fine for the assert.
    render(
      <WatchedSites
        sites={[makeSite({ pageId: "page-xyz" })]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy share link/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("http://localhost/p/page-xyz"),
    );
    expect(await screen.findByText(/Copied/)).toBeInTheDocument();
  });

  it("renders a tracked-value badge when trackedFact is present", () => {
    render(
      <WatchedSites
        sites={[
          makeSite({
            trackedFact: {
              key: "MobileApplication.aggregateRating.ratingValue",
              value: "4.5",
              displayName: "Rating",
            },
          }),
        ]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />,
    );
    const badge = screen.getByLabelText("Tracking Rating");
    expect(badge).toHaveTextContent("Rating");
    expect(badge).toHaveTextContent("4.5");
  });

  it("prefixes history entries whose snapshot moved the tracked value", () => {
    render(
      <WatchedSites
        sites={[
          makeSite({
            history: [
              {
                id: "h1",
                timestamp: Date.now() - 10_000,
                description: "Rating dropped.",
                classification: "major",
                trackedDelta: {
                  displayName: "Rating",
                  before: "4.5",
                  after: "4.4",
                },
              },
            ],
          }),
        ]}
        onUpdate={jest.fn()}
        onRemove={jest.fn()}
      />,
    );
    // History entries only render when the card is expanded.
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    expect(screen.getByText(/Rating\s+4\.5 → 4\.4/)).toBeInTheDocument();
  });

  it("shows an ephemeral 'No change detected.' row after a refresh with no hash change", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          snapshot: {
            id: "snap-same",
            page_id: "p1",
            fetched_at: new Date().toISOString(),
            content_hash: "deadbeef",
            markdown: null,
            screenshot_path: null,
            screenshot_url: null,
            prev_snapshot_id: null,
            change_description: null,
            change_classification: "quiet",
            change_emoji: null,
          },
          cached: false,
          newChange: false,
        }),
    });
    const onUpdate = jest.fn();
    const initialHistory = [
      {
        id: "h0",
        timestamp: Date.now() - 60000,
        description: "Initial snapshot taken.",
        classification: "quiet" as const,
      },
    ];
    render(
      <WatchedSites
        sites={[makeSite({ history: initialHistory })]}
        onUpdate={onUpdate}
        onRemove={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /fetch/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    // No-change refresh must not add a history entry to the persisted patch.
    const patch = onUpdate.mock.calls[0][1];
    expect(patch.history).toHaveLength(1);
    expect(patch.history[0].id).toBe("h0");

    // Ephemeral row only renders in the expanded log.
    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    expect(await screen.findByText("No change detected.")).toBeInTheDocument();
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
