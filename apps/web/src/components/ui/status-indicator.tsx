import React from "react";
import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  state: "active" | "down" | "fixing" | "idle";
  color?: string;
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  labelClassName?: string;
}

const getStateStyles = (state: StatusIndicatorProps["state"]) => {
  switch (state) {
    case "active":
      return {
        dot: "bg-[var(--accent-interactive)]",
        ping: "bg-[var(--accent-edge)]"
      };
    case "down":
      return {
        dot: "bg-[var(--status-danger-ink)]",
        ping: "bg-[var(--status-danger-wash)]"
      };
    case "fixing":
      return {
        dot: "bg-[var(--status-warning-ink)]",
        ping: "bg-[var(--status-warning-wash)]"
      };
    case "idle":
    default:
      return {
        dot: "bg-[var(--ink-tertiary)]",
        ping: "bg-[var(--border-hairline)]"
      };
  }
};

const getSizeClasses = (size: StatusIndicatorProps["size"]) => {
  switch (size) {
    case "sm":
      return { dot: "h-1.5 w-1.5", ping: "h-1.5 w-1.5" };
    case "lg":
      return { dot: "h-3 w-3", ping: "h-3 w-3" };
    case "md":
    default:
      return { dot: "h-2 w-2", ping: "h-2 w-2" };
  }
};

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  state = "idle",
  color,
  label,
  className,
  size = "md",
  labelClassName
}) => {
  const shouldAnimate =
    state === "active" || state === "fixing" || state === "down";
  const styles = getStateStyles(state);
  const sizeClasses = getSizeClasses(size);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex items-center">
        {shouldAnimate && (
          <span
            className={cn(
              "absolute inline-flex rounded-full opacity-60 animate-ping",
              sizeClasses.ping,
              styles.ping
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            sizeClasses.dot,
            color ?? styles.dot
          )}
        />
      </div>
      {label && (
        <p
          className={cn(
            "text-[var(--type-body-sm)] text-[var(--ink-secondary)] font-medium",
            labelClassName
          )}
        >
          {label}
        </p>
      )}
    </div>
  );
};

export default StatusIndicator;
