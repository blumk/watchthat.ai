"use client";

import { useState } from "react";

export default function Hero() {
  const [focused, setFocused] = useState(false);

  return (
    <section className="text-center px-6 pt-20 pb-12 max-w-[700px] mx-auto">
      {/* Pill */}
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--blue-g)] border border-[rgba(59,130,246,0.18)] text-xs font-semibold text-[var(--blue)] mb-7 font-mono tracking-wide">
        ● ALWAYS WATCHING
      </div>

      {/* Headline */}
      <h1 className="text-[clamp(34px,6vw,54px)] font-black leading-[1.08] tracking-[-0.045em] mb-[18px] text-[var(--t1)]">
        Know when websites
        <br />
        <em
          className="not-italic"
          style={{
            background: "linear-gradient(135deg, var(--blue), #818CF8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          change
        </em>
      </h1>

      {/* Subtext */}
      <p className="text-[17px] text-[var(--t2)] leading-relaxed max-w-[460px] mx-auto mb-10">
        Paste a URL. Watchdog takes a snapshot, watches in the background, and
        barks when something changes.
      </p>

      {/* Search bar */}
      <div className="max-w-[560px] mx-auto">
        <div
          className={`flex items-center bg-[var(--bg2)] border-[1.5px] rounded-2xl px-5 py-1.5 transition-all duration-300 ${
            focused
              ? "border-[var(--bdr-f)] shadow-[0_0_0_4px_var(--blue-g),0_8px_40px_rgba(0,0,0,0.25)]"
              : "border-[var(--bdr)]"
          }`}
        >
          {/* Search icon */}
          <svg
            className="shrink-0 w-[18px] h-[18px] text-[var(--t3)] mr-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>

          <input
            type="text"
            placeholder="https://example.com"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="flex-1 bg-transparent border-none outline-none text-[15px] font-mono text-[var(--t1)] placeholder-[var(--t3)] py-3 min-w-0"
            aria-label="Website URL to watch"
          />

          <button
            className="shrink-0 px-6 py-3 rounded-xl border-none bg-[var(--blue)] text-white text-sm font-bold cursor-pointer transition-all duration-200 hover:brightness-110 hover:-translate-y-px whitespace-nowrap"
            onClick={() => {}}
            type="button"
          >
            Watch
          </button>
        </div>

        <p className="text-xs text-[var(--t3)] mt-3.5 font-mono">
          Paste any URL · auto-snapshots on add · alerts on change
        </p>
      </div>
    </section>
  );
}
