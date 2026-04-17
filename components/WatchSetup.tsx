"use client";

import { useState, useEffect, useRef } from "react";

interface AnalyzeOption {
  label: string;
  watchTarget: string;
}

interface Msg {
  id: string;
  role: "bot" | "user";
  text: string;
  success?: boolean;
  chips?: AnalyzeOption[];
  intervalChips?: IntervalOption[];
}

interface IntervalOption {
  label: string;
  seconds: number;
}

type Phase =
  | "scraping"
  | "asking-what"
  | "custom-input"
  | "asking-interval"
  | "done";

const SCRAPE_MESSAGES = [
  "Fetching the page…",
  "Loading content…",
  "Rendering JavaScript…",
  "Parsing the HTML…",
  "Reading the DOM…",
  "Scanning for content…",
  "Analysing structure…",
  "Almost there…",
];

const INTERVALS: IntervalOption[] = [
  { label: "Every hour", seconds: 3600 },
  { label: "Every 6 hours", seconds: 21600 },
  { label: "Daily", seconds: 86400 },
];

interface Props {
  url: string;
  /** Adds the site immediately. Returns the new site id. */
  onAdd: (
    url: string,
    scrapeData: { markdown: string; screenshot: string | null } | null
  ) => Promise<string>;
  /** Patches the already-added site with refinement choices. */
  onPatch: (
    id: string,
    patch: { watchTarget: string | null; refreshInterval: number | null }
  ) => void;
  /** Closes the setup panel (site already in the list). */
  onDone: () => void;
  onCancel: () => void;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function WatchSetup({ url, onAdd, onPatch, onDone, onCancel }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [phase, setPhase] = useState<Phase>("scraping");
  const [watchTarget, setWatchTarget] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [scrapeData, setScrapeData] = useState<{ markdown: string; screenshot: string | null } | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [scrapePhase, setScrapePhase] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const [barTransition, setBarTransition] = useState("none");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Cycle status messages during scrape
  useEffect(() => {
    if (phase !== "scraping") return;
    const id = setInterval(() => setScrapePhase((p) => p + 1), 2200);
    return () => clearInterval(id);
  }, [phase]);

  // Progress bar animation
  useEffect(() => {
    const t1 = setTimeout(() => {
      setBarWidth(72);
      setBarTransition("width 5s cubic-bezier(0.25, 0.46, 0.45, 0.94)");
    }, 50);

    let crawlW = 72;
    let crawlId: ReturnType<typeof setInterval>;
    const t2 = setTimeout(() => {
      crawlId = setInterval(() => {
        crawlW = Math.min(crawlW + 2, 88);
        setBarWidth(crawlW);
        setBarTransition("width 3s ease-out");
        if (crawlW >= 88) clearInterval(crawlId);
      }, 3000);
    }, 5500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(crawlId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushMsg(msg: Omit<Msg, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: genId() }]);
  }

  async function botSay(
    text: string,
    extra?: Partial<Omit<Msg, "id" | "role" | "text">>,
    delayMs = 700
  ) {
    setIsTyping(true);
    await sleep(delayMs);
    setIsTyping(false);
    pushMsg({ role: "bot", text, ...extra });
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      await Promise.resolve();
      if (cancelled) return;

      const slowTimer = setTimeout(() => {
        if (!cancelled) setSlowLoad(true);
      }, 5000);

      let markdown = "";
      let screenshot: string | null = null;
      try {
        const res = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json() as { markdown?: string; screenshot?: string | null };
        markdown = data.markdown ?? "";
        screenshot = data.screenshot ?? null;
      } catch {
        // proceed with empty markdown
      } finally {
        clearTimeout(slowTimer);
      }

      // Complete progress bar
      setBarWidth(100);
      setBarTransition("width 0.6s ease-in-out");

      if (cancelled) return;

      const data = { markdown, screenshot };
      setScrapeData(data);

      // Add immediately with defaults — site is now in the watchlist
      const id = await onAdd(url, data);
      if (cancelled) return;
      setSiteId(id);

      // Analyze for refinement options
      let siteType = "website";
      let options: AnalyzeOption[] = [];
      if (markdown) {
        try {
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markdown }),
          });
          const analyzed = await res.json() as { siteType?: string; options?: AnalyzeOption[] };
          siteType = analyzed.siteType ?? "website";
          options = Array.isArray(analyzed.options) ? analyzed.options : [];
        } catch {
          // fall through
        }
      }

      if (cancelled) return;

      // Transition to chat — success message first
      setPhase("asking-what" as Phase);
      await botSay(
        `Added to your watch list! I'll notify you when anything changes on this ${siteType}.`,
        { success: true },
        400
      );

      if (cancelled) return;

      const chips: AnalyzeOption[] = [
        ...options,
        { label: "Any change", watchTarget: "__any__" },
        { label: "Custom…", watchTarget: "__custom__" },
      ];

      await botSay(
        "Want to watch for something specific?",
        { chips },
        600
      );
      if (!cancelled) setPhase("asking-what");
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChipSelect(chip: AnalyzeOption) {
    setPhase("transitioning" as Phase);
    pushMsg({ role: "user", text: chip.label });

    if (chip.watchTarget === "__skip__") {
      setTimeout(() => onDone(), 300);
      return;
    }

    if (chip.watchTarget === "__custom__") {
      setTimeout(async () => {
        await botSay("What should I watch? Describe it in a few words.", undefined, 400);
        setPhase("custom-input");
      }, 0);
      return;
    }

    const target = chip.watchTarget === "__any__" ? null : chip.watchTarget;
    setWatchTarget(target);

    setTimeout(async () => {
      await botSay("How often should I check?", { intervalChips: INTERVALS }, 400);
      setPhase("asking-interval");
    }, 0);
  }

  function handleCustomSubmit() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    setCustomInput("");
    setWatchTarget(trimmed);
    setPhase("transitioning" as Phase);
    pushMsg({ role: "user", text: trimmed });

    setTimeout(async () => {
      await botSay("How often should I check?", { intervalChips: INTERVALS }, 400);
      setPhase("asking-interval");
    }, 0);
  }

  function handleIntervalSelect(interval: IntervalOption) {
    setPhase("done");
    pushMsg({ role: "user", text: interval.label });

    setTimeout(async () => {
      await botSay("Got it — I'll keep an eye on that for you.", undefined, 400);
      if (siteId) onPatch(siteId, { watchTarget, refreshInterval: interval.seconds });
      await sleep(500);
      onDone();
    }, 0);
  }

  const showWhatChips = phase === "asking-what";
  const showIntervalChips = phase === "asking-interval";
  const isLoading = phase === "scraping";

  // Show Next button when the user hasn't started a refinement sub-flow
  const showNextButton = !isLoading && phase !== "custom-input" && phase !== "asking-interval" && phase !== "done";

  return (
    <div className="max-w-[600px] mx-auto px-6 flex flex-col" style={{ minHeight: "calc(100vh - 64px)" }}>

      {/* ── LOADING SCREEN ── */}
      {isLoading && (
        <div className="flex-1 flex flex-col">
          <div className="pt-8 mb-8">
            <button
              onClick={onCancel}
              className="text-[var(--t3)] hover:text-[var(--t1)] text-sm transition-colors cursor-pointer bg-transparent border-none"
            >
              ← Cancel
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="w-full max-w-[480px] rounded-xl overflow-hidden bg-[var(--bg2)] border border-[var(--bdr)] relative">
              <div
                className="absolute inset-0 origin-left"
                style={{
                  width: `${barWidth}%`,
                  transition: barTransition,
                  background: "rgba(16, 185, 129, 0.22)",
                  borderRight: barWidth < 100 ? "2px solid rgba(16,185,129,0.7)" : "none",
                }}
              />
              <div className="relative px-5 py-3.5 font-mono text-sm text-[var(--t1)] truncate">
                {url}
              </div>
            </div>

            <p
              key={scrapePhase}
              className="text-sm text-[var(--t2)]"
              style={{ animation: "fadeSlideUp 0.4s ease-out both" }}
            >
              {SCRAPE_MESSAGES[scrapePhase % SCRAPE_MESSAGES.length]}
            </p>

            {slowLoad && (
              <p className="text-xs text-[var(--t3)]" style={{ animation: "fadeSlideUp 0.5s ease-out both" }}>
                Some websites take a bit longer — hang tight.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── CHAT SCREEN ── */}
      {!isLoading && (
        <div className="flex flex-col flex-1 pt-6 pb-6" style={{ animation: "fadeSlideUp 0.5s ease-out both" }}>

          {/* Screenshot */}
          {scrapeData?.screenshot && (
            <div className="rounded-2xl overflow-hidden border border-[var(--bdr)] mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scrapeData.screenshot}
                alt={`Screenshot of ${url}`}
                className="w-full object-cover object-top max-h-[380px]"
              />
            </div>
          )}

          {/* Chat messages */}
          <div className="flex flex-col gap-5 flex-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "bot" && (
                  <div className="w-8 h-8 rounded-full bg-[var(--bg2)] border border-[var(--bdr)] flex items-center justify-center text-sm shrink-0 mt-0.5 select-none">
                    🦉
                  </div>
                )}

                <div
                  className={`flex flex-col gap-2.5 max-w-[82%] ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "bot"
                        ? msg.success
                          ? "bg-[var(--bg2)] border border-[var(--green)] text-[var(--t1)] rounded-tl-sm"
                          : "bg-[var(--bg2)] border border-[var(--bdr)] text-[var(--t1)] rounded-tl-sm"
                        : "bg-[var(--blue)] text-white rounded-tr-sm"
                    }`}
                  >
                    {msg.success && (
                      <span className="text-[var(--green)] mr-1.5">✓</span>
                    )}
                    {msg.text}
                  </div>

                  {/* Watch-target chips */}
                  {msg.chips && showWhatChips && (
                    <div className="flex flex-wrap gap-2">
                      {msg.chips.map((chip) => (
                        <button
                          key={chip.watchTarget}
                          onClick={() => handleChipSelect(chip)}
                          className="px-3 py-1.5 rounded-full border border-[var(--bdr)] bg-transparent text-[var(--t2)] text-xs font-medium hover:border-[var(--blue)] hover:text-[var(--blue)] transition-colors cursor-pointer"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Interval chips */}
                  {msg.intervalChips && showIntervalChips && (
                    <div className="flex flex-wrap gap-2">
                      {msg.intervalChips.map((chip) => (
                        <button
                          key={chip.seconds}
                          onClick={() => handleIntervalSelect(chip)}
                          className="px-3 py-1.5 rounded-full border border-[var(--bdr)] bg-transparent text-[var(--t2)] text-xs font-medium hover:border-[var(--blue)] hover:text-[var(--blue)] transition-colors cursor-pointer"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-[var(--bg2)] border border-[var(--bdr)] flex items-center justify-center text-sm shrink-0 select-none">
                  🦉
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[var(--bg2)] border border-[var(--bdr)]">
                  <TypingDots />
                </div>
              </div>
            )}

            {/* Custom input */}
            {phase === "custom-input" && (
              <div className="flex gap-2 pl-11">
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. the shipping cost"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
                  className="flex-1 bg-[var(--bg2)] border border-[var(--bdr)] rounded-xl px-4 py-2 text-sm text-[var(--t1)] placeholder-[var(--t3)] outline-none focus:border-[var(--blue)] transition-colors"
                />
                <button
                  onClick={handleCustomSubmit}
                  className="shrink-0 px-4 py-2 rounded-xl bg-[var(--blue)] text-white text-sm font-semibold cursor-pointer border-none hover:brightness-110 transition-all"
                >
                  OK
                </button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── NEXT BUTTON ── */}
          {showNextButton && (
            <div className="pt-6">
              <button
                onClick={onDone}
                className="w-full py-4 rounded-2xl bg-[var(--blue)] text-white text-base font-semibold cursor-pointer border-none hover:brightness-110 transition-all"
              >
                Start watching →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1 items-center h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[var(--t3)] inline-block"
          style={{
            animation: "typingBounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}
