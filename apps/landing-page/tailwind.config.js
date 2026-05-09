/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Google Sans Text"',
          '"Product Sans"',
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        flex: ['"Google Sans Flex"', "sans-serif"],
      },
      colors: {
        bg: "var(--bg)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-tertiary": "var(--bg-tertiary)",
        card: "var(--card-bg)",
        text: "var(--text)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        border: "var(--border-color)",
      },
      animation: {
        "fade-in-up": "fadeInUp 0.8s ease-out forwards",
        twinkle: "twinkle 3s ease-in-out infinite",
        "twinkle-4pt": "twinkle-4pt 4s ease-in-out infinite",
        float: "float 20s ease-in-out infinite",
        "wave-ring": "waveRing 4s ease-out infinite",
        shine: "shine 3s ease-in-out infinite",
        "soft-pulse": "softPulse 3s ease-in-out infinite",
        "soft-pulse-light": "softPulseLight 3s ease-in-out infinite",
        pulse: "pulse 2s ease-in-out infinite",
        "slide-down": "slideDownMenu 0.3s ease-out",
        "luna-pulse": "lunaPulse 3s ease-in-out infinite",
        "luna-float": "lunaFloat 4s ease-in-out infinite",
        "pulse-lilac": "pulse-lilac 2s ease-in-out infinite",
        "pulse-lilac-banner": "pulse-lilac-banner 3s ease-in-out infinite",
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.3", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.2)" },
        },
        "twinkle-4pt": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1) rotate(0deg)" },
          "50%": { opacity: "1", transform: "scale(1.3) rotate(45deg)" },
        },
        float: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(30px, -30px) scale(1.05)" },
          "50%": { transform: "translate(-20px, 20px) scale(0.95)" },
          "75%": { transform: "translate(-30px, -20px) scale(1.02)" },
        },
        waveRing: {
          "0%": { width: "100%", height: "100%", opacity: "0.4" },
          "100%": { width: "180%", height: "180%", opacity: "0" },
        },
        shine: {
          "0%, 100%": { transform: "translateX(-100%) rotate(45deg)" },
          "50%": { transform: "translateX(100%) rotate(45deg)" },
        },
        softPulse: {
          "0%, 100%": {
            boxShadow:
              "0 0 0 0 rgba(255,255,255,0.4), 0 4px 20px rgba(255,255,255,0.2)",
          },
          "50%": {
            boxShadow:
              "0 0 0 15px rgba(255,255,255,0), 0 8px 35px rgba(255,255,255,0.4)",
          },
        },
        softPulseLight: {
          "0%, 100%": {
            boxShadow: "0 0 0 0 rgba(0,0,0,0.1), 0 4px 20px rgba(0,0,0,0.1)",
          },
          "50%": {
            boxShadow: "0 0 0 15px rgba(0,0,0,0), 0 8px 35px rgba(0,0,0,0.2)",
          },
        },
        pulse: {
          "0%, 100%": { opacity: "0.5", transform: "scale(1)" },
          "50%": { opacity: "0.2", transform: "scale(1.1)" },
        },
        slideDownMenu: {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        lunaPulse: {
          "0%, 100%": {
            transform: "translate(-50%, -50%) scale(1)",
            opacity: "0.3",
          },
          "50%": {
            transform: "translate(-50%, -50%) scale(1.1)",
            opacity: "0.5",
          },
        },
        lunaFloat: {
          "0%, 100%": { transform: "translateY(0) scale(1)", opacity: "0.3" },
          "50%": { transform: "translateY(-10px) scale(1.2)", opacity: "0.7" },
        },
        "pulse-lilac": {
          "0%, 100%": {
            transform: "scale(1)",
            boxShadow: "0 0 0 0 rgba(197,138,249,0.7)",
          },
          "50%": {
            transform: "scale(1.05)",
            boxShadow: "0 0 20px 5px rgba(197,138,249,0.4)",
          },
        },
        "pulse-lilac-banner": {
          "0%, 100%": {
            background: "rgba(197,138,249,0.15)",
            boxShadow: "0 0 0 0 rgba(197,138,249,0.2)",
          },
          "50%": {
            background: "rgba(197,138,249,0.25)",
            boxShadow: "0 0 15px 5px rgba(197,138,249,0.15)",
          },
        },
      },
    },
  },
  plugins: [],
};
