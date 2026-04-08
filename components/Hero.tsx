"use client";

import { useState, useEffect } from "react";

const ROTATING_TERMS = ["websites", "job postings", "ticket drops", "products in stock", "website changes", "product launches", "anything"];

interface Props {
  onAdd?: (url: string) => void;
  onDemo?: () => void;
  hasSites?: boolean;
}

export default function Hero({ onAdd, onDemo, hasSites }: Props) {
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState("");
  const [termIdx, setTermIdx] = useState(0);
  const [termVisible, setTermVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setTermVisible(false);
      setTimeout(() => {
        setTermIdx((i) => (i + 1) % ROTATING_TERMS.length);
        setTermVisible(true);
      }, 300);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="text-center px-6 pt-20 pb-12 max-w-[700px] mx-auto">
      {/* Headline */}
      <h1 className="text-[clamp(34px,6vw,54px)] font-black leading-[1.12] tracking-[-0.045em] mb-[18px] text-[var(--t1)]">
        We monitor
        <br />
        <em
          className="not-italic"
          style={{
            background: "linear-gradient(135deg, var(--blue), #818CF8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            opacity: termVisible ? 1 : 0,
            transition: "opacity 0.3s ease",
            display: "inline-block",
          }}
        >
          {ROTATING_TERMS[termIdx]}
        </em>
        <br />
        so you don&apos;t have to.
      </h1>

      {/* Search bar */}
      <div className="max-w-[600px] mx-auto mb-4 mt-10">
        <div
          className={`flex items-center bg-[var(--bg2)] border-2 rounded-2xl px-6 py-2 transition-all duration-300 ${
            focused
              ? "border-[var(--bdr-f)] shadow-[0_0_0_5px_var(--blue-g),0_12px_48px_rgba(0,0,0,0.3)]"
              : "border-[var(--bdr)]"
          }`}
        >
          <input
            type="text"
            placeholder="https://example.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                onAdd?.(value.trim());
                setValue("");
              }
            }}
            className="flex-1 bg-transparent border-none outline-none text-[17px] font-mono text-[var(--t1)] placeholder-[var(--t3)] py-3.5 min-w-0"
            aria-label="Website URL to watch"
            autoFocus
          />

          <button
            className="shrink-0 px-7 py-3.5 rounded-xl border-none bg-[var(--blue)] text-white text-[15px] font-bold cursor-pointer transition-all duration-200 hover:brightness-110 hover:-translate-y-px whitespace-nowrap"
            onClick={() => {
              if (value.trim()) {
                onAdd?.(value.trim());
                setValue("");
              }
            }}
            type="button"
          >
            Watch
          </button>
        </div>
      </div>

      {/* Subtext + demo */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-[13px] text-[var(--t3)] leading-relaxed max-w-[400px] mx-auto">
          Paste a URL. Watchthis takes a snapshot, watches in the background, and
          barks when something changes.
        </p>
        {!hasSites && (
          <button
            onClick={onDemo}
            className="text-[13px] font-mono text-[var(--blue)] hover:underline cursor-pointer bg-transparent border-none"
          >
            Try with news.ycombinator.com →
          </button>
        )}
      </div>
    </section>
  );
}
