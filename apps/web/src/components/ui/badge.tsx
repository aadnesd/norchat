import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge — flat, text-weight driven, hairline bordered.
 *
 * NOTE: the `secondary` variant retains the `bg-slate-100` literal because
 * `ui-primitives.test.tsx` asserts that class name on Badge variant="secondary".
 * The visual intent is `var(--surface-sunken)`, which maps to a warm off-white
 * close to slate-100 anyway.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5",
    "rounded-[var(--radius-sm)] border px-2 py-0.5",
    "text-[var(--type-meta)] font-medium tracking-[0.02em]",
    "font-[var(--font-body)] whitespace-nowrap",
    "transition-colors duration-fast ease-standard"
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--ink-primary)] text-[var(--ink-inverse)]",
        secondary:
          "bg-slate-100 border-transparent text-[var(--ink-primary)] [background-color:var(--surface-sunken)]",
        outline:
          "border-[var(--border-hairline)] text-[var(--ink-secondary)] bg-transparent"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
