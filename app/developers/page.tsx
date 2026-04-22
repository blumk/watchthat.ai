import type { Metadata } from "next";
import Link from "next/link";
import DogLogo from "@/components/DogLogo";
import Footer from "@/components/Footer";
import PlatformDiagram from "@/components/PlatformDiagram";

export const metadata: Metadata = {
  title: "Developers · WatchThat",
  description:
    "WatchThat turns the internet into an event stream. A platform for developers and agents that ingests web, API, and MCP sources and emits structured change events.",
};

const audienceCards = [
  {
    tag: "For developers",
    title: "Stop polling. Start subscribing.",
    body:
      "Skip the scraping stack. Point WatchThat at any URL, endpoint, or MCP server and consume diffs over REST, MCP, or webhooks.",
    cta: { label: "Read the docs", href: "/developers#api" },
  },
  {
    tag: "For agent builders",
    title: "Give your agent long-term senses.",
    body:
      "LLMs are blind between prompts. WatchThat is the persistent eyes — cron, storage, and semantic diffs, exposed as native MCP tools.",
    cta: { label: "Try the MCP server", href: "/developers#mcp" },
  },
  {
    tag: "For investors",
    title: "The event bus for the agentic web.",
    body:
      "Every AI workflow needs fresh, structured signal. We sit between the open web and the agent stack — a low-cost moat compounding with every watched page.",
    cta: { label: "Talk to the team", href: "mailto:hello@watchthat.app" },
  },
];

const pillars = [
  {
    title: "Ingestion-agnostic",
    body:
      "Headless browsers, REST/GraphQL, RSS, MCP servers — anything that emits state. One contract downstream.",
  },
  {
    title: "Agent-native output",
    body:
      "First-class MCP tool server so Claude, ChatGPT, Cursor and custom agents subscribe the same way they call any other tool.",
  },
  {
    title: "Semantic diffs",
    body:
      "We don't just hash bytes. A small model writes a human description and a major/minor/quiet classification for every change.",
  },
  {
    title: "Dedup by design",
    body:
      "URL-level fetch coalescing across all users means one scrape serves thousands of subscribers — marginal cost collapses with scale.",
  },
];

const stats = [
  { value: "3", label: "Ingest surfaces (web, API, MCP)" },
  { value: "5 min", label: "Fetch dedup window, all users" },
  { value: "< 1s", label: "Diff to notification" },
];

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] overflow-x-hidden">
      <nav className="flex items-center justify-between max-w-[1080px] mx-auto px-6 py-5">
        <Link
          href="/"
          aria-label="WatchThat"
          className="flex items-center gap-2.5 text-[20px] font-extrabold tracking-tight text-[var(--t1)]"
        >
          <DogLogo size={30} />
          <span className="tracking-tight">
            Watch<span className="text-[var(--blue)]">That</span>
          </span>
        </Link>
        <div className="hidden sm:flex items-center gap-7 text-sm font-medium text-[var(--t2)]">
          <Link href="/#how" className="hover:text-[var(--t1)] transition-colors">
            How it works
          </Link>
          <Link href="/#pricing" className="hover:text-[var(--t1)] transition-colors">
            Pricing
          </Link>
          <span className="text-[var(--t1)] font-semibold">Developers</span>
        </div>
      </nav>

      <section className="max-w-[920px] mx-auto px-6 pt-12 pb-10 text-center">
        <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--blue)] bg-[var(--blue-g)] border border-[rgba(59,130,246,0.25)] rounded-full px-3 py-1 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--blue)] animate-pulse" />
          Platform preview
        </div>
        <h1 className="text-[40px] sm:text-[56px] font-black tracking-tight leading-[1.05] text-[var(--t1)] mb-5">
          Turn the internet
          <br />
          into an event stream.
        </h1>
        <p className="max-w-[640px] mx-auto text-[16px] text-[var(--t2)] leading-relaxed mb-8">
          WatchThat ingests the web, APIs, and MCP sources, stores every snapshot,
          and emits semantic change events to humans and agents. One pipeline from
          &ldquo;did this page change?&rdquo; to &ldquo;tell my agent.&rdquo;
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="mailto:hello@watchthat.app?subject=WatchThat%20platform%20access"
            className="px-5 py-3 rounded-xl bg-[var(--blue)] text-white text-sm font-bold hover:brightness-110 transition-all"
          >
            Get platform access →
          </a>
          <Link
            href="/"
            className="px-5 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--bdr)] text-[var(--t1)] text-sm font-semibold hover:border-[rgba(59,130,246,0.4)] transition-colors"
          >
            See the consumer app
          </Link>
        </div>
      </section>

      <section className="max-w-[1080px] mx-auto px-6 pt-4 pb-16">
        <div className="rounded-3xl border border-[var(--bdr)] bg-[var(--bg2)] p-6 sm:p-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--t3)] mb-1">
                Architecture
              </div>
              <div className="text-[18px] font-bold text-[var(--t1)]">
                One platform. Three surfaces.
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-[var(--t3)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />
              Live
            </div>
          </div>
          <PlatformDiagram />
          <p className="max-w-[680px] mx-auto text-center text-[12px] text-[var(--t3)] leading-relaxed mt-8">
            Sources feed a shared snapshot store. Every fetch is deduped across all
            subscribers; every diff is classified and described. Agents and humans
            read the same stream.
          </p>
        </div>
      </section>

      <section className="max-w-[1080px] mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {audienceCards.map((c) => (
            <div
              key={c.tag}
              className="rounded-2xl border border-[var(--bdr)] bg-[var(--bg3)] p-6 flex flex-col"
            >
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--blue)] mb-3">
                {c.tag}
              </div>
              <h3 className="text-[18px] font-extrabold text-[var(--t1)] leading-tight mb-3">
                {c.title}
              </h3>
              <p className="text-[13px] text-[var(--t2)] leading-relaxed flex-1 mb-5">
                {c.body}
              </p>
              <a
                href={c.cta.href}
                className="text-[13px] font-semibold text-[var(--blue)] hover:brightness-125"
              >
                {c.cta.label} →
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-[920px] mx-auto px-6 pb-16">
        <div className="text-center mb-10">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--t3)] mb-2">
            Why now
          </div>
          <h2 className="text-[28px] sm:text-[36px] font-black tracking-tight text-[var(--t1)] leading-[1.1] mb-4">
            Agents need an event stream.
            <br />
            The web doesn&apos;t have one.
          </h2>
          <p className="max-w-[640px] mx-auto text-[14px] text-[var(--t2)] leading-relaxed">
            Every AI product above the model layer is quietly building the same
            hack: a cron job, a diff, a notification. WatchThat is that
            infrastructure, done once, shared across the stack.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-[var(--bdr)] bg-[var(--bg3)] p-5 text-center"
            >
              <div className="text-[28px] font-black tracking-tight text-[var(--t1)] leading-none mb-2">
                {s.value}
              </div>
              <div className="text-[11px] text-[var(--t3)] leading-tight">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-[1080px] mx-auto px-6 pb-20">
        <div className="text-center mb-10">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--t3)] mb-2">
            Principles
          </div>
          <h2 className="text-[24px] sm:text-[28px] font-extrabold tracking-tight text-[var(--t1)]">
            Built like infrastructure, priced like a utility.
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-[var(--bdr)] bg-[var(--bg2)] p-6"
            >
              <div className="text-[15px] font-bold text-[var(--t1)] mb-2">
                {p.title}
              </div>
              <div className="text-[13px] text-[var(--t2)] leading-relaxed">
                {p.body}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-[720px] mx-auto px-6 pb-24 text-center">
        <h2 className="text-[24px] sm:text-[32px] font-black tracking-tight text-[var(--t1)] mb-4">
          Let&apos;s wire your agent into the web.
        </h2>
        <p className="text-[14px] text-[var(--t2)] leading-relaxed mb-6">
          Early access is open to developers and design partners. Investors, say
          hi — we&apos;re selective about who we bring on.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="mailto:hello@watchthat.app?subject=WatchThat%20early%20access"
            className="px-5 py-3 rounded-xl bg-[var(--blue)] text-white text-sm font-bold hover:brightness-110 transition-all"
          >
            hello@watchthat.app
          </a>
          <Link
            href="/"
            className="px-5 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--bdr)] text-[var(--t1)] text-sm font-semibold hover:border-[rgba(59,130,246,0.4)] transition-colors"
          >
            Back to the app
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
