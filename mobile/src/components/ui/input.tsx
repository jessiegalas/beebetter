import { useState } from 'react';
import { Borders, Fonts, useBeePalette } from '@/constants/theme';
import { cn } from '@/lib/utils';
import { Platform, TextInput } from 'react-native';

function Input({ className, style, onFocus, onBlur, ...props }: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  const palette = useBeePalette();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      className={cn(
        'border-input bg-card text-foreground flex min-h-control w-full min-w-0 flex-row items-center rounded-md border px-lg py-md text-body',
        props.editable === false && 'bg-disabled text-disabled-foreground',
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none',
            'focus-visible:ring-ring focus-visible:ring-[2px]',
            'aria-invalid:border-destructive'
          ),
        }),
        className
      )}
      placeholderTextColor={palette.muted}
      selectionColor={palette.primary}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      style={[{ fontFamily: Fonts.sans, borderWidth: Borders.focus }, focused && { borderColor: palette.focus }, style]}
      {...props}
    />
  );
}
export { Input };
