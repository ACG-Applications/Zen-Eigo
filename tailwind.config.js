/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}" // Keeps your current root-level files working
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}