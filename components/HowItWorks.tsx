const steps = [
  {
    n: "1",
    title: "Paste a URL",
    desc: "Enter the website you want to monitor in the search bar.",
  },
  {
    n: "2",
    title: "Snapshot taken",
    desc: "Watchthis fetches the page and creates a content fingerprint.",
  },
  {
    n: "3",
    title: "Get alerted",
    desc: "When content changes, Watchthis barks and shows you what's different.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="max-w-[720px] mx-auto px-6 pt-16 pb-8">
      <h2 className="text-[20px] font-extrabold tracking-tight mb-6 text-center text-[var(--t1)]">
        How it works
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {steps.map((s) => (
          <div
            key={s.n}
            className="bg-[var(--bg3)] border border-[var(--bdr)] rounded-[14px] p-6 text-center"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--blue-g)] border border-[rgba(59,130,246,0.2)] text-[var(--blue)] font-extrabold text-sm inline-flex items-center justify-center mb-3">
              {s.n}
            </div>
            <div className="text-sm font-bold mb-1 text-[var(--t1)]">
              {s.title}
            </div>
            <div className="text-xs text-[var(--t2)] leading-relaxed">
              {s.desc}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
