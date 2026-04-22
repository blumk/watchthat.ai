"use client";

type Node = { label: string; sub: string; icon: string };

const ingest: Node[] = [
  { label: "Web crawlers", sub: "Firecrawl · Playwright", icon: "🕸" },
  { label: "REST & GraphQL", sub: "Any public endpoint", icon: "🔌" },
  { label: "MCP servers", sub: "Agent-native inputs", icon: "🧠" },
];

const platform: Node[] = [
  { label: "Scheduler", sub: "Cron, dedup, backoff", icon: "⏱" },
  { label: "Object store", sub: "Snapshots + history", icon: "🗃" },
  { label: "Diff intelligence", sub: "Semantic change model", icon: "✨" },
];

const subscribe: Node[] = [
  { label: "REST API", sub: "Pull latest diff", icon: "🔁" },
  { label: "MCP tool", sub: "Plug into any agent", icon: "🧩" },
  { label: "Feed & email", sub: "Push notifications", icon: "🔔" },
];

function Chip({ node, delay }: { node: Node; delay: number }) {
  return (
    <div
      className="flex items-center gap-3 bg-[var(--bg3)] border border-[var(--bdr)] rounded-xl px-3.5 py-3 opacity-0"
      style={{ animation: `pdFadeIn 0.6s ease-out forwards ${delay}s` }}
    >
      <span className="text-[18px] leading-none shrink-0">{node.icon}</span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[var(--t1)] leading-tight">
          {node.label}
        </div>
        <div className="text-[11px] text-[var(--t3)] mt-0.5 truncate">
          {node.sub}
        </div>
      </div>
    </div>
  );
}

function Column({
  title,
  nodes,
  highlight,
  baseDelay,
}: {
  title: string;
  nodes: Node[];
  highlight?: boolean;
  baseDelay: number;
}) {
  return (
    <div
      className={`relative rounded-2xl p-5 flex flex-col gap-3 ${
        highlight
          ? "bg-[var(--blue-g)] border border-[rgba(59,130,246,0.35)]"
          : "bg-[var(--bg2)] border border-[var(--bdr)]"
      }`}
    >
      <div
        className={`text-[10px] font-extrabold uppercase tracking-[0.2em] mb-1 ${
          highlight ? "text-[var(--blue)]" : "text-[var(--t3)]"
        }`}
      >
        {title}
      </div>
      {nodes.map((n, i) => (
        <Chip key={n.label} node={n} delay={baseDelay + i * 0.08} />
      ))}
    </div>
  );
}

function Flow({ delay }: { delay: number }) {
  return (
    <div
      className="relative hidden md:flex items-center justify-center h-full min-h-[40px]"
      aria-hidden="true"
    >
      <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[var(--bdr)] to-transparent" />
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--blue)] shadow-[0_0_8px_rgba(59,130,246,0.8)]"
          style={{
            animation: `pdFlow 2.8s linear infinite`,
            animationDelay: `${delay + i * 0.9}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function PlatformDiagram() {
  return (
    <div
      role="img"
      aria-label="WatchThat platform architecture: ingestion feeds the agentic platform, which serves subscribers over APIs, MCP, and notifications."
      className="relative"
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_48px_1fr_48px_1fr] gap-4 md:gap-0 md:gap-x-2 items-stretch">
        <Column title="Ingest" nodes={ingest} baseDelay={0.1} />
        <Flow delay={0.2} />
        <Column title="Platform" nodes={platform} highlight baseDelay={0.5} />
        <Flow delay={0.6} />
        <Column title="Subscribe" nodes={subscribe} baseDelay={0.9} />
      </div>
    </div>
  );
}
