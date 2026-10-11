import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import tokens from '@/constants/design-tokens.json';

// Named type sizes and border widths must not be mistaken for color utilities.
const merge = extendTailwindMerge({
  extend: {
    theme: { spacing: [...Object.keys(tokens.spacing), 'control'] },
    classGroups: {
      'font-size': [{ text: Object.keys(tokens.typography) }],
      'border-w': [{ border: ['focus'] }],
      rounded: [{ rounded: ['pill'] }],
    },
  },
});
export function cn(...inputs: ClassValue[]) { return merge(clsx(inputs)); }
