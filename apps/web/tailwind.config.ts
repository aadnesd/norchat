import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--surface-paper)",
        raised: "var(--surface-raised)",
        sunken: "var(--surface-sunken)",
        inverse: "var(--surface-inverse)",
        ink: {
          DEFAULT: "var(--ink-primary)",
          primary: "var(--ink-primary)",
          secondary: "var(--ink-secondary)",
          tertiary: "var(--ink-tertiary)",
          quaternary: "var(--ink-quaternary)",
          inverse: "var(--ink-inverse)"
        },
        accent: {
          DEFAULT: "var(--accent-ink)",
          ink: "var(--accent-ink)",
          interactive: "var(--accent-interactive)",
          wash: "var(--accent-wash)",
          edge: "var(--accent-edge)"
        },
        hairline: "var(--border-hairline)",
        strong: "var(--border-strong)"
      },
      fontFamily: {
        display: ["STIX Two Text", "Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
        body: ["Host Grotesk", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "Menlo", "Consolas", "monospace"]
      },
      fontSize: {
        meta: ["var(--type-meta)", { lineHeight: "1.3" }],
        micro: ["var(--type-micro)", { lineHeight: "1.3" }],
        "body-sm": ["var(--type-body-sm)", { lineHeight: "1.4" }],
        "body-lg": ["var(--type-body-lg)", { lineHeight: "1.6" }],
        "display-sm": ["var(--type-display-sm)", { lineHeight: "1.15" }],
        "display-md": ["var(--type-display-md)", { lineHeight: "1.15" }],
        "display-lg": ["var(--type-display-lg)", { lineHeight: "1.1" }],
        "display-xl": ["var(--type-display-xl)", { lineHeight: "1.05" }]
      },
      letterSpacing: {
        eyebrow: "var(--tracking-eyebrow)",
        display: "var(--tracking-display)"
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)"
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        emphasized: "var(--ease-emphasized)"
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
        slow: "260ms"
      }
    }
  },
  plugins: []
};

export default config;
