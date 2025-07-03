import lineClamp from '@tailwindcss/line-clamp';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}", // adjust to match your project structure
  ],
  theme: {
    extend: {},
  },
  plugins: [lineClamp],
}

