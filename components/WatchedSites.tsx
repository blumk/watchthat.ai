"use client";

import { useState } from "react";
import { hashString } from "@/lib/hash";
import { updateSite, removeSite } from "@/lib/storage";
import type { WatchedSite } from "@/lib/storage";

type SiteStatus = "sniffing" | "quiet" | "changed" | "error";

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
      const { markdown } = (await res.json()) as { markdown: string };
      const newHash = hashString(markdown);
      const changed = site.lastHash !== null && newHash !== site.lastHash;
      const patch: Partial<WatchedSite> = {
        lastHash: newHash,
        lastContent: markdown,
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
  }

  return (
    <section className="max-w-[700px] mx-auto px-6 pb-16">
      <div className="flex flex-col gap-3">
        {sites.map((site) => {
          const status = deriveStatus(site, sniffing.has(site.id));
          const isExpanded = expanded.has(site.id);
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
              <div className="flex items-center gap-4 px-5 py-4">
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

                {/* Preview toggle — only shown when content is available */}
                {site.lastContent && (
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
              {isExpanded && site.lastContent && (
                <div className="border-t border-[var(--bdr)] px-5 py-4">
                  <pre className="text-xs font-mono text-[var(--t2)] whitespace-pre-wrap break-words max-h-64 overflow-y-auto leading-relaxed">
                    {site.lastContent}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
