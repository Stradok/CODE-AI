"use client";

import { cn } from "@/lib/utils";

interface SeverityBadgeProps {
  level: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  Critical: "bg-[#DC2626]/10 text-[#DC2626] shadow-[inset_2px_2px_4px_rgba(220,38,38,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.3)]",
  High: "bg-[#ED8936]/10 text-[#ED8936] shadow-[inset_2px_2px_4px_rgba(237,137,54,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.3)]",
  Medium: "bg-[#D69E2E]/10 text-[#D69E2E] shadow-[inset_2px_2px_4px_rgba(214,158,46,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.3)]",
  Low: "bg-[#38A169]/10 text-[#38A169] shadow-[inset_2px_2px_4px_rgba(56,161,105,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.3)]",
};

export function SeverityBadge({ level }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        SEVERITY_STYLES[level] ?? "bg-[#E0E5EC] text-[#6B7280] shadow-[inset_2px_2px_4px_rgb(163,177,198,0.6),inset_-2px_-2px_4px_rgba(255,255,255,0.5)]"
      )}
    >
      {level}
    </span>
  );
}
