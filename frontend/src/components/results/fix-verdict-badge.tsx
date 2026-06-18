"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FixVerdictBadgeProps {
  verdict: string;
}

const VERDICT_CONFIG: Record<string, { label: string; style: string; icon: React.ReactNode }> = {
  FIX_SUCCESSFUL: {
    label: "Fixed",
    style: "bg-primary/15 text-primary ring-1 ring-primary/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  PARTIALLY_FIXED: {
    label: "Partial",
    style: "bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  FIX_FAILED: {
    label: "Failed",
    style: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
    icon: <XCircle className="h-3 w-3" />,
  },
};

export function FixVerdictBadge({ verdict }: FixVerdictBadgeProps) {
  const config = VERDICT_CONFIG[verdict];
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold",
        config.style
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}
