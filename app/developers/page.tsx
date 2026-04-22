import type { Metadata } from "next";
import Link from "next/link";
import DogLogo from "@/components/DogLogo";
import Footer from "@/components/Footer";
import PlatformDiagram from "@/components/PlatformDiagram";

export const metadata: Metadata = {
  title: "Developers · WatchThat",
  description:
    "WatchThat is an agentic platform that uses and remembers the web for you and your agents to consume. Smart web monitoring is the first product; the platform is built for more.",
};

const audienceCards = [
  {
    tag: "For developers",
    title: "Point at a URL. Get a stream.",
    body:
      "Skip the scraping stack. WatchThat handles fetching, storage, and diffs — you handle what to do with them.",
    cta: { label: "Read the docs", href: "/developers#api" },
  },
  {
    tag: "For agent builders",
    title: "Give your agent memory of the web.",
    body:
      "LLMs are blind between prompts. WatchThat is the persistent eyes and memory — always on, always remembering, ready when your agent asks.",
    cta: { label: "Try the MCP server", href: "/developers#mcp" },
  },
  {
    tag: "For investors",
    title: "The memory layer for the agentic web.",
    body:
      "Every AI product above the model layer quietly rebuilds the same thing: watch, remember, explain. We built it once — web monitoring is the wedge, the surface compounds from there.",
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
  { value: "24/7", label: "Agents watching, so you don't have to" },
  { value: "∞", label: "Every version remembered, forever" },
  { value: "1 min → daily", label: "Custom watch intervals" },
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
          The agentic platform
          <br />
          that remembers the web.
        </h1>
        <p className="max-w-[560px] mx-auto text-[16px] text-[var(--t2)] leading-relaxed mb-4">
          WatchThat watches the web for you and your agents — and remembers
          what it saw.
        </p>
        <p className="max-w-[520px] mx-auto text-[13px] text-[var(--t3)] leading-relaxed mb-8">
          Smart web monitoring is our first product.
          <span className="text-[var(--t2)]"> The platform is built for more.</span>
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
            Agents watch the web continuously, like humans would — but tirelessly.
            Every version goes into a shared memory. Every change is explained.
            Agents and humans read from the same memory.
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
            Agents need memory and senses.
            <br />
            The web gives them neither.
          </h2>
          <p className="max-w-[640px] mx-auto text-[14px] text-[var(--t2)] leading-relaxed">
            The open web is stateless — every fetch starts from scratch. Agents
            aren&apos;t. WatchThat watches for you, remembers what it saw, and
            hands that memory back when you or your agent asks.
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
          Plug your agent into web memory.
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
