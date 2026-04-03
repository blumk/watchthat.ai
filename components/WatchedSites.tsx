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
  const [editingTarget, setEditingTarget] = useState<Record<string, string>>({});
  const [showTargetInput, setShowTargetInput] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<Record<string, number>>({});
  const [modalScreenshot, setModalScreenshot] = useState<string | null>(null);
  const [sniffPhase, setSniffPhase] = useState(0);
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
        site.lastExtractedHash === null &&
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

      if (site.watchTarget) {
        // 2. Semantic extraction
        const extractRes = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown: data.markdown, watchTarget: site.watchTarget }),
        });
        const { value } = extractRes.ok
          ? ((await extractRes.json()) as { value: string })
          : { value: "" };

        const newExtractedHash = hashString(value);
        const changed =
          site.lastExtractedHash !== null &&
          newExtractedHash !== site.lastExtractedHash;

        patch.lastExtractedValue = value;
        patch.lastExtractedHash = newExtractedHash;
        patch.changed = changed;

        if (site.lastExtractedHash === null) {
          patch.history = [
            ...(site.history ?? []),
            makeEntry("Initial snapshot taken.", "quiet", undefined, undefined, data.screenshot),
          ];
        } else if (changed && site.lastExtractedValue) {
          const descRes = await fetch("/api/describe-change", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              oldValue: site.lastExtractedValue,
              newValue: value,
              watchTarget: site.watchTarget,
              url: site.url,
            }),
          });
          const descData = descRes.ok
            ? ((await descRes.json()) as { description: string; classification: "major" | "minor" })
            : { description: "The monitored value changed.", classification: "minor" as const };
          patch.changeDescription = descData.description;
          patch.history = [
            ...(site.history ?? []),
            makeEntry(descData.description, descData.classification, site.lastExtractedValue ?? undefined, value, data.screenshot),
          ];
        } else {
          patch.changeDescription = null;
          patch.history = [
            ...(site.history ?? []),
            makeEntry("No changes detected.", "quiet", undefined, undefined, data.screenshot),
          ];
        }
      } else {
        // Fallback: hash full markdown
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

  function saveWatchTarget(site: WatchedSite) {
    const target = (editingTarget[site.id] ?? "").trim() || null;
    const patch: Partial<WatchedSite> = {
      watchTarget: target,
      lastExtractedValue: null,
      lastExtractedHash: null,
      changeDescription: null,
    };
    void updateSite(site.id, patch);
    onUpdate(site.id, patch);
    setShowTargetInput((prev) => {
      const next = new Set(prev);
      next.delete(site.id);
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

      <section className="max-w-[700px] mx-auto px-6 pb-16">
        <div className="flex flex-col gap-3">
          {sites.map((site) => {
            const status = deriveStatus(site, sniffing.has(site.id));
            const isEditingTarget = showTargetInput.has(site.id);
            const statusColor =
              status === "quiet"
                ? "var(--green)"
                : status === "changed"
                  ? "var(--red)"
                  : status === "error"
                    ? "var(--t3)"
                    : "var(--blue)";

            const histEntries = [...(site.history ?? [])].reverse();
            const histIdx = Math.min(selectedEntry[site.id] ?? 0, Math.max(0, histEntries.length - 1));
            const histEntry = histEntries[histIdx] ?? null;
            const panelScreenshot = histEntry?.screenshot ?? site.lastScreenshot;

            return (
              <div
                key={site.id}
                className="group bg-[var(--bg2)] border border-[var(--bdr)] hover:border-[var(--t3)] rounded-2xl overflow-hidden transition-colors"
              >
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Thumbnail — reflects selected history entry; click opens modal */}
                  {panelScreenshot && (
                    <button
                      aria-label="Open screenshot"
                      onClick={() => setModalScreenshot(panelScreenshot)}
                      className="relative shrink-0 w-[60px] h-[38px] rounded-lg overflow-hidden border border-[var(--bdr)] hover:border-[var(--t3)] transition-colors cursor-zoom-in p-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={panelScreenshot}
                        alt={`Screenshot of ${site.label}`}
                        className="absolute inset-0 w-full h-full object-cover object-top"
                      />
                    </button>
                  )}

                  {/* Label + extracted value */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-mono text-[var(--t1)] truncate block">
                      {site.label}
                    </span>
                    {site.watchTarget && site.lastExtractedValue && (
                      <span className="text-xs font-mono text-[var(--t3)] truncate block">
                        {site.watchTarget}: <span className="text-[var(--t2)]">{site.lastExtractedValue}</span>
                      </span>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div className="shrink-0 text-right">
                    <span
                      className="text-xs font-semibold font-mono block"
                      style={{ color: statusColor }}
                    >
                      {status === "sniffing" || status === "error"
                        ? (status === "sniffing" ? SNIFF_LABELS[sniffPhase % SNIFF_LABELS.length] : "Error")
                        : timeAgo(
                            status === "changed"
                              ? (site.history?.at(-1)?.timestamp ?? site.lastChecked)
                              : site.lastChecked
                          )}
                    </span>
                    {(status === "changed" || status === "error") && site.lastChecked && (
                      <span className="text-[10px] font-mono text-[var(--t3)] block mt-0.5">
                        ↻ {timeAgo(site.lastChecked)}
                      </span>
                    )}
                  </div>

                  {/* Actions — revealed on hover */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Watch target edit button */}
                    <button
                      aria-label={isEditingTarget ? "Cancel watch target" : "Edit watch target"}
                      onClick={() =>
                        setShowTargetInput((prev) => {
                          const next = new Set(prev);
                          if (next.has(site.id)) {
                            next.delete(site.id);
                          } else {
                            next.add(site.id);
                            setEditingTarget((e) => ({ ...e, [site.id]: site.watchTarget ?? "" }));
                          }
                          return next;
                        })
                      }
                      className={`shrink-0 text-sm transition-colors cursor-pointer bg-transparent border-none leading-none ${
                        isEditingTarget || site.watchTarget
                          ? "text-[var(--blue)]"
                          : "text-[var(--t3)] hover:text-[var(--t2)]"
                      }`}
                      title={site.watchTarget ? `Watching: ${site.watchTarget}` : "Set watch target"}
                    >
                      ✦
                    </button>

                    {/* Refresh button */}
                    <button
                      aria-label="Fetch"
                      onClick={() => fetchSite(site)}
                      disabled={sniffing.has(site.id)}
                      title="Refresh"
                      className="shrink-0 text-[var(--t3)] hover:text-[var(--t1)] transition-colors text-base leading-none cursor-pointer bg-transparent border-none disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ↻
                    </button>

                    {/* Remove */}
                    <button
                      aria-label="Remove"
                      onClick={() => handleRemove(site.id)}
                      className="shrink-0 text-[var(--t3)] hover:text-[var(--red)] transition-colors text-lg leading-none cursor-pointer bg-transparent border-none"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Change history — scrollable list left, screenshot right */}
                {(histEntries.length > 0 || panelScreenshot) && (
                  <div className="border-t border-[var(--bdr)] flex items-stretch">
                    {/* Left: scrollable entry list */}
                    {histEntries.length > 0 && (
                    <div className="flex-1 min-w-0 overflow-y-auto max-h-[260px]">
                      {histEntries.map((entry, idx) => {
                        const isSelected = idx === histIdx;
                        const entryColor =
                          entry.classification === "major"
                            ? "var(--red)"
                            : entry.classification === "quiet"
                            ? "var(--green)"
                            : entry.classification === "error"
                            ? "var(--red)"
                            : "var(--t3)";
                        return (
                          <div
                            key={entry.id}
                            onClick={() => setSelectedEntry((p) => ({ ...p, [site.id]: idx }))}
                            className={`px-4 py-2.5 cursor-pointer border-b border-[var(--bdr)] last:border-b-0 transition-colors ${
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
                              <div className="shrink-0 ml-2 text-right">
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

                    {/* Right: screenshot for the selected entry — click opens modal */}
                    {panelScreenshot && (
                      <button
                        aria-label="Open screenshot"
                        onClick={() => setModalScreenshot(panelScreenshot)}
                        className="relative shrink-0 w-[220px] self-stretch border-l border-[var(--bdr)] min-h-[120px] cursor-zoom-in p-0 overflow-hidden"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={panelScreenshot}
                          alt={`Screenshot of ${site.label}`}
                          className="absolute inset-0 w-full h-full object-cover object-top"
                        />
                      </button>
                    )}
                  </div>
                )}

                {/* Watch target input */}
                {isEditingTarget && (
                  <div className="border-t border-[var(--bdr)] px-4 py-3 flex gap-2 items-center">
                    <span className="text-xs text-[var(--t3)] font-mono shrink-0">Watch for:</span>
                    <input
                      type="text"
                      placeholder='e.g. "the Pro plan price" or "the CEO name"'
                      value={editingTarget[site.id] ?? ""}
                      onChange={(e) =>
                        setEditingTarget((prev) => ({ ...prev, [site.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveWatchTarget(site);
                        if (e.key === "Escape") {
                          setShowTargetInput((prev) => {
                            const next = new Set(prev);
                            next.delete(site.id);
                            return next;
                          });
                        }
                      }}
                      className="flex-1 bg-[var(--bg3)] border border-[var(--bdr)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--blue)]"
                      autoFocus
                    />
                    <button
                      onClick={() => saveWatchTarget(site)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--blue)] text-white text-xs font-semibold cursor-pointer border-none hover:brightness-110 transition-all"
                    >
                      Save
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
