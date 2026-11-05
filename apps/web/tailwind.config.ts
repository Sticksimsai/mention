import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101010",
        surface: "#191919",
        raised: "#242424",
        line: "#353535",
        fg: "#F5F5F5",
        muted: "#B0B0B0",
        volt: "#FFFFFF",
        "volt-deep": "#CDCDCD",
        up: "#EBEBEB",
        down: "#BBBBBB",
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
