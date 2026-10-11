const { hairlineWidth } = require('nativewind/theme');
const tokens = require('./src/constants/design-tokens.json');
const semantic = ['background', 'foreground', 'border', 'input', 'ring', 'primary-pressed', 'destructive-pressed'];
const paired = ['surface', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'success', 'warning', 'disabled', 'card', 'popover'];
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {
    colors: {
      ...Object.fromEntries(semantic.map(name => [name, 'hsl(var(--' + name + ') / <alpha-value>)'])),
      ...Object.fromEntries(paired.map(name => [name, { DEFAULT: 'hsl(var(--' + name + ') / <alpha-value>)', foreground: 'hsl(var(--' + name + '-foreground) / <alpha-value>)' }])),
    },
    spacing: Object.fromEntries(Object.entries(tokens.spacing).map(([name, value]) => [name, value + 'px'])),
    borderRadius: Object.fromEntries(Object.keys(tokens.radii).map(name => [name, 'var(--radius-' + name + ')'])),
    fontSize: Object.fromEntries(Object.entries(tokens.typography).map(([name, type]) => [name, [type.fontSize + 'px', { lineHeight: type.lineHeight + 'px', fontWeight: type.fontWeight }]])),
    borderWidth: { hairline: hairlineWidth(), DEFAULT: tokens.borders.default + 'px', focus: tokens.borders.focus + 'px' },
    minHeight: { control: tokens.controls.minHeight + 'px' },
    minWidth: { control: tokens.controls.minHeight + 'px' },
  } },
  plugins: [require('tailwindcss-animate')],
};
