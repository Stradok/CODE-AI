"use client";

import { cn } from "@/lib/utils";

interface SeverityBadgeProps {
  level: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
  High: "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30",
  Medium: "bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30",
  Low: "bg-green-500/15 text-green-400 ring-1 ring-green-500/30",
};

export function SeverityBadge({ level }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        SEVERITY_STYLES[level] ?? "bg-muted/50 text-muted-foreground ring-1 ring-border"
      )}
    >
      {level}
    </span>
  );
}
