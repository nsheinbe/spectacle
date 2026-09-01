import type { Config } from "tailwindcss";

// Design tokens live in src/styles/tokens.css as CSS custom properties;
// Tailwind maps semantic names onto them. No raw hex in components —
// `beam` is the only accent.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // platform chrome (rail, dashboard, workspace)
        ink: "var(--color-ink)",
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        deep: "var(--color-deep)",
        line: "var(--color-line)",
        text: "var(--color-text)",
        "text-strong": "var(--color-text-strong)",
        "text-muted": "var(--color-text-muted)",
        "text-faint": "var(--color-text-faint)",
        beam: "var(--color-beam)",
        "beam-hover": "var(--color-beam-hover)",
        "beam-soft": "var(--color-beam-soft)",
        "beam-wash": "var(--color-beam-wash)",
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        // stage-scoped (set per-theme under [data-stage])
        "stage-canvas": "var(--stage-canvas)",
        "stage-surface": "var(--stage-surface)",
        "stage-text": "var(--stage-text)",
        "stage-text-muted": "var(--stage-text-muted)",
        "stage-text-faint": "var(--stage-text-faint)",
        "stage-accent": "var(--stage-accent)",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        lg: "12px",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      aspectRatio: {
        card: "4 / 5",
      },
    },
  },
  plugins: [],
};

export default config;
