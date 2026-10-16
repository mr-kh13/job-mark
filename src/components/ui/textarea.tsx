import * as React from 'react';
import { cn } from '@/utils/cn';

function Textarea({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'textarea'> & {
  /** "ghost" reads as plain text until hovered or focused (table cells). */
  variant?: 'default' | 'ghost';
}) {
  return (
    <textarea
      data-slot="textarea"
      data-variant={variant}
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
        variant === 'ghost' &&
          'border-transparent bg-transparent shadow-none hover:border-input dark:bg-transparent dark:hover:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
