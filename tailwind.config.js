/** @type {import('tailwindcss').Config} */
export default {
  // Tell Tailwind which files to scan for class names.
  // It removes unused styles in production, keeping the CSS bundle tiny.
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
