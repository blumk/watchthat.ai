const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    highlight: false,
    cta: "Start watching",
    features: [
      "2 watched websites",
      "5 refreshes per day",
      "Change history",
      "Markdown & screenshot preview",
    ],
    missing: ["Stealth mode", "CAPTCHA solving", "Hourly refresh"],
  },
  {
    name: "Pro",
    price: "$19",
    period: "per month",
    highlight: true,
    cta: "Start free trial",
    features: [
      "1,000 watched websites",
      "Hourly refresh",
      "Stealth mode",
      "CAPTCHA solving",
      "Change history",
      "Markdown & screenshot preview",
    ],
    missing: ["Advanced stealth", "Residential proxies"],
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    highlight: false,
    cta: "Talk to us",
    features: [
      "Unlimited websites",
      "Custom refresh intervals",
      "Advanced stealth mode",
      "Residential proxy network",
      "CAPTCHA solving",
      "Priority support & SLA",
    ],
    missing: [],
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="max-w-[960px] mx-auto px-6 py-20">
      <h2 className="text-[20px] font-extrabold tracking-tight mb-2 text-center text-[var(--t1)]">
        Pricing
      </h2>
      <p className="text-[13px] text-[var(--t2)] text-center mb-10">
        Simple, transparent pricing. No credit card required to start.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl border p-7 flex flex-col ${
              plan.highlight
                ? "border-[rgba(59,130,246,0.5)] bg-[var(--blue-g)]"
                : "border-[var(--bdr)] bg-[var(--bg3)]"
            }`}
          >
            {plan.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--blue)] text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full">
                Most popular
              </div>
            )}
            <div className="mb-5">
              <div className="text-[13px] font-semibold text-[var(--t2)] tracking-wide uppercase mb-1">
                {plan.name}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[32px] font-black text-[var(--t1)] leading-none">
                  {plan.price}
                </span>
                <span className="text-[12px] text-[var(--t3)]">{plan.period}</span>
              </div>
            </div>
            <ul className="flex-1 space-y-2.5 mb-6">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-[var(--t2)]">
                  <span className="text-[var(--blue)] mt-px leading-none">✓</span>
                  {f}
                </li>
              ))}
              {plan.missing.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-[var(--t3)] opacity-40">
                  <span className="mt-px leading-none">–</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              className={`w-full py-3 rounded-xl text-[14px] font-bold transition-all duration-200 ${
                plan.highlight
                  ? "bg-[var(--blue)] text-white hover:brightness-110"
                  : "bg-[var(--bg2)] border border-[var(--bdr)] text-[var(--t1)] hover:border-[rgba(59,130,246,0.3)]"
              }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
