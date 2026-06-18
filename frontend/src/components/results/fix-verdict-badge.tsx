"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FixVerdictBadgeProps {
  verdict: string;
}

const VERDICT_CONFIG: Record<string, { label: string; style: string; icon: React.ReactNode }> = {
  FIX_SUCCESSFUL: {
    label: "Fixed",
    style: "bg-[#6C63FF]/10 text-[#6C63FF] shadow-[inset_2px_2px_4px_rgba(108,99,255,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.3)]",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  PARTIALLY_FIXED: {
    label: "Partial",
    style: "bg-[#D69E2E]/10 text-[#D69E2E] shadow-[inset_2px_2px_4px_rgba(214,158,46,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.3)]",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  FIX_FAILED: {
    label: "Failed",
    style: "bg-[#DC2626]/10 text-[#DC2626] shadow-[inset_2px_2px_4px_rgba(220,38,38,0.1),inset_-2px_-2px_4px_rgba(255,255,255,0.3)]",
    icon: <XCircle className="h-3 w-3" />,
  },
};

export function FixVerdictBadge({ verdict }: FixVerdictBadgeProps) {
  const config = VERDICT_CONFIG[verdict];
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        config.style
      )}
    >
      {config.icon}
      {config.label}
    </span>
  );
}
