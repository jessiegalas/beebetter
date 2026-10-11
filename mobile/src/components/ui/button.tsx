import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { useState } from 'react';
import { useBeePalette } from '@/constants/theme';
import { Platform, Pressable } from 'react-native';

const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-md border-focus border-transparent shadow-none',
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive outline-none transition-colors motion-reduce:transition-none focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    })
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary active:bg-primary-pressed',
          Platform.select({ web: 'hover:bg-primary-pressed' })
        ),
        destructive: cn(
          'bg-destructive active:bg-destructive-pressed',
          Platform.select({
            web: 'hover:bg-destructive-pressed focus-visible:ring-ring',
          })
        ),
        outline: cn(
          'border-input bg-card active:bg-secondary',
          Platform.select({
            web: 'hover:bg-secondary',
          })
        ),
        secondary: cn(
          'bg-secondary active:bg-muted',
          Platform.select({ web: 'hover:bg-muted' })
        ),
        ghost: cn(
          'active:bg-secondary',
          Platform.select({ web: 'hover:bg-secondary' })
        ),
        link: '',
      },
      size: {
        default: cn('min-h-control px-lg py-md', Platform.select({ web: 'has-[>svg]:px-3' })),
        sm: cn('min-h-control gap-sm rounded-md px-md py-md', Platform.select({ web: 'has-[>svg]:px-2.5' })),
        lg: cn('min-h-control rounded-md px-xl py-lg', Platform.select({ web: 'has-[>svg]:px-4' })),
        icon: 'min-h-control min-w-control',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonTextVariants = cva(
  cn(
    'text-foreground text-label',
    Platform.select({ web: 'pointer-events-none transition-colors' })
  ),
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        destructive: 'text-destructive-foreground',
        outline: cn(
          'group-active:text-foreground',
          Platform.select({ web: 'group-hover:text-foreground' })
        ),
        secondary: 'text-secondary-foreground',
        ghost: 'group-active:text-foreground',
        link: cn(
          'text-primary group-active:underline',
          Platform.select({ web: 'underline-offset-4 hover:underline group-hover:underline' })
        ),
      },
      size: {
        default: '',
        sm: '',
        lg: '',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonProps = React.ComponentProps<typeof Pressable> & React.RefAttributes<typeof Pressable> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, style, onFocus, onBlur, ...props }: ButtonProps) {
  const palette = useBeePalette();
  const [focused, setFocused] = useState(false);
  const focusStyle = focused ? { borderColor: variant === undefined || variant === 'default' ? palette.primaryForeground : variant === 'destructive' ? palette.dangerForeground : palette.focus } : undefined;
  return (
    <TextClassContext.Provider value={props.disabled ? 'text-disabled-foreground text-label' : buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(buttonVariants({ variant, size }), props.disabled && 'bg-disabled active:bg-disabled hover:bg-disabled', className)}
        onFocus={event => { setFocused(true); onFocus?.(event); }}
        onBlur={event => { setFocused(false); onBlur?.(event); }}
        style={state => [typeof style === 'function' ? style(state) : style, focusStyle]}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
