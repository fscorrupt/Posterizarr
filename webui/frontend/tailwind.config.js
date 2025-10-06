/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "theme-primary": "var(--theme-primary)",
        "theme-primary-hover": "var(--theme-primary-hover)",
        "theme-accent": "var(--theme-accent)",
        "theme-bg": "var(--theme-bg)",
        "theme-bg-dark": "var(--theme-bg-dark)",
        "theme-bg-card": "var(--theme-bg-card)",
        "theme-bg-hover": "var(--theme-bg-hover)",
        "theme-border": "var(--theme-border)",
        "theme-text": "var(--theme-text)",
        "theme-text-muted": "var(--theme-text-muted)",
      },
    },
  },
  plugins: [],
};
