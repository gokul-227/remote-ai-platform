/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0a66c2',
          foreground: '#ffffff'
        },
        secondary: '#4f46e5',
        accent: '#0284c7',
        background: '#f3f4f6',
        foreground: '#0f172a'
      }
    }
  },
  plugins: []
};
