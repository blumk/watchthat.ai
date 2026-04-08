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
        <WatchedSites sites={sites} onUpdate={handleUpdate} onRemove={handleRemove} />
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
