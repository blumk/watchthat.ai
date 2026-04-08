"use client";

import { useState, useEffect } from "react";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";
import WatchedSites from "@/components/WatchedSites";
import { getSites, addSite, removeSite } from "@/lib/storage";
import { EXAMPLE_SITE } from "@/lib/example-site";
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

  useEffect(() => {
    getSites().then((loaded) => {
      setSites(loaded);
      if (loaded.length > 0) setView("watchlist");
    });
  }, []);

  async function handleAdd(url: string) {
    const site = await addSite(url);
    setSites((prev) => (prev.some((s) => s.id === site.id) ? prev : [...prev, site]));
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
          <AddBar onAdd={handleAdd} />
          <WatchedSites sites={sites} onUpdate={handleUpdate} onRemove={handleRemove} />
        </>
      ) : (
        <>
          <Hero onAdd={handleAdd} onDemo={handleDemo} hasSites={hasSites} />
          <HowItWorks />
          <Pricing />
          <Footer />
        </>
      )}
    </div>
  );
}
