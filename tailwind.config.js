/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          red: "#e83a5d",
          purple: "#9333ea",
          "purple-light": "#a855f7",
          "purple-deep": "#7c22c9",
        },
        surface: {
          50: "#f8f8fa",
          100: "#ededf2",
          200: "#d4d4de",
          300: "#a1a1b5",
          400: "#71718a",
          500: "#52526b",
          600: "#3a3a52",
          700: "#25253a",
          800: "#1a1a2e",
          850: "#141428",
          900: "#0f0f20",
          950: "#0a0a16",
        },
      },
    },
  },
  plugins: [],
};
