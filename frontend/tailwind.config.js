/*
 * Every colour the app uses resolves to a CSS variable defined in
 * src/assets/main.css. Light values are Tailwind's own, so the light theme is
 * unchanged; the `.dark` class on <html> swaps the variables, which is what
 * lets every existing utility class follow the theme without a `dark:` twin.
 */
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (name) =>
  Object.fromEntries(STEPS.map((step) => [step, `rgb(var(--${name}-${step}) / <alpha-value>)`]));
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /*
         * The brand 600 step is the primary button background and carries
         * white text, so it has to clear 4.5:1 for WCAG AA. The original
         * #ea580c managed only 3.55:1, which axe reports as a serious
         * violation on every screen with a primary action. Darkening the top
         * of the scale keeps the orange identity and takes 600 to 5.2:1.
         */
        brand: scale('brand'),
        slate: scale('slate'),
        red: scale('red'),
        amber: scale('amber'),
        emerald: scale('emerald'),
        sky: scale('sky'),
        blue: scale('blue'),
        indigo: scale('indigo'),
        violet: scale('violet'),
        teal: scale('teal'),

        /* Semantic tokens: solid fills that carry white text in both themes. */
        surface: token('surface'),
        primary: { DEFAULT: token('primary'), hover: token('primary-hover') },
        danger: { DEFAULT: token('danger'), hover: token('danger-hover') },
        success: token('success'),
      },
      fontFamily: {
        sans: [
          'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto',
          'Helvetica Neue', 'Arial', 'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        raised: '0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
};
