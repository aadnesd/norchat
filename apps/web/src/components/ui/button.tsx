import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[var(--radius-md)] text-[var(--type-body-sm)] font-medium",
    "font-[var(--font-body)]",
    "transition-colors duration-fast ease-standard",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-paper)]",
    "disabled:pointer-events-none disabled:opacity-50"
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ink-primary)] text-[var(--ink-inverse)] hover:bg-[var(--accent-ink)]",
        secondary:
          "bg-transparent text-[var(--ink-primary)] border border-[var(--border-hairline)] hover:bg-[var(--surface-sunken)] hover:border-[var(--border-strong)]",
        outline:
          "border border-[var(--border-hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)] hover:border-[var(--border-strong)]",
        ghost:
          "bg-transparent text-[var(--ink-primary)] hover:bg-[var(--surface-sunken)]"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-6"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
