import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#121212",
        surface: "#191B18",
        raised: "#22251F",
        line: "#2B2E28",
        fg: "#ECEFE6",
        muted: "#99A18F",
        volt: "#9BF000",
        "volt-deep": "#7FCC00",
        up: "#22C55E",
        down: "#EF4444",
      },
      fontFamily: {
        display: ["Unbounded", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
