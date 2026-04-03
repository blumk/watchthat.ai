const features = [
  {
    icon: "🔕",
    title: "Subscribe & forget",
    desc: "Add a URL once. Watchdog monitors and barks only when something changes.",
  },
  {
    icon: "📝",
    title: "Smart diffs",
    desc: "See exactly what changed — added, modified, or removed content.",
  },
  {
    icon: "💾",
    title: "Persistent memory",
    desc: "Watched sites and snapshots persist across sessions. Always on guard.",
  },
];

export default function FeatureCards() {
  return (
    <section
      id="features"
      className="max-w-[900px] mx-auto px-6 py-16 grid grid-cols-1 sm:grid-cols-3 gap-4"
    >
      {features.map((f, i) => (
        <div
          key={f.title}
          className="bg-[var(--bg3)] border border-[var(--bdr)] rounded-2xl p-6 transition-all duration-300 hover:border-[rgba(59,130,246,0.2)] hover:bg-[var(--blue-g)] hover:-translate-y-0.5 animate-[fadeIn_0.3s_ease-out_both]"
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          <div className="text-[22px] mb-2.5">{f.icon}</div>
          <div className="text-sm font-bold mb-1 tracking-tight text-[var(--t1)]">
            {f.title}
          </div>
          <div className="text-[12.5px] text-[var(--t2)] leading-relaxed">
            {f.desc}
          </div>
        </div>
      ))}
    </section>
  );
}
