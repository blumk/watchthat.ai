import DogLogo from "./DogLogo";

export default function Nav() {
  return (
    <nav className="flex items-center justify-between max-w-[1080px] mx-auto px-6 py-5">
      <div className="flex items-center gap-2.5 text-[20px] font-extrabold tracking-tight text-[var(--t1)]">
        <DogLogo size={30} />
        Watchdog
      </div>
      <div className="hidden sm:flex gap-7 text-sm font-medium text-[var(--t2)]">
        <a
          href="#features"
          className="hover:text-[var(--t1)] transition-colors duration-200"
        >
          Features
        </a>
        <a
          href="#how"
          className="hover:text-[var(--t1)] transition-colors duration-200"
        >
          How it works
        </a>
      </div>
    </nav>
  );
}
