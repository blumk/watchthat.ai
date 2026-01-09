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

  if (sites.length === 0) return null;

  async function fetchSite(site: WatchedSite) {
    if (sniffing.has(site.id)) return;
    setSniffing((prev) => new Set(prev).add(site.id));
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: site.url }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        markdown: string;
        html: string;
        rawHtml: string;
        screenshot: string | null;
      };
      const newHash = hashString(data.markdown);
      const changed = site.lastHash !== null && newHash !== site.lastHash;
      const patch: Partial<WatchedSite> = {
        lastHash: newHash,
        lastContent: data.markdown,
        lastHtml: data.html,
        lastRawHtml: data.rawHtml,
        lastScreenshot: data.screenshot,
        lastChecked: Date.now(),
        changed,
        error: null,
      };
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
    // For sites with a public rawHtml asset (example sites), fetch it
    const path = site.id === "example-hellolingo"
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

  return (
    <section className="max-w-[700px] mx-auto px-6 pb-16">
      <div className="flex flex-col gap-3">
        {sites.map((site) => {
          const status = deriveStatus(site, sniffing.has(site.id));
          const isExpanded = expanded.has(site.id);
          const tab = activeTab[site.id] ?? "markdown";
          const hasContent =
            site.lastContent || site.lastHtml || site.lastScreenshot;
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
              {/* Row */}
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
                    className="shrink-0 rounded-lg overflow-hidden border border-[var(--bdr)] hover:border-[var(--bdr-f)] transition-colors"
                  >
                    <Image
                      src={site.lastScreenshot}
                      alt={`Screenshot of ${site.label}`}
                      width={48}
                      height={27}
                      className="block object-cover"
                      unoptimized
                    />
                  </button>
                )}

                {/* Label */}
                <span className="flex-1 text-sm font-mono text-[var(--t1)] truncate">
                  {site.label}
                </span>

                {/* Status badge */}
                <span
                  className="text-xs font-semibold font-mono shrink-0"
                  style={{ color: statusColor }}
                >
                  {STATUS_LABEL[status]}
                </span>

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
                      <Image
                        src={site.lastScreenshot}
                        alt={`Screenshot of ${site.label}`}
                        width={660}
                        height={371}
                        className="rounded-lg w-full h-auto border border-[var(--bdr)]"
                        unoptimized
                      />
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
