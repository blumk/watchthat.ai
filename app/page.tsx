"use client";

import { useState, useEffect } from "react";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import FeatureCards from "@/components/FeatureCards";
import HowItWorks from "@/components/HowItWorks";
import Footer from "@/components/Footer";
import WatchedSites from "@/components/WatchedSites";
import { getSites, addSite } from "@/lib/storage";
import type { WatchedSite } from "@/lib/storage";

export default function Home() {
  const [sites, setSites] = useState<WatchedSite[]>([]);

  useEffect(() => {
    setSites(getSites());
  }, []);

  function handleAdd(url: string) {
    const site = addSite(url);
    setSites((prev) => [...prev, site]);
  }

  function handleUpdate(id: string, patch: Partial<WatchedSite>) {
    setSites((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  function handleRemove(id: string) {
    setSites((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] overflow-x-hidden">
      <Nav />
      <Hero onAdd={handleAdd} />
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
