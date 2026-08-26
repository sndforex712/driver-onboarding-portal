import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'warn' | 'good' | 'info' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  warn: 'bg-amber-100 text-amber-900',
  good: 'bg-emerald-100 text-emerald-900',
  info: 'bg-sky-100 text-sky-900',
  danger: 'bg-red-100 text-red-900',
};

export function Pill({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
