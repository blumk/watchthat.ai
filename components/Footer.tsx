import DogLogo from "./DogLogo";

export default function Footer() {
  return (
    <footer className="px-6 py-10 border-t border-[var(--bdr)] text-xs text-[var(--t3)] font-mono">
      <div className="text-center mb-4">WatchThat – Web Change Monitor.</div>
      <p className="max-w-[680px] mx-auto text-center text-[10px] leading-relaxed opacity-80">
        <span className="inline-block align-middle mr-1.5">
          <DogLogo size={16} />
        </span>
        <span className="text-[var(--t2)]">Good-bot disclaimer:</span>{" "}
        like Google and other well-behaved bots, WatchThat follows
        international guidelines for respectful, non-intrusive, ethical
        crawling. We fetch pages at a low frequency to protect site bandwidth.
        We store only publicly available information, respecting copyright and
        solely to notify end users when a change occurs.
      </p>
    </footer>
  );
}
