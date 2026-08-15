/** @type {import('tailwindcss').Config} */
// The real design tokens live in src/app/globals.css as CSS custom
// properties (--color-brand, --bg-page, etc.), consumed via arbitrary-value
// classes (bg-[var(--bg-page)]) or the .card-enterprise/.btn-*/.badge-*
// primitives — not via Tailwind's theme.extend. A parallel color palette
// used to live here with different hex values than globals.css and zero
// real usage anywhere in the codebase (confirmed by grep); removed rather
// than left as a second, drifting source of truth.
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
