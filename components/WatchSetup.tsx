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
  onComplete: (
    url: string,
    opts: { watchTarget: string | null; refreshInterval: number | null; scrapeData?: { markdown: string; screenshot: string | null } | null }
  ) => void;
  onCancel: () => void;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function WatchSetup({ url, onComplete, onCancel }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [phase, setPhase] = useState<Phase>("scraping");
  const [watchTarget, setWatchTarget] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [scrapeData, setScrapeData] = useState<{ markdown: string; screenshot: string | null } | null>(null);
  const [scrapePhase, setScrapePhase] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (phase !== "scraping" || !isTyping) return;
    const id = setInterval(() => setScrapePhase((p) => p + 1), 2200);
    return () => clearInterval(id);
  }, [phase, isTyping]);

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
      await Promise.resolve(); // yield so StrictMode cleanup can cancel before first render
      if (cancelled) return;
      pushMsg({ role: "bot", text: `Let me check out ${url}…` });
      setIsTyping(true);

      const slowTimer = setTimeout(() => {
        if (!cancelled) pushMsg({ role: "bot", text: "Hang tight… some websites take a bit longer to load." });
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

      if (!cancelled) setScrapeData({ markdown, screenshot });

      if (cancelled) return;

      let siteType = "website";
      let options: AnalyzeOption[] = [];

      if (markdown) {
        try {
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, markdown }),
          });
          const data = await res.json() as { siteType?: string; options?: AnalyzeOption[] };
          siteType = data.siteType ?? "website";
          options = Array.isArray(data.options) ? data.options : [];
        } catch {
          // fall through to generic options
        }
      }

      if (cancelled) return;
      setIsTyping(false);

      const chips: AnalyzeOption[] = [
        ...options,
        { label: "Any change", watchTarget: "__any__" },
        { label: "Custom…", watchTarget: "__custom__" },
      ];

      await botSay(
        `Looks like a ${siteType}. What should I watch for you?`,
        { chips },
        500
      );
      if (!cancelled) setPhase("asking-what");
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChipSelect(chip: AnalyzeOption) {
    // Disable chips once one is selected
    setPhase("transitioning" as Phase);
    pushMsg({ role: "user", text: chip.label });

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
      await botSay(
        `On it! I'll watch that and let you know when something changes.`,
        undefined,
        400
      );
      await sleep(600);
      onComplete(url, { watchTarget, refreshInterval: interval.seconds, scrapeData });
    }, 0);
  }

  const showWhatChips = phase === "asking-what";
  const showIntervalChips = phase === "asking-interval";

  return (
    <div className="max-w-[600px] mx-auto px-6 pt-8 pb-6 flex flex-col" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={onCancel}
          className="text-[var(--t3)] hover:text-[var(--t1)] text-sm transition-colors cursor-pointer bg-transparent border-none shrink-0"
        >
          ← Back
        </button>
        <span className="text-[var(--t3)] text-sm font-mono truncate">{url}</span>
      </div>

      {/* Chat messages */}
      <div className="flex flex-col gap-5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "bot" && (
              <div className="w-8 h-8 rounded-full bg-[var(--bg2)] border border-[var(--bdr)] flex items-center justify-center text-sm shrink-0 mt-0.5 select-none">
                🐕
              </div>
            )}

            <div
              className={`flex flex-col gap-2.5 max-w-[82%] ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "bot"
                    ? "bg-[var(--bg2)] border border-[var(--bdr)] text-[var(--t1)] rounded-tl-sm"
                    : "bg-[var(--blue)] text-white rounded-tr-sm"
                }`}
              >
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
              🐕
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[var(--bg2)] border border-[var(--bdr)]">
              {phase === "scraping"
                ? <span className="text-sm text-[var(--t2)]">{SCRAPE_MESSAGES[scrapePhase % SCRAPE_MESSAGES.length]}</span>
                : <TypingDots />}
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
