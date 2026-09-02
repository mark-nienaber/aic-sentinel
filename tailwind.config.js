/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ping: { orange: '#f26522', dark: '#1a1a2e' }
      }
    }
  },
  plugins: []
};
