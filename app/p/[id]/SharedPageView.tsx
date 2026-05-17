"use client";

import { useState } from "react";
import { snapshotPublicUrl, type SnapshotRow } from "@/lib/snapshot";
import { useVisibilityTick } from "@/lib/use-visibility-tick";

interface PageRow {
  id: string;
  url: string;
  label: string;
  last_fetched_at: string | null;
  latest_snapshot_id: string | null;
}

interface DisplayEntry {
  id: string;
  timestamp: number;
  description: string;
  classification: "major" | "minor" | "quiet" | "error";
  emoji?: string;
  screenshot: string | null;
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// Mirror the history-construction rules from lib/db.getSites so the share
// page renders the same entries a watcher sees: earliest snapshot becomes
// "Initial snapshot taken.", subsequent snapshots only count when they
// carry a change_description with major/minor classification.
function buildHistory(snapshots: SnapshotRow[]): DisplayEntry[] {
  const entries: DisplayEntry[] = [];
  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    if (i === 0) {
      entries.push({
        id: s.id,
        timestamp: new Date(s.fetched_at).getTime(),
        description: "Initial snapshot taken.",
        classification: "quiet",
        screenshot: snapshotPublicUrl(s.screenshot_path),
      });
      continue;
    }
    if (
      s.change_description &&
      (s.change_classification === "major" || s.change_classification === "minor")
    ) {
      entries.push({
        id: s.id,
        timestamp: new Date(s.fetched_at).getTime(),
        description: s.change_description,
        classification: s.change_classification,
        emoji: s.change_emoji ?? undefined,
        screenshot: snapshotPublicUrl(s.screenshot_path),
      });
    }
  }
  return entries;
}

// Share pages only expose the last 7 days of history — full back-catalogue
// is reserved for users who add the page to their own watchlist.
const SHARE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export default function SharedPageView({
  page,
  snapshots,
}: {
  page: PageRow;
  snapshots: SnapshotRow[];
}) {
  // Newest first — matches how the watcher's expanded log renders.
  const allEntries = buildHistory(snapshots).reverse();
  const cutoff = Date.now() - SHARE_WINDOW_MS;
  const entries = allEntries.filter((e) => e.timestamp >= cutoff);
  const hiddenCount = allEntries.length - entries.length;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = entries[selectedIdx] ?? null;
  const watchHref = `/?watch=${encodeURIComponent(page.url)}`;
  // Refresh relative timestamps when the tab regains focus.
  useVisibilityTick();

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--t1)]">
      {/* Header */}
      <header className="border-b border-[var(--bdr)] bg-[var(--bg2)]">
        <div className="max-w-[960px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <a
            href="/"
            className="text-sm font-mono text-[var(--t3)] hover:text-[var(--t1)] transition-colors no-underline"
          >
            ← WatchThat
          </a>
          <span className="text-[10px] font-mono text-[var(--t3)] uppercase tracking-widest">
            Shared change log
          </span>
        </div>
      </header>

      {/* Site identity */}
      <section className="max-w-[960px] mx-auto px-6 pt-8 pb-4">
        <h1 className="text-2xl font-mono text-[var(--t1)] mb-1 truncate">
          {page.label}
        </h1>
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-mono text-[var(--t3)] hover:text-[var(--blue)] transition-colors break-all"
        >
          {page.url} ↗
        </a>
        {page.last_fetched_at && (
          <div className="mt-2 text-[11px] font-mono text-[var(--t3)]">
            Last checked {timeAgo(new Date(page.last_fetched_at).getTime())}
          </div>
        )}
      </section>

      {entries.length === 0 ? (
        <section className="max-w-[960px] mx-auto px-6 py-12">
          <p className="text-sm font-mono text-[var(--t3)] mb-6">
            {allEntries.length === 0
              ? "No snapshots have been captured for this page yet."
              : "No changes in the last 7 days. Watch this page yourself to see its full history and get notified the moment it moves."}
          </p>
          <a
            href={watchHref}
            className="inline-flex items-center px-5 py-2.5 rounded-xl bg-[var(--blue)] text-white text-sm font-semibold no-underline hover:brightness-110 transition-all"
          >
            Watch this →
          </a>
        </section>
      ) : (
        <section className="max-w-[960px] mx-auto px-6 pb-12 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6 items-start">
          {/* Screenshot */}
          <div className="rounded-2xl overflow-hidden border border-[var(--bdr)] bg-[var(--bg2)] aspect-video relative">
            {selected?.screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.screenshot}
                alt={`Screenshot for ${selected.description}`}
                className="absolute inset-0 w-full h-full object-cover object-top"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm font-mono text-[var(--t3)]">
                No screenshot for this entry
              </div>
            )}
          </div>

          {/* Change log */}
          <aside aria-label="Change log" className="bg-[var(--bg2)] border border-[var(--bdr)] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--bdr)]">
              <div className="text-[11px] font-mono text-[var(--t3)] uppercase tracking-widest">
                Change history · last 7 days
              </div>
              <div className="text-[10px] font-mono text-[var(--t3)] mt-0.5">
                {entries.length} {entries.length === 1 ? "entry" : "entries"} shown
              </div>
            </div>
            <ul className="max-h-[480px] overflow-y-auto">
              {entries.map((e, i) => {
                const isSelected = i === selectedIdx;
                const dotColor =
                  e.classification === "major" ? "var(--red)"
                  : e.classification === "error" ? "var(--red)"
                  : e.classification === "quiet" ? "var(--green)"
                  : "var(--t3)";
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setSelectedIdx(i)}
                      aria-current={isSelected ? "true" : undefined}
                      className={`w-full text-left px-4 py-3 border-b border-[var(--bdr)] last:border-b-0 cursor-pointer transition-colors ${
                        isSelected ? "bg-[var(--bg3)]" : "hover:bg-[var(--bg)]"
                      } ${isSelected ? "border-l-2 border-l-[var(--blue)]" : "border-l-2 border-l-transparent"}`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        {e.emoji ? (
                          <span className="shrink-0 text-sm leading-none mt-px">{e.emoji}</span>
                        ) : (
                          <span
                            className="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
                            style={{ background: dotColor }}
                          />
                        )}
                        <span className={`text-xs flex-1 leading-snug ${isSelected ? "text-[var(--t1)]" : "text-[var(--t2)]"}`}>
                          {e.description}
                        </span>
                      </div>
                      <div className="mt-1 ml-4 text-[10px] font-mono text-[var(--t3)]">
                        {timeAgo(e.timestamp)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {hiddenCount > 0 && (
              <div className="px-4 py-3 border-t border-[var(--bdr)] bg-[var(--bg3)]">
                <div className="text-[11px] font-mono text-[var(--t2)] leading-relaxed">
                  {hiddenCount} older {hiddenCount === 1 ? "entry" : "entries"} hidden.
                </div>
                <a
                  href={watchHref}
                  className="inline-block mt-2 text-xs font-mono text-[var(--blue)] hover:brightness-110 no-underline"
                >
                  Watch to see full history →
                </a>
              </div>
            )}
          </aside>
        </section>
      )}

      <footer className="max-w-[960px] mx-auto px-6 pb-12 pt-6 border-t border-[var(--bdr)]">
        <div className="rounded-2xl border border-[var(--bdr)] bg-[var(--bg2)] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-mono text-[var(--t1)]">
              Add this page to your own watchlist
            </div>
            <div className="text-[11px] font-mono text-[var(--t3)] mt-0.5">
              You'll see the full history and get notified when anything changes.
            </div>
          </div>
          <a
            href={watchHref}
            className="shrink-0 inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-[var(--blue)] text-white text-sm font-semibold no-underline hover:brightness-110 transition-all"
          >
            Watch this →
          </a>
        </div>
      </footer>
    </main>
  );
}
