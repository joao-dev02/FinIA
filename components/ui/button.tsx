import type { ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
export const buttonVariants = cva('button', {
  variants: { variant: { default: '', outline: 'button-outline' }, size: { default: '', icon: 'button-icon' } },
  defaultVariants: { variant: 'default', size: 'default' }
});
export function Button({ className, variant, size, asChild = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
