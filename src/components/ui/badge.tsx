import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const badgeVariants = cva('pill', {
  variants: {
    variant: {
      default: 'pill-neutral',
      ok: 'pill-ok',
      danger: 'pill-danger',
      warn: 'pill-warn',
      neutral: 'pill-neutral',
    },
    size: {
      default: '',
      lg: 'pill-lg',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

