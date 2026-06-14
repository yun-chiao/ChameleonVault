import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cyberpunk / Mantle war-room palette
        void: "#0A0A0A",
        panel: "#0F0F11",
        neon: "#00FF66", // Mantle neon green
        cyber: {
          purple: "#A855F7",
          yellow: "#FACC15",
          red: "#FF4D4D",
          blue: "#38BDF8",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        neon: "0 0 8px rgba(0,255,102,0.6), 0 0 24px rgba(0,255,102,0.25)",
        "neon-purple": "0 0 8px rgba(168,85,247,0.6), 0 0 24px rgba(168,85,247,0.25)",
      },
      keyframes: {
        flicker: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        flicker: "flicker 2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
