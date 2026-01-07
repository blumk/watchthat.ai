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
  changed: false,
  error: null,
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

  it("shows 'All quiet' for a site with no change", () => {
    render(<WatchedSites sites={[makeSite({ changed: false })]} onUpdate={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByText(/all quiet/i)).toBeInTheDocument();
  });

  it("shows 'Changed' for a site with a change", () => {
    render(<WatchedSites sites={[makeSite({ changed: true })]} onUpdate={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByText(/changed/i)).toBeInTheDocument();
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

  it("does not show Preview button when lastContent is null", () => {
    render(<WatchedSites sites={[makeSite({ lastContent: null })]} onUpdate={jest.fn()} onRemove={jest.fn()} />);
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
