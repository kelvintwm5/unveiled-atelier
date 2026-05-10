// PostCSS processes CSS. These two plugins are required by Tailwind —
// tailwindcss generates the utility classes, autoprefixer adds vendor
// prefixes so styles work across different browsers.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
