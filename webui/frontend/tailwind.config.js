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
      keyframes: {
        slideIn: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        slideIn: "slideIn 0.3s ease-out",
        fadeIn: "fadeIn 0.2s ease-out",
        scaleIn: "scaleIn 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
