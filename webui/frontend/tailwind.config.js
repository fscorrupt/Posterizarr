/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  safelist: [
    // Stelle sicher, dass die Log-Level Farben NIEMALS entfernt werden
    "text-red-400",
    "text-yellow-400",
    "text-cyan-400",
    "text-green-400",
    "text-purple-400",
    "text-gray-400",
    "text-gray-300",
    "text-gray-500",
    "text-gray-600",
    "font-bold",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
