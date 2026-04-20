"use client";

import DogLogo from "./DogLogo";

interface Props {
  hasSites?: boolean;
  view?: "home" | "watchlist";
  onSwitchView?: (v: "home" | "watchlist") => void;
}

export default function Nav({ hasSites = false, view = "home", onSwitchView }: Props) {
  return (
    <nav className="flex items-center justify-between max-w-[1080px] mx-auto px-6 py-5">
      <button
        aria-label="Watchthis"
        onClick={() => onSwitchView?.("home")}
        className="flex items-center gap-2.5 text-[20px] font-extrabold tracking-tight text-[var(--t1)] bg-transparent border-none cursor-pointer p-0"
      >
        <DogLogo size={30} />
        <span className="tracking-tight">Watch<span className="text-[var(--blue)]">this</span></span>
      </button>
      <div className="hidden sm:flex items-center gap-7 text-sm font-medium text-[var(--t2)]">
        <a
          href="#how"
          onClick={() => onSwitchView?.("home")}
          className={`transition-colors duration-200 ${view === "watchlist" ? "text-[var(--t3)] hover:text-[var(--t2)] opacity-50" : "hover:text-[var(--t1)]"}`}
        >
          How it works
        </a>
        <a
          href="#pricing"
          onClick={() => onSwitchView?.("home")}
          className={`transition-colors duration-200 ${view === "watchlist" ? "text-[var(--t3)] hover:text-[var(--t2)] opacity-50" : "hover:text-[var(--t1)]"}`}
        >
          Pricing
        </a>
        {hasSites && (
          <button
            onClick={() => onSwitchView?.(view === "watchlist" ? "home" : "watchlist")}
            className={`bg-transparent border-none cursor-pointer text-sm font-medium transition-colors duration-200 p-0 ${
              view === "watchlist"
                ? "text-[var(--t1)] font-semibold"
                : "text-[var(--t2)] hover:text-[var(--t1)]"
            }`}
          >
            My Watch List
          </button>
        )}
      </div>
    </nav>
  );
}
