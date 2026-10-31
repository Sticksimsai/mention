import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#000000",
        surface: "#0E1116",
        raised: "#161B22",
        line: "#1F242B",
        fg: "#E7EAEE",
        muted: "#8B939E",
        ember: "#FFA03C",
        "ember-deep": "#E8822A",
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
