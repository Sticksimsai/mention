import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark, slightly warm neutrals with the coin's gold as the accent.
        ink: "#0E0D0A",
        surface: "#17150F",
        raised: "#221F17",
        line: "#383224",
        fg: "#F7F3E8",
        muted: "#B4AD9B",
        volt: "#F2B416",
        "volt-deep": "#D2940A",
        up: "#3DD68C",
        down: "#FF6B6B",
      },
      fontFamily: {
        display: ["StairsNSlabs", "Cocogoose", "system-ui", "sans-serif"],
        body: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
