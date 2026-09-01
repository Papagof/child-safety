/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f6fb",
          100: "#e6ebf5",
          200: "#c7d3e8",
          300: "#9fb1d6",
          400: "#7188bf",
          500: "#4f67a8",
          600: "#3d518a",
          700: "#334270",
          800: "#2c375c",
          900: "#28304e",
        },
        urgent: {
          50: "#fef2f2",
          500: "#ef4444",
          600: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};
