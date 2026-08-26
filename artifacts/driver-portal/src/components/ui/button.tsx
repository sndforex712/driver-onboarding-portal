import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-2xl text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 min-h-[52px] px-5',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border-2 border-border bg-transparent hover:bg-muted',
        ghost: 'bg-transparent hover:bg-muted',
      },
      full: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', full: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, full, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, full }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
