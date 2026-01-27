"use client";

import { useState, useEffect, useRef } from "react";
import { hashString } from "@/lib/hash";
import { updateSite, removeSite } from "@/lib/storage";
import type { WatchedSite, ChangeEntry } from "@/lib/storage";

function makeEntry(
  description: string,
  classification: "major" | "minor" | "quiet" | "error",
  oldValue?: string,
  newValue?: string,
  screenshot?: string | null
): ChangeEntry {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    description,
    classification,
    ...(oldValue !== undefined ? { oldValue } : {}),
    ...(newValue !== undefined ? { newValue } : {}),
    ...(screenshot !== undefined ? { screenshot } : {}),
  };
}

type SiteStatus = "sniffing" | "quiet" | "changed" | "error";

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
  const [modalScreenshot, setModalScreenshot] = useState<string | null>(null);
  const [sniffPhase, setSniffPhase] = useState(0);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
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
      // 1. Scrape
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
        // Vercel infrastructure error — body is HTML, not JSON
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
      const data = scrapeBody as unknown as {
        markdown: string;
        screenshot: string | null;
      };

      const patch: Partial<WatchedSite> = {
        lastContent: data.markdown,
        lastScreenshot: data.screenshot,
        lastChecked: Date.now(),
        error: null,
      };

      // Hash full markdown
      const newHash = hashString(data.markdown);
      const contentChanged = site.lastHash !== null && newHash !== site.lastHash;
      patch.lastHash = newHash;
      patch.changed = contentChanged;
      patch.changeDescription = null;

      if (site.lastHash === null) {
        patch.history = [
          ...(site.history ?? []),
          makeEntry("Initial snapshot taken.", "quiet", undefined, undefined, data.screenshot),
        ];
      } else if (contentChanged && site.lastContent) {
        const descRes = await fetch("/api/describe-change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldValue: site.lastContent,
            newValue: data.markdown,
            watchTarget: "page content",
            url: site.url,
          }),
        });
        const descData = descRes.ok
          ? ((await descRes.json()) as { description: string; classification: "major" | "minor" })
          : { description: "Page content changed.", classification: "minor" as const };
        patch.changeDescription = descData.description;
        patch.history = [
          ...(site.history ?? []),
          makeEntry(descData.description, descData.classification, site.lastContent ?? undefined, data.markdown, data.screenshot),
        ];
      } else {
        patch.history = [
          ...(site.history ?? []),
          makeEntry("No changes detected.", "quiet", undefined, undefined, data.screenshot),
        ];
      }

      void updateSite(site.id, patch);
      onUpdate(site.id, patch);
    } catch (err) {
      const error = err instanceof Error ? err.message : "fetch failed";
      const patch: Partial<WatchedSite> = {
        error,
        lastChecked: Date.now(),
        history: [...(site.history ?? []), makeEntry(error, "error")],
      };
      void updateSite(site.id, patch);
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

  function toggleCard(id: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {/* Screenshot modal */}
      {modalScreenshot && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center cursor-zoom-out"
          onClick={() => setModalScreenshot(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={modalScreenshot}
            alt="Full screenshot"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <section className="max-w-[1080px] mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map((site) => {
            const status = deriveStatus(site, sniffing.has(site.id));
            const dotColor =
              status === "quiet" ? "var(--green)"
              : status === "changed" ? "var(--red)"
              : status === "error" ? "var(--t3)"
              : "var(--blue)";

            const histEntries = [...(site.history ?? [])].reverse();
            const histIdx = Math.min(selectedEntry[site.id] ?? 0, Math.max(0, histEntries.length - 1));
            const histEntry = histEntries[histIdx] ?? null;
            const panelScreenshot = histEntry?.screenshot ?? site.lastScreenshot;
            const isExpanded = expandedCards.has(site.id);
            const hasExpandable = histEntries.length > 0 || !!panelScreenshot;
            const latestEntry = histEntries[0] ?? null;
            const subtitle = latestEntry
              ? latestEntry.classification === "quiet" || latestEntry.classification === "error"
                ? `Last checked ${timeAgo(latestEntry.timestamp)}`
                : latestEntry.description
              : null;

            return (
              <div
                key={site.id}
                className="group bg-[var(--bg2)] border border-[var(--bdr)] hover:border-[var(--t3)] rounded-2xl overflow-hidden transition-colors flex flex-col"
              >
                {/* Screenshot header — click opens modal */}
                <button
                  aria-label="Open screenshot"
                  onClick={() => panelScreenshot && setModalScreenshot(panelScreenshot)}
                  className={`relative w-full aspect-video overflow-hidden p-0 border-none bg-[var(--bg3)] ${panelScreenshot ? "cursor-zoom-in" : "cursor-default"}`}
                >
                  {panelScreenshot && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={panelScreenshot}
                      alt={`Screenshot of ${site.label}`}
                      className="absolute inset-0 w-full h-full object-cover object-top"
                    />
                  )}
                  {/* Status dot */}
                  <span
                    className="absolute top-2 right-2 w-2 h-2 rounded-full shadow"
                    style={{ background: dotColor }}
                  />
                </button>

                {/* Card footer */}
                <div className="flex items-start gap-2 px-3 py-2.5">
                  {/* Label + subtitle */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-mono text-[var(--t1)] truncate block leading-snug">
                      {site.label}
                    </span>
                    {!isExpanded && subtitle && (
                      <span className="text-xs font-mono text-[var(--t3)] truncate block mt-0.5">
                        {subtitle}
                      </span>
                    )}
                  </div>

                  {/* Time + actions */}
                  <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-mono text-[var(--t3)]">
                      {status === "sniffing"
                        ? SNIFF_LABELS[sniffPhase % SNIFF_LABELS.length]
                        : status === "error"
                        ? "Error"
                        : timeAgo(site.lastChecked)}
                    </span>
                    <button
                      aria-label="Fetch"
                      onClick={() => fetchSite(site)}
                      disabled={sniffing.has(site.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--t3)] hover:text-[var(--t1)] text-sm leading-none cursor-pointer bg-transparent border-none disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ↻
                    </button>
                    {hasExpandable && (
                      <button
                        aria-label={isExpanded ? "Hide changelog" : "Show changelog"}
                        onClick={() => toggleCard(site.id)}
                        className="text-[var(--t3)] hover:text-[var(--t1)] transition-colors text-xs leading-none cursor-pointer bg-transparent border-none"
                      >
                        {isExpanded ? "▴" : "▾"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded: history log */}
                {isExpanded && histEntries.length > 0 && (
                  <div className="border-t border-[var(--bdr)] overflow-y-auto max-h-[220px]">
                    {histEntries.map((entry, idx) => {
                      const isSelected = idx === histIdx;
                      const entryColor =
                        entry.classification === "major" ? "var(--red)"
                        : entry.classification === "quiet" ? "var(--green)"
                        : entry.classification === "error" ? "var(--red)"
                        : "var(--t3)";
                      return (
                        <div
                          key={entry.id}
                          onClick={() => setSelectedEntry((p) => ({ ...p, [site.id]: idx }))}
                          className={`px-3 py-2 cursor-pointer border-b border-[var(--bdr)] last:border-b-0 transition-colors ${
                            isSelected ? "bg-[var(--bg3)]" : "hover:bg-[var(--bg)]"
                          }`}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <span
                              className="shrink-0 w-1.5 h-1.5 rounded-full mt-1"
                              style={{ background: entryColor }}
                            />
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

                {/* Remove — shown in expanded footer */}
                {isExpanded && (
                  <div className="border-t border-[var(--bdr)] px-3 py-2 flex justify-end mt-auto">
                    <button
                      aria-label="Remove"
                      onClick={() => handleRemove(site.id)}
                      className="text-xs font-mono text-[var(--t3)] hover:text-[var(--red)] transition-colors cursor-pointer bg-transparent border-none"
                    >
                      Remove website
                    </button>
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
