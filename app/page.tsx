"use client";

import { useState, useEffect } from "react";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";
import WatchedSites from "@/components/WatchedSites";
import WatchSetup from "@/components/WatchSetup";
import { getSites, addSite, updateSite, removeSite } from "@/lib/storage";
import { EXAMPLE_SITE } from "@/lib/example-site";
import { hashString } from "@/lib/hash";
import type { WatchedSite } from "@/lib/storage";

function AddBar({ onAdd }: { onAdd: (url: string) => void }) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
  }

  return (
    <div className="max-w-[700px] mx-auto px-6 pt-4 pb-2 flex gap-2">
      <input
        type="text"
        placeholder="https://example.com"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="flex-1 bg-[var(--bg2)] border border-[var(--bdr)] rounded-xl px-4 py-2 text-sm font-mono text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--blue)] transition-colors"
      />
      <button
        onClick={submit}
        className="shrink-0 px-4 py-2 rounded-xl bg-[var(--blue)] text-white text-sm font-semibold cursor-pointer border-none hover:brightness-110 transition-all"
      >
        Watch
      </button>
    </div>
  );
}

export default function Home() {
  const [sites, setSites] = useState<WatchedSite[]>([]);
  const [view, setView] = useState<"home" | "watchlist">("home");
  const [setupUrl, setSetupUrl] = useState<string | null>(null);

  useEffect(() => {
    getSites().then((loaded) => {
      setSites(loaded);
      if (loaded.length > 0) setView("watchlist");
    });
  }, []);

  function handleSetup(url: string) {
    const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
    setSetupUrl(normalized);
  }

  async function handleAdd(
    url: string,
    opts?: { watchTarget?: string | null; refreshInterval?: number | null; scrapeData?: { markdown: string; screenshot: string | null } | null }
  ) {
    const site = await addSite(url, opts);
    let finalSite: WatchedSite = site;
    if (opts?.scrapeData) {
      const { markdown, screenshot } = opts.scrapeData;
      const titleMatch = markdown.match(/^#\s+(.+)$/m);
      const patch: Partial<WatchedSite> = {
        lastContent: markdown,
        lastScreenshot: screenshot,
        lastHash: hashString(markdown),
        lastChecked: Date.now(),
        ...(titleMatch ? { label: titleMatch[1].trim().replace(/\s+/g, " ") } : {}),
      };
      await updateSite(site.id, patch);
      finalSite = { ...site, ...patch };
    }
    setSites((prev) => (prev.some((s) => s.id === finalSite.id) ? prev : [...prev, finalSite]));
    setSetupUrl(null);
    setView("watchlist");
  }

  function handleDemo() {
    setSites((prev) =>
      prev.some((s) => s.id === EXAMPLE_SITE.id) ? prev : [EXAMPLE_SITE, ...prev]
    );
    setView("watchlist");
  }

  function handleUpdate(id: string, patch: Partial<WatchedSite>) {
    setSites((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  async function handleRemove(id: string) {
    await removeSite(id);
    setSites((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) setView("home");
      return next;
    });
  }

  const hasSites = sites.length > 0;

  return (
    <div className="min-h-screen bg-[var(--bg)] overflow-x-hidden">
      <Nav hasSites={hasSites} view={view} onSwitchView={setView} />
      {view === "watchlist" ? (
        <>
          <AddBar onAdd={handleSetup} />
          <WatchedSites sites={sites} onUpdate={handleUpdate} onRemove={handleRemove} />
        </>
      ) : setupUrl ? (
        <WatchSetup
          url={setupUrl}
          onComplete={(url, opts) => handleAdd(url, opts)}
          onCancel={() => setSetupUrl(null)}
        />
      ) : (
        <>
          <Hero onAdd={handleSetup} onDemo={handleDemo} hasSites={hasSites} />
          <HowItWorks />
          <Pricing />
          <Footer />
        </>
      )}
    </div>
  );
}
