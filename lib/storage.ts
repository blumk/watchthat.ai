const STORAGE_KEY = "watchdog-sites-v1";

export interface WatchedSite {
  id: string;
  url: string;
  label: string;
  lastChecked: number | null;
  lastHash: string | null;
  lastContent: string | null;  // markdown
  lastHtml: string | null;
  lastRawHtml: string | null;
  lastScreenshot: string | null; // URL or public path
  watchTarget: string | null;       // e.g. "the Pro plan monthly price"
  lastExtractedValue: string | null; // e.g. "$99/month"
  lastExtractedHash: string | null;
  changeDescription: string | null; // Claude-generated sentence describing the change
  changed: boolean;
  error: string | null;
}

export function getSites(): WatchedSite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchedSite[]) : [];
  } catch {
    return [];
  }
}

export function saveSites(sites: WatchedSite[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
}

export function addSite(rawUrl: string): WatchedSite {
  const url = rawUrl.match(/^https?:\/\//) ? rawUrl : `https://${rawUrl}`;
  const label = new URL(url).hostname;
  const id =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const site: WatchedSite = {
    id,
    url,
    label,
    lastChecked: null,
    lastHash: null,
    lastContent: null,
    lastHtml: null,
    lastRawHtml: null,
    lastScreenshot: null,
    watchTarget: null,
    lastExtractedValue: null,
    lastExtractedHash: null,
    changeDescription: null,
    changed: false,
    error: null,
  };
  saveSites([...getSites(), site]);
  return site;
}

export function updateSite(id: string, patch: Partial<WatchedSite>): void {
  const sites = getSites().map((s) => (s.id === id ? { ...s, ...patch } : s));
  saveSites(sites);
}

export function removeSite(id: string): void {
  saveSites(getSites().filter((s) => s.id !== id));
}
