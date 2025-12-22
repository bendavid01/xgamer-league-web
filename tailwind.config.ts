import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ADD THIS SECTION 👇
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))', // Allows grid-cols-16
      },
      // END ADDITION 👆
      colors: {
        void: "#020617", 
        glass: {
          surface: "rgba(15, 23, 42, 0.6)",
          border: "rgba(30, 41, 59, 0.8)",
        },
        neon: {
          cyan: "#22d3ee",
          purple: "#a855f7",
          pink: "#f472b6",
        },
      },
      backgroundImage: {
        "cyber-grid": "linear-gradient(to right, #1e293b 1px, transparent 1px), linear-gradient(to bottom, #1e293b 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
export default config;