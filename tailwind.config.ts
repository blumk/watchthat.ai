import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        bg: "var(--bg)",
        bg2: "var(--bg2)",
        bg3: "var(--bg3)",
        t1: "var(--t1)",
        t2: "var(--t2)",
        t3: "var(--t3)",
        brand: "var(--blue)",
        "brand-g": "var(--blue-g)",
        border: "var(--bdr)",
        "border-focus": "var(--bdr-f)",
        danger: "var(--red)",
        success: "var(--green)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        spin: {
          to: { transform: "rotate(360deg)" },
        },
        tailWag: {
          "0%, 100%": { transform: "rotate(-6deg)" },
          "50%": { transform: "rotate(6deg)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out both",
        pulse: "pulse 2s infinite",
        spin: "spin 1s linear infinite",
        "tail-wag": "tailWag 0.35s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
