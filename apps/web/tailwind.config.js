/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0ea5e9',
          foreground: '#ffffff'
        },
        secondary: '#6366f1',
        accent: '#a78bfa',
        background: '#0b0f19',
        foreground: '#f1f5f9'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};
