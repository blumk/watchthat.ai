"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { hashString } from "@/lib/hash";
import { updateSite, removeSite } from "@/lib/storage";
import type { WatchedSite, ChangeEntry } from "@/lib/storage";

function makeEntry(
  description: string,
  classification: "major" | "minor" | "quiet",
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
type PreviewTab = "markdown" | "html" | "rawHtml" | "screenshot";

function deriveStatus(site: WatchedSite, sniffing: boolean): SiteStatus {
  if (sniffing) return "sniffing";
  if (site.error) return "error";
  if (site.changed) return "changed";
  return "quiet";
}

const STATUS_LABEL: Record<Exclude<SiteStatus, "quiet" | "changed">, string> = {
  sniffing: "Sniffing…",
  error: "Error",
};

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Record<string, PreviewTab>>({});
  const [rawHtmlCache, setRawHtmlCache] = useState<Record<string, string>>({});
  const [editingTarget, setEditingTarget] = useState<Record<string, string>>({});
  const [showTargetInput, setShowTargetInput] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<Record<string, number>>({});
  const autoFetched = useRef<Set<string>>(new Set());

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
      const scrapeBody = await scrapeRes.json();
      if (!scrapeRes.ok) {
        throw new Error(
          (scrapeBody as { error?: string }).error ?? `HTTP ${scrapeRes.status}`
        );
      }
      const data = scrapeBody as {
        markdown: string;
        html: string;
        rawHtml: string;
        screenshot: string | null;
      };

      const patch: Partial<WatchedSite> = {
        lastContent: data.markdown,
        lastHtml: data.html,
        lastRawHtml: data.rawHtml,
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
          // First fetch — log baseline
          patch.history = [
            ...(site.history ?? []),
            makeEntry("Initial snapshot taken.", "quiet", undefined, undefined, data.screenshot),
          ];
        } else if (changed && site.lastExtractedValue) {
          // 3. Describe the change
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
          // First fetch — log baseline
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

      updateSite(site.id, patch);
      onUpdate(site.id, patch);
    } catch (err) {
      const error = err instanceof Error ? err.message : "fetch failed";
      const patch: Partial<WatchedSite> = { error, lastChecked: Date.now() };
      updateSite(site.id, patch);
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
    removeSite(id);
    onRemove(id);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      if (prev.has(id)) return new Set();
      return new Set([id]);
    });
    if (!activeTab[id]) {
      setActiveTab((prev) => ({ ...prev, [id]: "markdown" }));
    }
  }

  async function loadRawHtml(site: WatchedSite) {
    if (rawHtmlCache[site.id]) return;
    const path =
      site.id === "example-hellolingo"
        ? "/examples/hellolingo-rawhtml.html"
        : null;
    if (path) {
      const text = await fetch(path).then((r) => r.text()).catch(() => "");
      setRawHtmlCache((prev) => ({ ...prev, [site.id]: text }));
    } else if (site.lastRawHtml) {
      setRawHtmlCache((prev) => ({ ...prev, [site.id]: site.lastRawHtml! }));
    }
  }

  function handleTabChange(id: string, tab: PreviewTab, site: WatchedSite) {
    setActiveTab((prev) => ({ ...prev, [id]: tab }));
    if (tab === "rawHtml") loadRawHtml(site);
  }

  function saveWatchTarget(site: WatchedSite) {
    const target = (editingTarget[site.id] ?? "").trim() || null;
    const patch: Partial<WatchedSite> = {
      watchTarget: target,
      lastExtractedValue: null,
      lastExtractedHash: null,
      changeDescription: null,
    };
    updateSite(site.id, patch);
    onUpdate(site.id, patch);
    setShowTargetInput((prev) => {
      const next = new Set(prev);
      next.delete(site.id);
      return next;
    });
  }

  return (
    <section className="max-w-[700px] mx-auto px-6 pb-16">
      <div className="flex flex-col gap-3">
        {sites.map((site) => {
          const status = deriveStatus(site, sniffing.has(site.id));
          const isExpanded = expanded.has(site.id);
          const tab = activeTab[site.id] ?? "markdown";
          const hasContent = site.lastContent || site.lastHtml || site.lastScreenshot;
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

          return (
            <div
              key={site.id}
              className="group bg-[var(--bg2)] border border-[var(--bdr)] hover:border-[var(--t3)] rounded-2xl overflow-hidden transition-colors"
            >
              {/* Main row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Thumbnail */}
                {site.lastScreenshot && (
                  <button
                    aria-label={isExpanded && tab === "screenshot" ? "Hide preview" : "Show screenshot preview"}
                    onClick={() => {
                      if (!isExpanded) {
                        setExpanded(new Set([site.id]));
                        setActiveTab((prev) => ({ ...prev, [site.id]: "screenshot" }));
                      } else if (tab === "screenshot") {
                        setExpanded(new Set());
                      } else {
                        setActiveTab((prev) => ({ ...prev, [site.id]: "screenshot" }));
                      }
                    }}
                    className="relative shrink-0 w-[60px] h-[38px] rounded-lg overflow-hidden border border-[var(--bdr)] hover:border-[var(--bdr-f)] transition-colors"
                  >
                    <Image
                      src={site.lastScreenshot}
                      alt={`Screenshot of ${site.label}`}
                      fill
                      className="object-cover object-top"
                      unoptimized
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
                      ? STATUS_LABEL[status]
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

                  {/* Preview toggle — chevron icon */}
                  {hasContent && (
                    <button
                      aria-label={isExpanded ? "Hide preview" : "Show preview"}
                      onClick={() => toggleExpanded(site.id)}
                      className="shrink-0 text-[var(--t3)] hover:text-[var(--t1)] transition-colors text-base leading-none cursor-pointer bg-transparent border-none"
                    >
                      {isExpanded ? "▴" : "▾"}
                    </button>
                  )}

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
                </div>
              </div>

              {/* Change history — scrollable list left, screenshot right */}
              {histEntries.length > 0 && (
                <div className="border-t border-[var(--bdr)] flex items-stretch">
                  {/* Left: scrollable entry list */}
                  <div className="flex-1 min-w-0 overflow-y-auto max-h-[260px]">
                    {histEntries.map((entry, idx) => {
                      const isSelected = idx === histIdx;
                      const entryColor =
                        entry.classification === "major"
                          ? "var(--red)"
                          : entry.classification === "quiet"
                          ? "var(--green)"
                          : "var(--t3)";
                      return (
                        <div
                          key={entry.id}
                          onClick={() => setSelectedEntry((p) => ({ ...p, [site.id]: idx }))}
                          className={`px-4 py-2.5 cursor-pointer border-b border-[var(--bdr)] last:border-b-0 transition-colors ${
                            isSelected ? "bg-[var(--bg3)]" : "hover:bg-[var(--bg)]"
                          }`}
                        >
                          {/* Row: badge · description · timestamp */}
                          <div className="flex items-start gap-2 min-w-0">
                            <span
                              className="shrink-0 w-1.5 h-1.5 rounded-full"
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

                  {/* Right: screenshot for the selected entry, fixed position, no flicker */}
                  {(histEntry?.screenshot ?? site.lastScreenshot) && (
                    <div className="relative shrink-0 w-[220px] self-stretch border-l border-[var(--bdr)] min-h-[120px]">
                      <Image
                        src={(histEntry?.screenshot ?? site.lastScreenshot)!}
                        alt={`Screenshot of ${site.label}`}
                        fill
                        className="object-cover object-top"
                        unoptimized
                      />
                    </div>
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

              {/* Preview panel */}
              {isExpanded && (
                <div className="border-t border-[var(--bdr)]">
                  {/* Tabs */}
                  <div className="flex gap-1 px-4 pt-3 pb-0">
                    {(
                      [
                        { key: "markdown", label: "Markdown", available: !!site.lastContent },
                        { key: "html", label: "HTML", available: !!site.lastHtml },
                        { key: "rawHtml", label: "Raw HTML", available: !!(site.lastRawHtml || site.id === "example-hellolingo") },
                        { key: "screenshot", label: "Screenshot", available: !!site.lastScreenshot },
                      ] as { key: PreviewTab; label: string; available: boolean }[]
                    )
                      .filter((t) => t.available)
                      .map((t) => (
                        <button
                          key={t.key}
                          onClick={() => handleTabChange(site.id, t.key, site)}
                          className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold font-mono transition-colors cursor-pointer border-none ${
                            tab === t.key
                              ? "bg-[var(--bg3)] text-[var(--t1)]"
                              : "bg-transparent text-[var(--t3)] hover:text-[var(--t2)]"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                  </div>

                  {/* Panel content */}
                  <div className="px-4 py-3">
                    {tab === "screenshot" && site.lastScreenshot && (
                      <div>
                        <div className="relative w-full h-56 rounded-lg overflow-hidden border border-[var(--bdr)] cursor-zoom-in">
                          <Image
                            src={site.lastScreenshot}
                            alt={`Screenshot of ${site.label}`}
                            fill
                            className="object-cover object-top"
                            unoptimized
                          />
                        </div>
                        <a
                          href={site.lastScreenshot}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-2 text-xs font-mono text-[var(--blue)] hover:underline"
                        >
                          View full screenshot ↗
                        </a>
                      </div>
                    )}
                    {tab === "markdown" && site.lastContent && (
                      <pre className="text-xs font-mono text-[var(--t2)] whitespace-pre-wrap break-words max-h-64 overflow-y-auto leading-relaxed">
                        {site.lastContent}
                      </pre>
                    )}
                    {tab === "html" && site.lastHtml && (
                      <pre className="text-xs font-mono text-[var(--t2)] whitespace-pre-wrap break-words max-h-64 overflow-y-auto leading-relaxed">
                        {site.lastHtml}
                      </pre>
                    )}
                    {tab === "rawHtml" && (
                      <pre className="text-xs font-mono text-[var(--t2)] whitespace-pre-wrap break-words max-h-64 overflow-y-auto leading-relaxed">
                        {rawHtmlCache[site.id] ?? "Loading…"}
                      </pre>
                    )}
                  </div>

                  {/* Remove — only visible when expanded */}
                  <div className="px-4 pb-3 flex justify-end">
                    <button
                      aria-label="Remove"
                      onClick={() => handleRemove(site.id)}
                      className="text-xs font-mono text-[var(--t3)] hover:text-[var(--red)] transition-colors cursor-pointer bg-transparent border-none"
                    >
                      Remove site
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
