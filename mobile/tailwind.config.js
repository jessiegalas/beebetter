const { hairlineWidth } = require('nativewind/theme');
const semantic = ['background', 'foreground', 'border', 'input', 'ring'];
const paired = ['primary', 'secondary', 'muted', 'accent', 'destructive', 'card', 'popover'];
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {
    colors: {
      ...Object.fromEntries(semantic.map(name => [name, `hsl(var(--${name}))`])),
      ...Object.fromEntries(paired.map(name => [name, { DEFAULT: `hsl(var(--${name}))`, foreground: `hsl(var(--${name}-foreground))` }])),
    },
    borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    borderWidth: { hairline: hairlineWidth() },
  } },
  plugins: [require('tailwindcss-animate')],
};
