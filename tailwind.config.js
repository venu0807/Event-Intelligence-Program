/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Sora'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'DM Mono'", "monospace"],
      },
      colors: {
        navy: {
          50:  "#eef3ff",
          100: "#dce6fe",
          200: "#b9cdfe",
          300: "#7ba6fd",
          400: "#3b7bfa",
          500: "#1a57f0",
          600: "#0d3edd",
          700: "#0e30b8",
          800: "#112b95",
          900: "#142974",
          950: "#0a0f2e",
        },
        ink: {
          50:  "#f0f4ff",
          100: "#e0e8ff",
          200: "#c7d4f8",
          300: "#9fb3f0",
          400: "#6e8ae5",
          500: "#4a67d9",
          600: "#3550cc",
          700: "#2c41b2",
          800: "#283891",
          900: "#263277",
          950: "#0b0e2e",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease forwards",
        "slide-up": "slideUp 0.5s ease forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(59,130,246,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
    },
  },
  plugins: [],
};
