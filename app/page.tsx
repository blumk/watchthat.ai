"use client";

import { useState, useEffect } from "react";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";
import WatchedSites from "@/components/WatchedSites";
import WatchSetup from "@/components/WatchSetup";
import { getSites, addSite, updateSite, removeSite } from "@/lib/db";
import { readCachedSites, writeCachedSites } from "@/lib/siteCache";
import { EXAMPLE_SITE } from "@/lib/example-site";
import type { WatchedSite } from "@/lib/db";
import type { ClientSnapshot } from "@/lib/snapshot";

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
        Watch →
      </button>
    </div>
  );
}

export default function Home() {
  const [sites, setSites] = useState<WatchedSite[]>([]);
  const [view, setView] = useState<"home" | "watchlist">("home");
  const [setupUrl, setSetupUrl] = useState<string | null>(null);

  function commitSites(
    updater: WatchedSite[] | ((prev: WatchedSite[]) => WatchedSite[]),
  ) {
    setSites((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      writeCachedSites(next);
      return next;
    });
  }

  useEffect(() => {
    // Seed from localStorage here (not during useState init) to avoid an
    // SSR/client hydration mismatch — server has no localStorage, so the
    // initial render must match an empty list. Cache fills in one tick
    // after mount, which is still effectively instant vs the Supabase
    // round-trip that follows.
    const cached = readCachedSites();
    if (cached.length > 0) {
      setSites(cached);
      setView("watchlist");
    }
    getSites().then((loaded) => {
      commitSites(loaded);
      if (loaded.length > 0) setView("watchlist");
    });
  }, []);

  function handleSetup(url: string) {
    const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
    setSetupUrl(normalized);
  }

  async function handleImmediateAdd(
    url: string,
    snapshot: ClientSnapshot | null
  ): Promise<string> {
    const site = await addSite(url);
    let finalSite: WatchedSite = site;
    if (snapshot) {
      const titleMatch = snapshot.markdown.match(/^#\s+(.+)$/m);
      const patch: Partial<WatchedSite> = {
        lastContent: snapshot.markdown,
        lastScreenshot: snapshot.screenshot_url,
        lastHash: snapshot.content_hash,
        lastChecked: Date.now(),
        changeDescription: snapshot.change_description,
        changed:
          snapshot.change_classification !== null &&
          snapshot.change_classification !== "quiet",
        ...(titleMatch ? { label: titleMatch[1].trim().replace(/\s+/g, " ") } : {}),
      };
      finalSite = { ...site, ...patch };
    }
    commitSites((prev) => (prev.some((s) => s.id === finalSite.id) ? prev : [...prev, finalSite]));
    setView("watchlist");
    return site.id;
  }

  async function handlePatch(
    id: string,
    patch: { watchTarget: string | null; refreshInterval: number | null }
  ) {
    await updateSite(id, patch);
    commitSites((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function handleDone() {
    setSetupUrl(null);
  }

  function handleDemo() {
    commitSites((prev) =>
      prev.some((s) => s.id === EXAMPLE_SITE.id) ? prev : [EXAMPLE_SITE, ...prev]
    );
    setView("watchlist");
  }

  function handleUpdate(id: string, patch: Partial<WatchedSite>) {
    commitSites((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  async function handleRemove(id: string) {
    await removeSite(id);
    commitSites((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) setView("home");
      return next;
    });
  }

  const hasSites = sites.length > 0;

  return (
    <div className="min-h-screen bg-[var(--bg)] overflow-x-hidden">
      <Nav hasSites={hasSites} view={view} onSwitchView={setView} />
      {setupUrl ? (
        <WatchSetup
          url={setupUrl}
          onAdd={handleImmediateAdd}
          onPatch={handlePatch}
          onDone={handleDone}
          onCancel={() => setSetupUrl(null)}
        />
      ) : view === "watchlist" ? (
        <>
          <AddBar onAdd={handleSetup} />
          <WatchedSites sites={sites} onUpdate={handleUpdate} onRemove={handleRemove} />
        </>
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
