interface DogLogoProps {
  size?: number;
  alert?: boolean;
}

export default function DogLogo({ size = 40, alert = false }: DogLogoProps) {
  const main = alert ? "#EF4444" : "var(--blue)";
  const face = "var(--t1)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Perked ear */}
      <path
        d="M20 8 C18 3, 10 5, 12 14 L15 24 Q16.5 25.5, 18 24 Z"
        fill={main}
        opacity="0.85"
      />
      {/* Head */}
      <circle cx="28" cy="32" r="18" fill={main} />
      {/* Snout */}
      <ellipse cx="19" cy="36" rx="10" ry="7.5" fill={main} />
      <ellipse cx="19" cy="36" rx="10" ry="7.5" fill="white" opacity="0.15" />
      {/* Nose */}
      <ellipse cx="13" cy="35" rx="3.5" ry="2.5" fill={face} />
      {/* Eye */}
      <circle cx="28" cy="28" r="3.2" fill={face} />
      <circle cx="29.2" cy="27" r="1.3" fill="white" opacity="0.9" />
      {/* Floppy ear */}
      <path
        d="M38 22 C42 17, 50 20, 48 30 L45 40 Q43 43, 40 40 Z"
        fill={main}
        opacity="0.6"
      />
      {/* Mouth */}
      <path
        d="M14 39 Q18 43, 23 39"
        stroke={face}
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
        opacity="0.4"
      />
      {/* Collar */}
      <path
        d="M16 46 Q28 52, 42 44"
        stroke={face}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.2"
      />
      {/* Tag */}
      <circle cx="30" cy="50" r="2.5" fill={face} opacity="0.25" />
      {/* Tail — wags when alert */}
      {alert && (
        <path
          d="M46 38 Q54 28, 52 18"
          stroke={main}
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.5"
          className="animate-tail-wag"
          style={{ transformOrigin: "46px 38px" }}
        />
      )}
    </svg>
  );
}
