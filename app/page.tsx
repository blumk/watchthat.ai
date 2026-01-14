"use client";

import { useState, useEffect } from "react";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import FeatureCards from "@/components/FeatureCards";
import HowItWorks from "@/components/HowItWorks";
import Footer from "@/components/Footer";
import WatchedSites from "@/components/WatchedSites";
import { getSites, addSite } from "@/lib/storage";
import { EXAMPLE_SITE } from "@/lib/example-site";
import type { WatchedSite } from "@/lib/storage";

export default function Home() {
  const [sites, setSites] = useState<WatchedSite[]>([]);

  useEffect(() => {
    getSites().then(setSites);
  }, []);

  async function handleAdd(url: string) {
    const site = await addSite(url);
    setSites((prev) => [...prev, site]);
  }

  function handleDemo() {
    setSites((prev) =>
      prev.some((s) => s.id === EXAMPLE_SITE.id) ? prev : [EXAMPLE_SITE, ...prev]
    );
  }

  function handleUpdate(id: string, patch: Partial<WatchedSite>) {
    setSites((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  async function handleRemove(id: string) {
    await removeSite(id);
    setSites((prev) => prev.filter((s) => s.id !== id));
  }

  const hasSites = sites.length > 0;

  return (
    <div className="min-h-screen bg-[var(--bg)] overflow-x-hidden">
      <Nav />
      <Hero onAdd={handleAdd} onDemo={handleDemo} hasSites={hasSites} />
      {hasSites && (
        <div className="max-w-[700px] mx-auto px-6 pt-2 pb-3">
          <h2 className="text-xs font-mono font-semibold text-[var(--t3)] tracking-widest uppercase">
            My watch list
          </h2>
        </div>
      )}
      <WatchedSites sites={sites} onUpdate={handleUpdate} onRemove={handleRemove} />
      <FeatureCards />
      <div className="max-w-[900px] mx-auto px-6">
        <div className="h-px bg-[var(--bdr)]" />
      </div>
      <HowItWorks />
      <Footer />
    </div>
  );
}
