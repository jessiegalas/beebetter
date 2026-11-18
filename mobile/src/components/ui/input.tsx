import { cn } from '@/lib/utils';
import { AppFont } from '@/constants/theme';
import { Platform, TextInput } from 'react-native';

function Input({ className, style, ...props }: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'min-h-control w-full min-w-0 rounded-md border-focus border-input bg-card px-lg py-md text-body text-foreground',
        props.editable === false &&
        cn(
          'opacity-50',
          Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
        ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow]',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
          ),
          native: 'placeholder:text-muted-foreground/50',
        }),
        className
      )}
      style={[{ fontFamily: AppFont }, style]}
      {...props}
    />
  );
}

export { Input };
