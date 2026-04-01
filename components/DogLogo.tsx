interface DogLogoProps {
  size?: number;
  alert?: boolean;
}

export default function DogLogo({ size = 40, alert = false }: DogLogoProps) {
  const body = alert ? "#ef4444" : "var(--blue)";
  const bodyHex = alert ? "#ef4444" : "#3b82f6";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Ear tufts */}
      <path d="M17 24 L11 9 L24 19Z" fill={body} />
      <path d="M47 24 L53 9 L40 19Z" fill={body} />

      {/* Body / head */}
      <ellipse cx="32" cy="40" rx="23" ry="21" fill={body} />

      {/* Left eye white */}
      <circle cx="21" cy="33" r="10" fill="white" />
      {/* Left iris */}
      <circle cx="21" cy="33" r="6" fill="#1e293b" />
      {/* Left highlight */}
      <circle cx="24" cy="30" r="2.5" fill="white" opacity="0.85" />

      {/* Right eye white */}
      <circle cx="43" cy="33" r="10" fill="white" />
      {/* Right iris */}
      <circle cx="43" cy="33" r="6" fill="#1e293b" />
      {/* Right highlight */}
      <circle cx="46" cy="30" r="2.5" fill="white" opacity="0.85" />

      {/* Beak */}
      <path d="M27 42 L32 49 L37 42Z" fill="#f59e0b" />

      {/* Subtle wing texture lines */}
      <path d="M10 48 Q18 55 32 57 Q46 55 54 48" stroke={bodyHex} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.35" />

      {/* Alert: notification dot */}
      {alert && (
        <circle cx="54" cy="12" r="8" fill="#ef4444" data-testid="alert-dot" />
      )}
    </svg>
  );
}
