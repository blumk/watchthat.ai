"use client";

import { useState, useEffect, useRef } from "react";
import { updateSite, removeSite } from "@/lib/db";
import type { WatchedSite, ChangeEntry } from "@/lib/db";
import type { ScrapeResponse } from "@/lib/snapshot";
import ScreenshotModal from "./ScreenshotModal";

function makeEntry(
  description: string,
  classification: "major" | "minor" | "quiet" | "error",
  oldValue?: string,
  newValue?: string,
  screenshot?: string | null,
  emoji?: string
): ChangeEntry {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    description,
    classification,
    ...(emoji ? { emoji } : {}),
    ...(oldValue !== undefined ? { oldValue } : {}),
    ...(newValue !== undefined ? { newValue } : {}),
    ...(screenshot !== undefined ? { screenshot } : {}),
  };
}

type SiteStatus = "sniffing" | "quiet" | "changed" | "error";

function Thumbnail({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Reset when src changes — but if the browser already has the image in
  // cache, the <img> is ready immediately and onLoad won't fire again, so
  // check `complete` synchronously after the ref commits.
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) {
      setLoaded(true);
    } else {
      setLoaded(false);
    }
  }, [src]);

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--bdr)] border-t-[var(--blue)] rounded-full animate-spin" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

function deriveStatus(site: WatchedSite, sniffing: boolean): SiteStatus {
  if (sniffing) return "sniffing";
  if (site.error) return "error";
  if (site.changed) return "changed";
  return "quiet";
}

const SNIFF_LABELS = [
  "Sniffing…",
  "Fetching…",
  "Parsing HTML…",
  "Rendering JS…",
  "Crawling page…",
  "Reading DOM…",
  "Scanning text…",
  "Hashing bytes…",
  "Crunching markup…",
  "Inspecting…",
];

function timeAgo(ts: number | null): string {
  if (ts === null) return "never";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

interface Props {
  sites: WatchedSite[];
  onUpdate: (id: string, patch: Partial<WatchedSite>) => void;
  onRemove: (id: string) => void;
}

export default function WatchedSites({ sites, onUpdate, onRemove }: Props) {
  const [sniffing, setSniffing] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<Record<string, number>>({});
  const [hoveredEntry, setHoveredEntry] = useState<Record<string, number>>({});
  const [modalScreenshot, setModalScreenshot] = useState<string | null>(null);
  const [sniffPhase, setSniffPhase] = useState(0);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const autoFetched = useRef<Set<string>>(new Set());

  // Cycle sniff label while any fetch is in progress
  useEffect(() => {
    if (sniffing.size === 0) return;
    const id = setInterval(() => setSniffPhase((p) => p + 1), 1500);
    return () => clearInterval(id);
  }, [sniffing.size]);

  // Auto-fetch any site that has never been checked
  useEffect(() => {
    sites.forEach((site) => {
      if (
        site.lastHash === null &&
        !site.error &&
        !autoFetched.current.has(site.id)
      ) {
        autoFetched.current.add(site.id);
        fetchSite(site);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites]);

  if (sites.length === 0) return null;

  async function fetchSite(site: WatchedSite) {
    if (sniffing.has(site.id)) return;
    setSniffing((prev) => new Set(prev).add(site.id));
    try {
      const scrapeRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: site.url }),
      });
      const scrapeText = await scrapeRes.text();
      let scrapeBody: Record<string, unknown>;
      try {
        scrapeBody = JSON.parse(scrapeText);
      } catch {
        if (scrapeRes.status === 504 || scrapeText.includes("FUNCTION_INVOCATION_TIMEOUT")) {
          throw new Error("timed out — page took too long to scrape (Vercel 10s limit on free tier)");
        }
        if (scrapeRes.status === 502 || scrapeText.includes("FUNCTION_INVOCATION_FAILED")) {
          throw new Error("function crashed (Vercel)");
        }
        throw new Error(`HTTP ${scrapeRes.status}`);
      }
      if (!scrapeRes.ok) {
        throw new Error((scrapeBody.error as string | undefined) ?? `HTTP ${scrapeRes.status}`);
      }
      const { snapshot } = scrapeBody as unknown as ScrapeResponse;

      // snapshot.markdown is NULL on hash-equal re-inserts. Fall back to the
      // markdown we already have in state for this site — same content_hash
      // guarantees the text matches.
      const resolvedMarkdown = snapshot.markdown ?? site.lastContent ?? null;
      const titleMatch = resolvedMarkdown?.match(/^#\s+(.+)$/m) ?? null;
      const pageTitle = titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : null;

      const classification = snapshot.change_classification;
      const hashChanged = snapshot.content_hash !== site.lastHash;
      const cleanHistory = (site.history ?? []).filter((e) => e.classification !== "error");
      const patch: Partial<WatchedSite> = {
        lastContent: resolvedMarkdown,
        lastScreenshot: snapshot.screenshot_url,
        lastHash: snapshot.content_hash,
        lastChecked: Date.now(),
        changeDescription: snapshot.change_description,
        changed: classification !== null && classification !== "quiet",
        error: null,
        history: cleanHistory,
        ...(pageTitle ? { label: pageTitle } : {}),
      };

      if (
        hashChanged &&
        snapshot.change_description &&
        (classification === "major" || classification === "minor")
      ) {
        patch.history = [
          ...cleanHistory,
          makeEntry(
            snapshot.change_description,
            classification,
            site.lastContent ?? undefined,
            resolvedMarkdown ?? undefined,
            snapshot.screenshot_url,
            snapshot.change_emoji ?? undefined,
          ),
        ];
      } else if (site.lastHash === null && cleanHistory.length === 0) {
        // First-ever fetch: anchor the log with an "Initial snapshot taken."
        // quiet entry so the original screenshot stays accessible after
        // subsequent changes (otherwise history would only show post-change
        // screenshots and the "before" state would be lost).
        patch.history = [
          makeEntry(
            "Initial snapshot taken.",
            "quiet",
            undefined,
            resolvedMarkdown ?? undefined,
            snapshot.screenshot_url,
          ),
        ];
      }

      onUpdate(site.id, patch);
    } catch (err) {
      const error = err instanceof Error ? err.message : "fetch failed";
      const patch: Partial<WatchedSite> = {
        error,
        lastChecked: Date.now(),
        history: [...(site.history ?? []), makeEntry(error, "error")],
      };
      onUpdate(site.id, patch);
    } finally {
      setSniffing((prev) => {
        const next = new Set(prev);
        next.delete(site.id);
        return next;
      });
    }
  }

  function handleRemove(id: string) {
    void removeSite(id);
    onRemove(id);
  }

  async function downloadSiteHistory(site: WatchedSite) {
    setDownloading(site.id);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      function tsPrefix(ms: number) {
        return new Date(ms).toISOString().replace("T", "_").replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
      }

      // Manifest JSON (no screenshot blobs — those go in the folder)
      const manifest = {
        url: site.url,
        label: site.label,
        exportedAt: new Date().toISOString(),
        entries: site.history.map((e) => ({
          id: e.id,
          timestamp: new Date(e.timestamp).toISOString(),
          description: e.description,
          classification: e.classification,
          ...(e.emoji ? { emoji: e.emoji } : {}),
          ...(e.oldValue !== undefined ? { oldValue: e.oldValue } : {}),
          ...(e.newValue !== undefined ? { newValue: e.newValue } : {}),
          ...(e.screenshot ? { screenshot: `screenshots/${tsPrefix(e.timestamp)}_${e.id}.png` } : {}),
        })),
      };
      zip.file("history.json", JSON.stringify(manifest, null, 2));

      // Helper: resolve a screenshot value to a Uint8Array
      async function resolveImage(src: string): Promise<Uint8Array | null> {
        if (src.startsWith("data:")) {
          const base64 = src.split(",")[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        }
        try {
          const res = await fetch(src);
          if (!res.ok) return null;
          return new Uint8Array(await res.arrayBuffer());
        } catch {
          return null;
        }
      }

      // Screenshots per history entry
      const shots = zip.folder("screenshots")!;
      for (const entry of site.history) {
        if (!entry.screenshot) continue;
        const bytes = await resolveImage(entry.screenshot);
        if (bytes) shots.file(`${tsPrefix(entry.timestamp)}_${entry.id}.png`, bytes);
      }

      // Latest screenshot (may not be in history if no change was detected yet)
      if (site.lastScreenshot) {
        const bytes = await resolveImage(site.lastScreenshot);
        const prefix = site.lastChecked ? `${tsPrefix(site.lastChecked)}_` : "";
        if (bytes) zip.file(`${prefix}latest.png`, bytes);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${site.label.replace(/\s+/g, "-").toLowerCase()}-history.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  function toggleCard(id: string) {
    setExpandedCard(prev => prev === id ? null : id);
    setEditingCard(null);
  }

  function openEdit(site: WatchedSite) {
    setEditingCard(site.id);
    setEditUrl(site.url);
  }

  function handleUrlChange(site: WatchedSite) {
    const raw = editUrl.trim();
    if (!raw) return;
    const url = raw.match(/^https?:\/\//) ? raw : `https://${raw}`;
    try { new URL(url); } catch { return; } // invalid URL — ignore
    const label = new URL(url).hostname.replace(/^www\./, "");
    const patch: Partial<WatchedSite> = {
      url, label,
      lastHash: null, lastContent: null, lastChecked: null,
      changed: false, error: null, changeDescription: null,
    };
    void updateSite(site.id, patch);
    onUpdate(site.id, patch);
    setEditingCard(null);
    fetchSite({ ...site, ...patch });
  }

  return (
    <>
      {modalScreenshot && (
        <ScreenshotModal src={modalScreenshot} onClose={() => setModalScreenshot(null)} />
      )}

      <section className="max-w-[1080px] mx-auto px-6 pt-4 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {sites.map((site) => {
            const status = deriveStatus(site, sniffing.has(site.id));

            const histEntries = [...(site.history ?? [])].reverse();
            // Hover wins over click — hovering an entry previews its
            // screenshot, leaving the list reverts to the clicked one.
            const baseIdx = hoveredEntry[site.id] ?? selectedEntry[site.id] ?? 0;
            const histIdx = Math.min(baseIdx, Math.max(0, histEntries.length - 1));
            const histEntry = histEntries[histIdx] ?? null;
            // When history exists, the thumbnail reflects the selected entry
            // exactly — entries without a screenshot render as an empty panel
            // rather than borrowing site.lastScreenshot and lying about which
            // moment the image belongs to.
            const panelScreenshot =
              histEntries.length > 0 ? histEntry?.screenshot ?? null : site.lastScreenshot;
            const isExpanded = expandedCard === site.id;
            const hasExpandable = histEntries.length > 0 || !!panelScreenshot;
            const lastChange = histEntries.find(e => e.classification !== "quiet") ?? null;
            const subtitle = lastChange?.description ?? null;
            const changeTime = lastChange?.timestamp ?? null;
            return (
              <div
                key={site.id}
                onClick={() => toggleCard(site.id)}
                className="group bg-[var(--bg2)] border border-[var(--bdr)] hover:border-[var(--t3)] rounded-2xl overflow-hidden transition-colors flex flex-col cursor-pointer"
              >
                {/* Screenshot header — click opens modal only when expanded */}
                <div
                  role="button"
                  aria-label={isExpanded && panelScreenshot ? "Open screenshot" : isExpanded ? "Collapse" : "Expand"}
                  onClick={e => {
                    e.stopPropagation();
                    if (isExpanded && panelScreenshot) {
                      setModalScreenshot(panelScreenshot);
                    } else {
                      toggleCard(site.id);
                    }
                  }}
                  className={`relative w-full aspect-video overflow-hidden bg-[var(--bg3)] ${isExpanded && panelScreenshot ? "cursor-zoom-in" : "cursor-pointer"}`}
                >
                  {panelScreenshot && (
                    <Thumbnail
                      src={panelScreenshot}
                      alt={`Screenshot of ${site.label}`}
                    />
                  )}
                  {/* Sniffing indicator */}
                  {status === "sniffing" && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--blue)] animate-pulse" />
                  )}
                  {/* Last-checked timestamp pill */}
                  {status !== "sniffing" && site.lastChecked !== null && (
                    <span className="absolute bottom-2 right-2 text-[9px] font-mono bg-black/50 text-white/60 px-1.5 py-0.5 rounded-md leading-none">
                      {timeAgo(site.lastChecked)}
                    </span>
                  )}
                </div>

                {/* Card footer */}
                <div className="flex items-start gap-2 px-3 py-2.5">
                  {/* Label + subtitle */}
                  <div className="flex-1 min-w-0">
                    {isExpanded ? (
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-sm font-mono text-[var(--t1)] hover:text-[var(--blue)] truncate block leading-snug transition-colors"
                      >
                        {site.label} ↗
                      </a>
                    ) : (
                      <span className="text-sm font-mono text-[var(--t1)] truncate block leading-snug">
                        {site.label}
                      </span>
                    )}
                    {!isExpanded && subtitle && (
                      <span className="text-xs font-mono text-[var(--t3)] truncate block mt-0.5">
                        {subtitle}
                      </span>
                    )}
                  </div>

                  {/* Time + actions */}
                  <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
                    {status === "sniffing" ? (
                      <span className="text-[10px] font-mono text-[var(--t3)]">
                        {SNIFF_LABELS[sniffPhase % SNIFF_LABELS.length]}
                      </span>
                    ) : status === "error" ? (
                      <span className="text-[10px] font-mono text-[var(--t3)]">Error</span>
                    ) : changeTime && timeAgo(changeTime) !== timeAgo(site.lastChecked) ? (
                      <span className="text-[10px] font-mono text-[var(--t3)]">
                        {timeAgo(changeTime)}
                      </span>
                    ) : null}
                    <button
                      aria-label="Fetch"
                      onClick={e => { e.stopPropagation(); fetchSite(site); }}
                      disabled={sniffing.has(site.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--t3)] hover:text-[var(--t1)] text-sm leading-none cursor-pointer bg-transparent border-none disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ↻
                    </button>
                  </div>
                </div>

                {/* Expanded: history log */}
                {isExpanded && histEntries.length > 0 && (
                  <div
                    className="border-t border-[var(--bdr)] overflow-y-auto max-h-[220px]"
                    onMouseLeave={() =>
                      setHoveredEntry((p) => {
                        if (!(site.id in p)) return p;
                        const { [site.id]: _omit, ...rest } = p;
                        return rest;
                      })
                    }
                  >
                    {histEntries.map((entry, idx) => {
                      const isSelected = idx === histIdx;
                      const entryColor =
                        entry.classification === "major" ? "var(--red)"
                        : entry.classification === "quiet" ? "var(--green)"
                        : entry.classification === "error" ? "var(--red)"
                        : "var(--t3)";
                      const isQuiet = entry.classification === "quiet";
                      return (
                        <div
                          key={entry.id}
                          onMouseEnter={() => setHoveredEntry((p) => ({ ...p, [site.id]: idx }))}
                          onClick={e => { e.stopPropagation(); setSelectedEntry((p) => ({ ...p, [site.id]: idx })); }}
                          className={`px-3 py-2 cursor-pointer border-b border-[var(--bdr)] last:border-b-0 transition-colors ${
                            isSelected ? "bg-[var(--bg3)]" : "hover:bg-[var(--bg)]"
                          } ${isQuiet ? "opacity-40" : ""}`}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            {entry.emoji ? (
                              <span className="shrink-0 text-sm leading-none mt-px">{entry.emoji}</span>
                            ) : (
                              <span
                                className="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
                                style={{ background: entryColor }}
                              />
                            )}
                            <span className="text-xs text-[var(--t2)] flex-1 leading-snug">
                              {entry.description}
                            </span>
                            <div className="shrink-0 ml-1 text-right">
                              <div className="text-[10px] font-mono text-[var(--t3)]">
                                {timeAgo(entry.timestamp)}
                              </div>
                              <div className="text-[9px] font-mono text-[var(--t3)] opacity-50">
                                {new Date(entry.timestamp).toLocaleString(undefined, {
                                  month: "short", day: "numeric",
                                  hour: "2-digit", minute: "2-digit",
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Expand / collapse bar at bottom */}
                {hasExpandable && (
                  <div className="border-t border-[var(--bdr)] flex items-center justify-between px-3 py-1.5 mt-auto">
                    {!isExpanded && (
                      <span className="text-[10px] font-mono text-[var(--t3)] select-none">
                        {histEntries.length > 0 ? "See history" : "See details"}
                      </span>
                    )}
                    <span className={`text-[var(--t3)] text-xs leading-none select-none ${isExpanded ? "ml-auto" : ""}`}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                )}

                {/* Edit / remove footer — shown when expanded */}
                {isExpanded && (
                  <div
                    className="border-t border-[var(--bdr)] px-3 py-2"
                    onClick={e => e.stopPropagation()}
                  >
                    {editingCard === site.id ? (
                      <>
                        <div className="flex gap-2 mb-2">
                          <input
                            value={editUrl}
                            onChange={e => setEditUrl(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleUrlChange(site);
                              if (e.key === "Escape") setEditingCard(null);
                            }}
                            autoFocus
                            className="flex-1 bg-[var(--bg)] border border-[var(--bdr)] focus:border-[var(--blue)] rounded-lg px-2 py-1 text-xs font-mono text-[var(--t1)] outline-none transition-colors"
                          />
                          <button
                            onClick={() => handleUrlChange(site)}
                            className="text-xs font-mono text-[var(--blue)] hover:brightness-110 cursor-pointer bg-transparent border-none"
                          >
                            Save
                          </button>
                        </div>
                        <div className="flex justify-between">
                          <button
                            onClick={() => setEditingCard(null)}
                            className="text-xs font-mono text-[var(--t3)] hover:text-[var(--t1)] transition-colors cursor-pointer bg-transparent border-none"
                          >
                            Cancel
                          </button>
                          <button
                            aria-label="Remove"
                            onClick={() => handleRemove(site.id)}
                            className="text-xs font-mono text-[var(--t3)] hover:text-[var(--red)] transition-colors cursor-pointer bg-transparent border-none"
                          >
                            Remove website
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between items-center">
                        <button
                          aria-label="Download history"
                          onClick={() => downloadSiteHistory(site)}
                          disabled={downloading === site.id}
                          className="text-xs font-mono text-[var(--t3)] hover:text-[var(--t1)] transition-colors cursor-pointer bg-transparent border-none disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {downloading === site.id ? "Zipping…" : "Download ↓"}
                        </button>
                        <button
                          aria-label="Edit"
                          onClick={() => openEdit(site)}
                          className="text-xs font-mono text-[var(--t3)] hover:text-[var(--t1)] transition-colors cursor-pointer bg-transparent border-none"
                        >
                          Edit ✎
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
