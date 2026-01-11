"use client";

import { useState } from "react";
import Image from "next/image";
import { hashString } from "@/lib/hash";
import { updateSite, removeSite } from "@/lib/storage";
import type { WatchedSite } from "@/lib/storage";

type SiteStatus = "sniffing" | "quiet" | "changed" | "error";
type PreviewTab = "markdown" | "html" | "rawHtml" | "screenshot";

function deriveStatus(site: WatchedSite, sniffing: boolean): SiteStatus {
  if (sniffing) return "sniffing";
  if (site.error) return "error";
  if (site.changed) return "changed";
  return "quiet";
}

const STATUS_LABEL: Record<SiteStatus, string> = {
  sniffing: "Sniffing…",
  quiet: "All quiet",
  changed: "Changed",
  error: "Error",
};

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
      if (!scrapeRes.ok) throw new Error(`HTTP ${scrapeRes.status}`);
      const data = (await scrapeRes.json()) as {
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

        if (changed && site.lastExtractedValue) {
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
          const { description } = descRes.ok
            ? ((await descRes.json()) as { description: string })
            : { description: "" };
          patch.changeDescription = description;
        } else if (!changed) {
          patch.changeDescription = null;
        }
      } else {
        // Fallback: hash full markdown
        const newHash = hashString(data.markdown);
        patch.lastHash = newHash;
        patch.changed = site.lastHash !== null && newHash !== site.lastHash;
        patch.changeDescription = null;
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
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
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

          return (
            <div
              key={site.id}
              className="bg-[var(--bg2)] border border-[var(--bdr)] rounded-2xl overflow-hidden"
            >
              {/* Main row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Thumbnail */}
                {site.lastScreenshot && (
                  <button
                    aria-label={isExpanded && tab === "screenshot" ? "Hide preview" : "Show screenshot preview"}
                    onClick={() => {
                      if (!isExpanded) {
                        setExpanded((prev) => new Set(prev).add(site.id));
                        setActiveTab((prev) => ({ ...prev, [site.id]: "screenshot" }));
                      } else if (tab === "screenshot") {
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          next.delete(site.id);
                          return next;
                        });
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

                {/* Status badge or change description */}
                <div className="shrink-0 text-right">
                  <span
                    className="text-xs font-semibold font-mono block"
                    style={{ color: statusColor }}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                  {status === "changed" && site.changeDescription && (
                    <span className="text-xs text-[var(--t3)] block max-w-[180px] text-right leading-tight mt-0.5">
                      {site.changeDescription}
                    </span>
                  )}
                </div>

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

                {/* Preview toggle */}
                {hasContent && (
                  <button
                    aria-label={isExpanded ? "Hide preview" : "Show preview"}
                    onClick={() => toggleExpanded(site.id)}
                    className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--bdr)] bg-[var(--bg3)] text-xs text-[var(--t2)] font-semibold cursor-pointer hover:text-[var(--t1)] transition-colors"
                  >
                    {isExpanded ? "Hide" : "Preview"}
                  </button>
                )}

                {/* Fetch button */}
                <button
                  aria-label="Fetch"
                  onClick={() => fetchSite(site)}
                  disabled={sniffing.has(site.id)}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--bdr)] bg-[var(--bg3)] text-xs text-[var(--t2)] font-semibold cursor-pointer hover:text-[var(--t1)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Fetch
                </button>

                {/* Remove button */}
                <button
                  aria-label="Remove"
                  onClick={() => handleRemove(site.id)}
                  className="shrink-0 text-[var(--t3)] hover:text-[var(--red)] transition-colors text-lg leading-none cursor-pointer bg-transparent border-none"
                >
                  ×
                </button>
              </div>

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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
